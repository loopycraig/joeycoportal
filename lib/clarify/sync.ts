import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { DISCLOSURE_FIELDS, INITIAL_VALUES, JOEY, MATCH_ATTEMPT, PERSON, REFERENCE, SIGN_UP_VALUES } from "@/lib/clarify/config";
import { isSupportedCity, moveInTimeline } from "@/lib/joey/application";
import {
  clarifyConfigured,
  createRecord,
  deleteRecord,
  getRecord,
  listResources,
  listUpdatedAfter,
  readSelect,
  readUpdatedAt,
  updateRecord,
  upsertPersonByEmail,
  type ClarifyRecord,
} from "@/lib/clarify/client";

// All functions here take the service-role client (lib/supabase/admin.ts).
type Admin = SupabaseClient;

const items = (values: string[]) => ({ items: values });

/** Clarify's Preferred Cities options are our supported cities plus "Other" (as Tally sends it).
 *  Any city outside the list goes as a single "Other"; the city names stay in the portal. */
function clarifyCities(cities: string[]) {
  const ours = cities.filter(isSupportedCity);
  return ours.length < cities.length ? [...ours, "Other"] : ours;
}

/** A timestamp as its calendar date in California (YYYY-MM-DD), for Clarify date fields. */
function pacificDate(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso));
}

/** Acknowledgement signed-at dates and the free-copy choice, for whichever Clarify fields are configured. */
function disclosureAttributes(app: {
  bg_disclosure_signed_at: string | null;
  ca_disclosure_signed_at: string | null;
  ca_report_copy_requested: boolean | null;
  conduct_signed_at: string | null;
}) {
  const pairs: [string | null, unknown][] = [
    [DISCLOSURE_FIELDS.bgSignedAt, pacificDate(app.bg_disclosure_signed_at)],
    [DISCLOSURE_FIELDS.caSignedAt, pacificDate(app.ca_disclosure_signed_at)],
    [DISCLOSURE_FIELDS.caCopyRequested, app.ca_report_copy_requested],
    [DISCLOSURE_FIELDS.conductSignedAt, pacificDate(app.conduct_signed_at)],
  ];
  return Object.fromEntries(pairs.filter((p): p is [string, unknown] => p[0] !== null));
}

// ─────────────────────────────────────────────
// Portal → Clarify: sign-up
// ─────────────────────────────────────────────

/**
 * When someone picks Joey: their Person record (matched on email) and a c_joey record at Sign Up,
 * before they've started the application. Does nothing if the Joey record already exists.
 * Needs their joey_applications row (ensure_my_application makes it).
 */
