// Host applications ↔ Clarify. Mirrors the Joey sync in lib/clarify/sync.ts:
//   Portal → Clarify: on submit, the Host's Person record and a c_host record at Assignment, with the
//   same fields the Tally handler (api/host-apply.js) sends. Retried by the cron if it fails.
//   Clarify → portal: the c_host stage, read when the Host opens their page and polled by the cron.
//
// Hosts who filled in the Tally form before signing up already have a c_host record. That record is
// found by email and updated instead of making a second one, and its stage is left alone.
//
// All functions here take the service-role client (lib/supabase/admin.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOST, HOST_INITIAL_STAGE } from "@/lib/clarify/config";
import { emailsOf } from "@/lib/clarify/matches";
import {
  clarifyConfigured,
  createRecord,
  getRecord,
  listResources,
  listUpdatedAfter,
  readSelect,
  readUpdatedAt,
  updateRecord,
  upsertPersonByEmail,
  type ClarifyRecord,
} from "@/lib/clarify/client";
import { CHILDCARE, MEDICAL, OTHER } from "@/lib/host/application";
import { lookupZip } from "@/lib/host/zips";

type Admin = SupabaseClient;

const items = (values: string[]) => ({ items: values });

/** Leave out empty values so a push never blanks a field the team filled in. */
function dropEmpty(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first_name: first, last_name: rest.join(" ") || null };
}

/** The c_host record already in Clarify for this email (from the Tally form or the team), if any. */
async function findHostRecord(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  const res = await listResources(HOST.object, { [`filter[${HOST.email}][Contains]`]: address }, 10);
  return res.data.find((h) => emailsOf(h.attributes[HOST.email]).includes(address))?.id ?? null;
}

// ─────────────────────────────────────────────
// Portal → Clarify
// ─────────────────────────────────────────────