export async function pushSignUp(admin: Admin, joeyId: string): Promise<{ ok: boolean; error?: string }> {
  if (!clarifyConfigured()) return { ok: false, error: "Clarify isn't configured" };

  try {
    const [{ data: app, error: appErr }, { data: profile, error: profErr }] = await Promise.all([
      admin.from("joey_applications").select("clarify_joey_id, first_name, last_name").eq("joey_id", joeyId).single(),
      admin.from("profiles").select("email, full_name, role, clarify_person_id").eq("id", joeyId).single(),
    ]);
    if (appErr) throw appErr;
    if (profErr) throw profErr;
    if (profile.role !== "joey") return { ok: false, error: "Not a Joey" };
    if (app.clarify_joey_id) return { ok: true };

    const name = profile.full_name?.trim()
      ? splitName(profile.full_name)
      : { first_name: app.first_name, last_name: app.last_name };
    const person = await upsertPersonByEmail(
      dropEmpty({ name: dropEmpty(name), email_addresses: items([profile.email]) }),
    );
    if (person.id !== profile.clarify_person_id) {
      const { error } = await admin.from("profiles").update({ clarify_person_id: person.id }).eq("id", joeyId);
      if (error) throw error;
    }

    const created = await createRecord(
      JOEY.object,
      dropEmpty({
        [JOEY.name]: `${name.first_name ?? ""} ${name.last_name ?? ""}`.trim() || profile.email,
        [JOEY.personLink]: person.id,
        [JOEY.stage]: SIGN_UP_VALUES.stage,
        [JOEY.applicationStatus]: SIGN_UP_VALUES.applicationStatus,
      }),
      [{ field: JOEY.personLink, entity: "person", id: person.id }],
    );
    const { error } = await admin
      .from("joey_applications")
      .update({ clarify_joey_id: created.id, clarify_sync_error: null })
      .eq("joey_id", joeyId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[clarify] sign-up push failed", joeyId, error);
    await admin.from("joey_applications").update({ clarify_sync_error: error.slice(0, 1000) }).eq("joey_id", joeyId);
    return { ok: false, error };
  }
}

/** Retries sign-ups that didn't reach Clarify: draft applications with no Joey record yet. */
export async function pushPendingSignUps(admin: Admin) {
  const { data, error } = await admin
    .from("joey_applications")
    .select("joey_id")
    .eq("status", "draft")
    .is("clarify_joey_id", null)
    .limit(200);
  if (error) throw error;
  const results = { pushed: 0, failed: 0 };
  for (const a of data ?? []) {
    const r = await pushSignUp(admin, a.joey_id);
    if (r.ok) results.pushed++;
    else results.failed++;
  }
  return results;
}

// ─────────────────────────────────────────────
// Portal → Clarify: application answers and references
// ─────────────────────────────────────────────

/**
 * Pushes one Joey's submitted application: their Person record, then their c_joey record
 * (created and linked on the first push, updated after that). Records success or the error.
 */
export async function pushApplication(admin: Admin, joeyId: string): Promise<{ ok: boolean; error?: string }> {
  if (!clarifyConfigured()) return { ok: false, error: "Clarify isn't configured" };
  const startedAt = new Date().toISOString();

  try {
    const [{ data: app, error: appErr }, { data: profile, error: profErr }, { data: refs, error: refErr }] =
      await Promise.all([
        admin.from("joey_applications").select("*").eq("joey_id", joeyId).single(),
        admin.from("profiles").select("id, email, clarify_person_id").eq("id", joeyId).single(),
        admin.from("joey_references").select("*").eq("joey_id", joeyId).order("created_at"),
      ]);
    if (appErr) throw appErr;
    if (profErr) throw profErr;
    if (refErr) throw refErr;
    if (app.status !== "submitted") return { ok: false, error: "Application isn't submitted" };

    // 1. Person (matched on email, like the Tally handler)
    const person = await upsertPersonByEmail(
      dropEmpty({
        name: { first_name: app.first_name, last_name: app.last_name },
        email_addresses: items([profile.email]),
        phone_numbers: items(app.phone ? [app.phone] : []),
        [PERSON.dateOfBirth]: app.date_of_birth,
        [PERSON.newsOptIn]: app.news_opt_in,
      }),
    );
    if (person.id !== profile.clarify_person_id) {
      const { error } = await admin.from("profiles").update({ clarify_person_id: person.id }).eq("id", joeyId);
      if (error) throw error;
    }

    // 2. Joey record
    const joeyAttributes = dropEmpty({
      [JOEY.name]: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim(),
      [JOEY.schoolDegree]: app.school_degree,
      [JOEY.motivation]: app.why_joey,
      [JOEY.hostPreference]: app.host_preference,
      [JOEY.workAuthorization]: app.work_authorized,
      [JOEY.workAuthorizationExplanation]: app.work_authorized === "Other" ? app.work_auth_explanation : null,
      // The bucket is counted from the day of the push; Earliest move-in date is what stays accurate.
      [JOEY.moveInTimeline]: app.move_in_date ? moveInTimeline(app.move_in_date) : app.move_in_timing,
      [JOEY.earliestMoveInDate]: app.move_in_date,
      [JOEY.applicationSource]: app.heard_about,
      [JOEY.codeOfConductSigned]: Boolean(app.conduct_signature),
      [JOEY.preferredTasks]: app.services?.length ? items(app.services) : null,
      [JOEY.preferredCities]: items(clarifyCities(app.preferred_cities ?? [])),
      ...disclosureAttributes(app),
    });

    let joeyRecordId = app.clarify_joey_id as string | null;
    if (joeyRecordId) {
      // Made at sign-up: the first push after submitting moves it from Sign Up to Assignment. Once the
      // team has moved the stage anywhere else, the stage and status are theirs and never sent again.
      const current = readSelect((await getRecord(JOEY.object, joeyRecordId)).attributes[JOEY.stage]);
      const promote =
        current === SIGN_UP_VALUES.stage
          ? { [JOEY.stage]: INITIAL_VALUES.stage, [JOEY.applicationStatus]: INITIAL_VALUES.applicationStatus }
          : {};
      await updateRecord(JOEY.object, joeyRecordId, { ...joeyAttributes, ...promote });
    } else {
      const created = await createRecord(
        JOEY.object,
        {
          ...joeyAttributes,
          [JOEY.personLink]: person.id,
          [JOEY.stage]: INITIAL_VALUES.stage,
          [JOEY.applicationStatus]: INITIAL_VALUES.applicationStatus,
        },
        [{ field: JOEY.personLink, entity: "person", id: person.id }],
      );
      joeyRecordId = created.id;
      const { error } = await admin
        .from("joey_applications")
        .update({ clarify_joey_id: created.id })
        .eq("joey_id", joeyId);
      if (error) throw error;
    }

    // 3. References: a Person for each reference, plus a References record linked to it and the Joey
    for (const r of refs ?? []) {
      const refPerson = await upsertPersonByEmail({
        name: splitName(r.full_name),
        email_addresses: items([r.email]),
        phone_numbers: items([r.phone]),
      });
      if (refPerson.id !== r.clarify_person_id) {
        await admin.from("joey_references").update({ clarify_person_id: refPerson.id }).eq("id", r.id);
      }

      // References added before types were asked for have none, so it's left out rather than blanked.
      const refAttributes = dropEmpty({
        [REFERENCE.name]: r.full_name,
        [REFERENCE.type]: r.reference_type,
        [REFERENCE.email]: r.email,
        [REFERENCE.phone]: r.phone,
        [REFERENCE.bio]: `${r.relationship}. Known for ${r.known_for}.`,
      });
      if (r.clarify_reference_id) {
        await updateRecord(REFERENCE.object, r.clarify_reference_id, refAttributes);
      } else {
        const created = await createRecord(REFERENCE.object, refAttributes, [
          { field: REFERENCE.joeyLink, entity: JOEY.object, id: joeyRecordId },
          { field: REFERENCE.personLink, entity: "person", id: refPerson.id },
        ]);
        const { error } = await admin
          .from("joey_references")
          .update({ clarify_reference_id: created.id })
          .eq("id", r.id);
        if (error) throw error;
      }
    }

    // A change made while this ran has a later requested_at, so it stays pending.
    await admin
      .from("joey_applications")
      .update({ clarify_synced_at: startedAt, clarify_sync_error: null })
      .eq("joey_id", joeyId);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[clarify] push failed", joeyId, error);
    await admin.from("joey_applications").update({ clarify_sync_error: error.slice(0, 1000) }).eq("joey_id", joeyId);
    return { ok: false, error };
  }
}

/** Retries every submitted application with changes Clarify hasn't received yet. */
export async function pushPending(admin: Admin) {
  const { data, error } = await admin
    .from("joey_applications")
    .select("joey_id, clarify_sync_requested_at, clarify_synced_at")
    .eq("status", "submitted")
    .not("clarify_sync_requested_at", "is", null)
    .limit(500);
  if (error) throw error;

  const pending = (data ?? []).filter(
    (a) => !a.clarify_synced_at || a.clarify_sync_requested_at > a.clarify_synced_at,
  );
  const results = { pushed: 0, failed: 0 };
  for (const a of pending) {
    const r = await pushApplication(admin, a.joey_id);
    if (r.ok) results.pushed++;
    else results.failed++;
  }
  return results;
}

// ─────────────────────────────────────────────
// Clarify → portal: stage
// ─────────────────────────────────────────────

/** Reads one Joey's stage from Clarify, at most once per maxAgeMs. Used when the Joey opens their journey. */
export async function refreshStage(admin: Admin, joeyId: string, maxAgeMs = 2 * 60_000) {
  if (!clarifyConfigured()) return "not_configured";

  const { data: app } = await admin
    .from("joey_applications")
    .select("status, clarify_joey_id, clarify_stage_checked_at")
    .eq("joey_id", joeyId)
    .maybeSingle();
  if (!app || app.status !== "submitted" || !app.clarify_joey_id) return "skipped";
  if (app.clarify_stage_checked_at && Date.now() - Date.parse(app.clarify_stage_checked_at) < maxAgeMs) {
    return "fresh";
  }

  await admin
    .from("joey_applications")
    .update({ clarify_stage_checked_at: new Date().toISOString() })
    .eq("joey_id", joeyId);

  try {
    const record = await getRecord(JOEY.object, app.clarify_joey_id);
    return await applyJoeyRecord(admin, joeyId, record);
  } catch (e) {
    console.error("[clarify] stage refresh failed", joeyId, e);
    return "error";
  }
}

/** Applies the stage from a c_joey record id (used by the inbound endpoint). */
export async function refreshStageForJoeyRecord(admin: Admin, recordId: string) {
  const { data: app } = await admin
    .from("joey_applications")
    .select("joey_id")
    .eq("clarify_joey_id", recordId)
    .maybeSingle();
  if (!app) return "unknown_record";
  const record = await getRecord(JOEY.object, recordId);
  return applyJoeyRecord(admin, app.joey_id, record);
}

/** Catches up on every Joey record changed in Clarify since the last poll. */
export async function pollStages(admin: Admin) {
  if (!clarifyConfigured()) return { skipped: "not_configured" };

  const pollStartedAt = new Date().toISOString();
  const { data: cursorRow } = await admin.from("sync_state").select("value").eq("key", "clarify_stage_cursor").maybeSingle();
  // Overlap by a minute so edits made during the last poll aren't missed.
  const since = cursorRow?.value
    ? new Date(Date.parse(cursorRow.value) - 60_000).toISOString()
    : new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const counts: Record<string, number> = {};
  for (let offset = 0; offset < 10_000; offset += 100) {
    const { records, hasMore } = await listUpdatedAfter(JOEY.object, since, offset);
    const withStage = records.filter((r) => readSelect(r.attributes[JOEY.stage]));
    if (withStage.length > 0) {
      const { data: apps, error } = await admin
        .from("joey_applications")
        .select("joey_id, clarify_joey_id")
        .in("clarify_joey_id", withStage.map((r) => r.id));
      if (error) throw error;
      const byRecord = new Map((apps ?? []).map((a) => [a.clarify_joey_id as string, a.joey_id as string]));
      for (const r of withStage) {
        const joeyId = byRecord.get(r.id);
        // Joeys who applied through Tally have no portal application yet, so they're skipped.
        const result = joeyId ? await applyJoeyRecord(admin, joeyId, r) : "not_in_portal";
        counts[result] = (counts[result] ?? 0) + 1;
      }
    }
    if (!hasMore) break;
  }

  await admin
    .from("sync_state")
    .upsert({ key: "clarify_stage_cursor", value: pollStartedAt, updated_at: pollStartedAt });
  return counts;
}

/**
 * Applies a c_joey record's vetting stage. At Match Ready it also reads the Joey's Match Attempts and
 * background check status: meeting a Host is "Matching with Your Host", and a background check in
 * progress is that step's second stage.
 */
async function applyJoeyRecord(admin: Admin, joeyId: string, record: ClarifyRecord) {
  const result = await applyStage(admin, joeyId, record.attributes[JOEY.stage], readUpdatedAt(record));
  if (readSelect(record.attributes[JOEY.stage]) !== "Match Ready") return result;

  const attempts = await listResources(MATCH_ATTEMPT.object, { [`filter[${MATCH_ATTEMPT.joeyLink}]`]: record.id });
  const meeting = attempts.data.some(
    (a) =>
      linksTo(a.attributes[MATCH_ATTEMPT.joeyLink], record.id) &&
      (MATCH_ATTEMPT.liveStatuses as readonly string[]).includes(readSelect(a.attributes[MATCH_ATTEMPT.status]) ?? "") &&
      (MATCH_ATTEMPT.meetingStages as readonly string[]).includes(readSelect(a.attributes[MATCH_ATTEMPT.furthestStage]) ?? ""),
  );
  const bgInProgress = readSelect(record.attributes[JOEY.backgroundCheckStatus]) === "In Progress";
  const key = bgInProgress ? "background_check" : meeting ? "matching" : "approved";

  const { data, error } = await admin.rpc("set_match_ready_stage", {
    p_joey: joeyId,
    p_key: key,
    p_at: new Date().toISOString(),
  });
  if (error) throw error;
  return data === "updated" ? "updated" : result;
}

/** Whether a to-one link (an id, or an object with one) points at this record. */
function linksTo(v: unknown, id: string) {
  if (typeof v === "string") return v === id;
  if (v && typeof v === "object") return (v as { id?: string }).id === id || (v as { _id?: string })._id === id;
  return false;
}

async function applyStage(admin: Admin, joeyId: string, raw: unknown, at: string | null) {
  const value = readSelect(raw);
  if (!value) return "empty";
  const { data, error } = await admin.rpc("apply_clarify_stage", {
    p_joey: joeyId,
    p_clarify_value: value,
    p_at: at ?? new Date().toISOString(),
  });
  if (error) throw error;
  if (data === "unmapped") console.warn(`[clarify] stage "${value}" isn't in application_stages.clarify_values`);
  return data as string;
}

function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first_name: first, last_name: rest.join(" ") || null };
}