export async function pushHostApplication(admin: Admin, hostId: string): Promise<{ ok: boolean; error?: string }> {
  if (!clarifyConfigured()) return { ok: false, error: "Clarify isn't configured" };
  const startedAt = new Date().toISOString();

  try {
    const [{ data: app, error: appErr }, { data: profile, error: profErr }] = await Promise.all([
      admin.from("host_applications").select("*").eq("host_id", hostId).single(),
      admin.from("profiles").select("email, clarify_person_id").eq("id", hostId).single(),
    ]);
    if (appErr) throw appErr;
    if (profErr) throw profErr;
    if (app.status !== "submitted") return { ok: false, error: "Application isn't submitted" };

    // 1. Person (matched on email)
    const person = await upsertPersonByEmail(
      dropEmpty({
        name: dropEmpty(splitName(app.full_name ?? "")),
        email_addresses: items([profile.email]),
        phone_numbers: items(app.phone ? [app.phone] : []),
      }),
    );
    if (person.id !== profile.clarify_person_id) {
      const { error } = await admin.from("profiles").update({ clarify_person_id: person.id }).eq("id", hostId);
      if (error) throw error;
    }

    // 2. Host record: the same fields as the Tally handler
    const helpTypes = (app.help_types ?? []) as string[];
    const location = lookupZip(app.zip_code);
    if (app.zip_code && !location) console.warn(`[clarify] zip "${app.zip_code}" isn't in the lookup; host saved without coordinates`);
    const helpDetails = helpTypes.includes(OTHER) ? app.help_details : null;
    const attributes = dropEmpty({
      [HOST.name]: app.full_name,
      [HOST.email]: profile.email,
      [HOST.phone]: app.phone,
      [HOST.zip]: location?.zip ?? app.zip_code,
      [HOST.latitude]: location?.lat,
      [HOST.longitude]: location?.lng,
      [HOST.helpTypes]: helpTypes.length ? items(helpTypes) : null,
      [HOST.weeklyHours]: app.weekly_hours,
      [HOST.childcare]: helpTypes.includes(CHILDCARE) ? app.childcare_need : null,
      [HOST.medical]: helpTypes.includes(MEDICAL) ? app.medical_needs : null,
      // Tally sends the "Other" answer to both fields.
      [HOST.otherHelp]: helpDetails,
      [HOST.helpDetails]: helpDetails,
      [HOST.amenities]: items(app.amenities ?? []),
    });

    let recordId = (app.clarify_host_id as string | null) ?? (await findHostRecord(profile.email));
    if (recordId) {
      // Already in Clarify: answers are updated; the stage is the team's.
      await updateRecord(HOST.object, recordId, attributes);
    } else {
      const created = await createRecord(
        HOST.object,
        { ...attributes, [HOST.stage]: HOST_INITIAL_STAGE },
        [{ field: HOST.personLink, entity: "person", id: person.id }],
      );
      recordId = created.id;
    }

    // A change made while this ran has a later requested_at, so it stays pending.
    const { error } = await admin
      .from("host_applications")
      .update({ clarify_host_id: recordId, clarify_synced_at: startedAt, clarify_sync_error: null })
      .eq("host_id", hostId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[clarify] host push failed", hostId, error);
    await admin.from("host_applications").update({ clarify_sync_error: error.slice(0, 1000) }).eq("host_id", hostId);
    return { ok: false, error };
  }
}

/** Retries every submitted Host application Clarify hasn't received yet. */
export async function pushPendingHostApplications(admin: Admin) {
  const { data, error } = await admin
    .from("host_applications")
    .select("host_id, clarify_sync_requested_at, clarify_synced_at")
    .eq("status", "submitted")
    .not("clarify_sync_requested_at", "is", null)
    .limit(500);
  if (error) throw error;

  const pending = (data ?? []).filter((a) => !a.clarify_synced_at || a.clarify_sync_requested_at > a.clarify_synced_at);
  const results = { pushed: 0, failed: 0 };
  for (const a of pending) {
    const r = await pushHostApplication(admin, a.host_id);
    if (r.ok) results.pushed++;
    else results.failed++;
  }
  return results;
}

// ─────────────────────────────────────────────
// Clarify → portal: stage
// ─────────────────────────────────────────────

async function applyHostStage(admin: Admin, hostId: string, record: ClarifyRecord) {
  const value = readSelect(record.attributes[HOST.stage]);
  if (!value) return "empty";
  const { data, error } = await admin.rpc("apply_clarify_host_stage", {
    p_host: hostId,
    p_clarify_value: value,
    p_at: readUpdatedAt(record) ?? new Date().toISOString(),
  });
  if (error) throw error;
  if (data === "unmapped") console.warn(`[clarify] host stage "${value}" isn't in host_application_stages.clarify_values`);
  return data as string;
}

/** Reads one Host's stage from Clarify, at most once per maxAgeMs. */
export async function refreshHostStage(admin: Admin, hostId: string, maxAgeMs = 2 * 60_000) {
  const { data: app } = await admin
    .from("host_applications")
    .select("status, clarify_host_id, clarify_stage_checked_at")
    .eq("host_id", hostId)
    .maybeSingle();
  if (!app || app.status !== "submitted" || !app.clarify_host_id) return "skipped";
  if (app.clarify_stage_checked_at && Date.now() - Date.parse(app.clarify_stage_checked_at) < maxAgeMs) return "fresh";

  await admin
    .from("host_applications")
    .update({ clarify_stage_checked_at: new Date().toISOString() })
    .eq("host_id", hostId);
  return applyHostStage(admin, hostId, await getRecord(HOST.object, app.clarify_host_id));
}

/** Catches up on every Host record changed in Clarify since the last poll. */
export async function pollHostStages(admin: Admin) {
  if (!clarifyConfigured()) return { skipped: "not_configured" };

  const pollStartedAt = new Date().toISOString();
  const { data: cursorRow } = await admin.from("sync_state").select("value").eq("key", "clarify_host_stage_cursor").maybeSingle();
  // Overlap by a minute so edits made during the last poll aren't missed.
  const since = cursorRow?.value
    ? new Date(Date.parse(cursorRow.value) - 60_000).toISOString()
    : new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const counts: Record<string, number> = {};
  for (let offset = 0; offset < 10_000; offset += 100) {
    const { records, hasMore } = await listUpdatedAfter(HOST.object, since, offset);
    if (records.length > 0) {
      const { data: apps, error } = await admin
        .from("host_applications")
        .select("host_id, clarify_host_id")
        .in("clarify_host_id", records.map((r) => r.id));
      if (error) throw error;
      const byRecord = new Map((apps ?? []).map((a) => [a.clarify_host_id as string, a.host_id as string]));
      for (const r of records) {
        const hostId = byRecord.get(r.id);
        // Most Hosts in Clarify have no portal application.
        if (!hostId) continue;
        const result = await applyHostStage(admin, hostId, r);
        counts[result] = (counts[result] ?? 0) + 1;
      }
    }
    if (!hasMore) break;
  }

  await admin
    .from("sync_state")
    .upsert({ key: "clarify_host_stage_cursor", value: pollStartedAt, updated_at: pollStartedAt });
  return counts;
}

/** When a Host opens their application: retry their push if it's pending, then read their latest stage. */
export async function syncHostOnVisit(hostId: string) {
  if (!clarifyConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: app } = await admin
      .from("host_applications")
      .select("status, clarify_sync_requested_at, clarify_synced_at")
      .eq("host_id", hostId)
      .maybeSingle();
    if (!app || app.status !== "submitted") return;
    if (app.clarify_sync_requested_at && (!app.clarify_synced_at || app.clarify_sync_requested_at > app.clarify_synced_at)) {
      await pushHostApplication(admin, hostId);
    }
    await refreshHostStage(admin, hostId);
  } catch (e) {
    // Never block the page on Clarify.
    console.error("[clarify] host sync on visit failed", hostId, e);
  }
}