/** Removes a reference's record from Clarify when the Joey deletes it. The Person record is kept. */
export async function deleteReferenceRecord(recordId: string) {
  if (!clarifyConfigured()) return;
  try {
    await deleteRecord(REFERENCE.object, recordId);
  } catch (e) {
    console.error(`[clarify] couldn't delete reference record ${recordId}; remove it by hand`, e);
  }
}

/** Leave out empty values so a push never blanks a field the team filled in. */
function dropEmpty(attributes: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  );
}
/** When a Joey opens their journey: retry their push if it's pending, then read their latest stage. */
export async function syncOnVisit(joeyId: string) {
  if (!clarifyConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: app } = await admin
      .from("joey_applications")
      .select("status, clarify_joey_id, clarify_sync_requested_at, clarify_synced_at")
      .eq("joey_id", joeyId)
      .maybeSingle();
    if (!app) return;
    if (app.status === "draft") {
      // A sign-up that didn't reach Clarify.
      if (!app.clarify_joey_id) await pushSignUp(admin, joeyId);
      return;
    }
    if (app.status !== "submitted") return;
    if (app.clarify_sync_requested_at && (!app.clarify_synced_at || app.clarify_sync_requested_at > app.clarify_synced_at)) {
      await pushApplication(admin, joeyId);
    }
    await refreshStage(admin, joeyId);
  } catch (e) {
    // Never block the page on Clarify.
    console.error("[clarify] sync on visit failed", joeyId, e);
  }
}
