"use server";

// Every change to an agreement goes through here. The session says who's acting; the document
// is rendered and hashed here (never trusted from the browser); then one agreement_* SQL function
// makes the change in a single transaction (supabase/migrations/20261113_agreements.sql).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AMENDS, ESIGN_CONSENT, TEMPLATES } from "@/lib/agreements/templates";
import { SCHEDULE_LABELS, formatShort, type PayScheduleKind } from "@/lib/timesheets";
import { cleanFields, missingFields, renderAgreement } from "@/lib/agreements/render";
import { isNotice, sanitizeFields, todayPacific } from "@/lib/agreements/fields";
import { hashRendered } from "@/lib/agreements/hash";
import type { AgreementKind, Fields, Prefill, Template } from "@/lib/agreements/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function actor() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  const h = await headers();
  return {
    uid: data.user.id,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    ua: h.get("user-agent"),
  };
}

/** Messages raised by the agreement_* functions are written for people; anything else isn't. */
function fail(e: { message?: string } | null | undefined, fallback: string): { ok: false; error: string } {
  const msg = e?.message ?? "";
  const ours = msg && !/violates|duplicate key|permission denied|function .* does not exist|syntax/i.test(msg);
  if (!ours) console.error("[agreements]", msg);
  return { ok: false, error: ours ? msg : fallback };
}

function refresh() {
  revalidatePath("/host", "layout");
  revalidatePath("/joey", "layout");
}

async function load(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agreements")
    .select("id, kind, host_id, joey_id, match_id, status, current_version, draft_fields")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    kind: AgreementKind;
    host_id: string;
    joey_id: string | null;
    match_id: string | null;
    status: string;
    current_version: number;
    draft_fields: Fields;
  } | null;
}

function freeze(template: Template, raw: Fields) {
  const fields = cleanFields(template, raw);
  const rendered = renderAgreement(template, fields);
  return { fields, rendered, hash: hashRendered(rendered) };
}

// ─────────────────────────────────────────────
// Prefill
// ─────────────────────────────────────────────

/** The fields of the match's most recent signed agreement of a kind. */
async function signedFields(matchId: string, kind: AgreementKind): Promise<Fields | null> {
  const admin = createAdminClient();
  const { data: a } = await admin
    .from("agreements")
    .select("id, current_version")
    .eq("match_id", matchId)
    .eq("kind", kind)
    .eq("status", "executed")
    .order("executed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!a) return null;
  const { data: v } = await admin
    .from("agreement_versions")
    .select("fields")
    .eq("agreement_id", a.id)
    .eq("version", a.current_version)
    .maybeSingle();
  return (v?.fields as Fields | undefined) ?? null;
}

async function prefill(kind: AgreementKind, hostId: string, matchId: string | null): Promise<Fields> {
  const admin = createAdminClient();
  const template = TEMPLATES[kind];
  const [{ data: host }, { data: match }, { data: hsa }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", hostId).single(),
    matchId
      ? admin.from("matches").select("started_at, joey:profiles!matches_joey_id_fkey(full_name)").eq("id", matchId).single()
      : Promise.resolve({ data: null }),
    admin
      .from("agreements")
      .select("draft_fields")
      .eq("host_id", hostId)
      .eq("kind", "host_services")
      .neq("status", "void")
      .maybeSingle(),
  ]);

  let terms: { hourly_rate_cents: number; monthly_rent_cents: number } | null = null;
  if (matchId) {
    const { data } = await admin
      .from("match_terms")
      .select("hourly_rate_cents, monthly_rent_cents")
      .eq("match_id", matchId)
      .eq("status", "accepted")
      .lte("effective_date", todayPacific())
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    terms = data;
  }

  // Dates of the signed agreements an amendment refers to.
  const signedDate = async (base: AgreementKind, key: string) => {
    if (!matchId) return null;
    const fields = await signedFields(matchId, base);
    return (fields?.[key] as string | undefined) ?? null;
  };
  const [offerDate, licenseDate] = await Promise.all([
    template.fields.some((f) => f.prefill === "offer_date") ? signedDate("offer_letter", "offer_date") : null,
    template.fields.some((f) => f.prefill === "license_date") ? signedDate("housing_license", "made_date") : null,
  ]);

  const m = match as { started_at: string; joey: { full_name: string | null } | null } | null;
  const source: Record<Prefill, Fields[string]> = {
    today: todayPacific(),
    host_name: host?.full_name ?? null,
    joey_name: m?.joey?.full_name ?? null,
    host_address: (hsa?.draft_fields as Fields | undefined)?.host_address ?? null,
    hourly_rate: terms?.hourly_rate_cents ?? null,
    monthly_rent: terms?.monthly_rent_cents ?? null,
    match_start: m ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(m.started_at)) : null,
    offer_date: offerDate,
    license_date: licenseDate,
  };

  const out: Fields = {};
  for (const f of template.fields) {
    if (f.prefill && source[f.prefill] !== null) out[f.key] = source[f.prefill];
  }
  if (kind === "housing_license") Object.assign(out, { rent_mode: "amount", deposit_mode: "none", move_in_mode: "start" });
  if (kind === "offer_letter") Object.assign(out, { pto_unit: "days" });
  return out;
}

// ─────────────────────────────────────────────
// Host
// ─────────────────────────────────────────────

/** Starts an offer letter or housing license for one of the Host's active matches. */
export async function createAgreement(kind: AgreementKind, matchId: string): Promise<Result<{ id: string }>> {
  if (kind === "host_services") return { ok: false, error: "The Host Services Agreement is already in your list" };
  if (isNotice(kind)) return { ok: false, error: "Notices are sent by the portal when you change terms or end a match" };
  const { uid } = await actor();
  const base = AMENDS[kind];
  if (base && !(await signedFields(matchId, base))) {
    return { ok: false, error: `Sign the ${TEMPLATES[base].title} with this Joey first. This amends it.` };
  }
  const fields = await prefill(kind, uid, matchId);
  const { data, error } = await createAdminClient().rpc("agreement_create", {
    p_actor: uid,
    p_kind: kind,
    p_match: matchId,
    p_fields: fields,
  });
  if (error) return fail(error, "Couldn't start that agreement. Try again.");
  refresh();
  return { ok: true, id: data as string };
}

/** Makes sure the Host has a Host Services Agreement to sign. Called when they open Agreements. */
export async function ensureHostServices(): Promise<string | null> {
  // Never block the Agreements page on this; the list still loads without it.
  try {
    const { uid } = await actor();
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", uid).single();
    if (profile?.role !== "host") return null;
    const fields = await prefill("host_services", uid, null);
    const { data, error } = await admin.rpc("agreement_create", {
      p_actor: uid,
      p_kind: "host_services",
      p_match: null,
      p_fields: fields,
    });
    if (error) throw error;
    return data as string;
  } catch (e) {
    console.error("[agreements] couldn't set up the Host Services Agreement", e);
    return null;
  }
}

export async function saveAgreementDraft(id: string, input: Record<string, unknown>): Promise<Result<{ savedAt: string }>> {
  const { uid } = await actor();
  const a = await load(id);
  if (!a || a.host_id !== uid) return { ok: false, error: "Agreement not found" };
  const fields = sanitizeFields(TEMPLATES[a.kind], input);
  const { error } = await createAdminClient().rpc("agreement_save_draft", { p_actor: uid, p_id: id, p_fields: fields });
  if (error) return fail(error, "Couldn't save your changes. Try again.");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Freezes the current draft as a new version and sends it to the Joey. */
export async function sendAgreement(id: string, input: Record<string, unknown>, note?: string): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const a = await load(id);
  if (!a || a.host_id !== uid) return { ok: false, error: "Agreement not found" };
  const template = TEMPLATES[a.kind];
  const raw = sanitizeFields(template, input);
  const missing = missingFields(template, raw);
  if (missing.length) return { ok: false, error: `Fill in: ${missing.map((f) => f.label).join(", ")}` };

  if (isNotice(a.kind)) return { ok: false, error: "Notices are sent by the portal when you change terms or end a match" };
  if (AMENDS[a.kind] && a.match_id) {
    const problem = await amendmentProblem(a.kind, a.match_id, raw);
    if (problem) return { ok: false, error: problem };
  }

  const { fields, rendered, hash } = freeze(template, raw);
  const endsOn = a.kind === "housing_license" && fields.term_mode === "fixed" ? (fields.term_end as string) : null;
  const { error } = await createAdminClient().rpc("agreement_send", {
    p_actor: uid,
    p_id: id,
    p_fields: fields,
    p_rendered: rendered,
    p_hash: hash,
    p_template_version: template.version,
    p_ends_on: endsOn,
    p_note: note ?? null,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't send the agreement. Try again.");
  refresh();
  return { ok: true };
}

/** Why an amendment can't be sent as filled in, if anything. */
async function amendmentProblem(kind: AgreementKind, matchId: string, f: Fields): Promise<string | null> {
  const [oldKey, newKey] = kind === "pay_amendment" ? ["old_rate_cents", "new_rate_cents"] : ["old_rent_cents", "new_rent_cents"];
  if (f[oldKey] === f[newKey]) return "The new amount is the same as the current one.";
  const effective = f.effective_date as string;
  if (effective < todayPacific()) return "The start date can't be in the past. Changes only apply going forward.";
  const { data: locked } = await createAdminClient().rpc("match_locked_through", { p_match_id: matchId });
  if (locked && effective <= (locked as string)) {
    return `Pay through ${formatShort(locked as string)} is already in payroll. Choose a start date after that.`;
  }
  return null;
}

export async function voidAgreement(id: string, reason?: string): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const { error } = await createAdminClient().rpc("agreement_void", {
    p_actor: uid,
    p_id: id,
    p_comment: reason ?? null,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't withdraw the agreement. Try again.");
  refresh();
  return { ok: true };
}

/** The Host fills in and signs their Host Services Agreement; JoeyCo's signature is added. */
export async function signHostServices(id: string, input: Record<string, unknown>, typedName: string): Promise<Result> {
  const signerName = process.env.JOEYCO_SIGNER_NAME;
  const signerTitle = process.env.JOEYCO_SIGNER_TITLE;
  if (!signerName || !signerTitle) {
    console.error("[agreements] JOEYCO_SIGNER_NAME and JOEYCO_SIGNER_TITLE must be set to countersign Host Services Agreements");
    return { ok: false, error: "Signing isn't available yet. Please try again later." };
  }
  const { uid, ip, ua } = await actor();
  const a = await load(id);
  if (!a || a.host_id !== uid || a.kind !== "host_services") return { ok: false, error: "Agreement not found" };
  const template = TEMPLATES.host_services;
  const raw = sanitizeFields(template, input);
  const missing = missingFields(template, raw);
  if (missing.length) return { ok: false, error: `Fill in: ${missing.map((f) => f.label).join(", ")}` };

  const { fields, rendered, hash } = freeze(template, raw);
  const { error } = await createAdminClient().rpc("agreement_sign_host_services", {
    p_actor: uid,
    p_id: id,
    p_fields: fields,
    p_rendered: rendered,
    p_hash: hash,
    p_template_version: template.version,
    p_typed_name: typedName,
    p_joeyco_name: signerName,
    p_joeyco_title: signerTitle,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't save your signature. Try again.");
  refresh();
  return { ok: true };
}

// ─────────────────────────────────────────────
// Joey (and the Host's countersignature)
// ─────────────────────────────────────────────

export async function markAgreementViewed(id: string): Promise<void> {
  const { uid, ip, ua } = await actor();
  const { error } = await createAdminClient().rpc("agreement_mark_viewed", { p_actor: uid, p_id: id, p_ip: ip, p_ua: ua });
  if (error) console.error("[agreements] mark viewed failed", error.message);
}

export async function requestAgreementChanges(id: string, comment: string): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const { error } = await createAdminClient().rpc("agreement_request_changes", {
    p_actor: uid,
    p_id: id,
    p_comment: comment,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't send your request. Try again.");
  refresh();
  return { ok: true };
}

/**
 * The Joey signs a sent agreement, or the Host countersigns one the Joey signed.
 * version and contentHash are what the signer was shown; a newer version rejects the signature.
 */
export async function signAgreement(
  id: string,
  version: number,
  contentHash: string,
  typedName: string,
  addendumAck?: boolean,
): Promise<Result<{ status: string }>> {
  const { uid, ip, ua } = await actor();
  const { data, error } = await createAdminClient().rpc("agreement_sign", {
    p_actor: uid,
    p_id: id,
    p_version: version,
    p_hash: contentHash,
    p_typed_name: typedName,
    p_addendum_ack: addendumAck ?? null,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't save your signature. Try again.");
  refresh();
  return { ok: true, status: data as string };
}

export async function giveEsignConsent(): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const { error } = await createAdminClient().rpc("give_esign_consent", {
    p_actor: uid,
    p_version: ESIGN_CONSENT.version,
    p_ip: ip,
    p_ua: ua,
  });
  if (error) return fail(error, "Couldn't save that. Try again.");
  return { ok: true };
}

/** The Joey acknowledges a notice (there's nothing to sign). */
export async function acknowledgeNotice(id: string): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const { error } = await createAdminClient().rpc("agreement_acknowledge", { p_actor: uid, p_id: id, p_ip: ip, p_ua: ua });
  if (error) return fail(error, "Couldn't save that. Try again.");
  refresh();
  return { ok: true };
}

// ─────────────────────────────────────────────
// Pay schedule changes, with the written notice
// ─────────────────────────────────────────────

const PAYDAY_RULES: Record<PayScheduleKind, (offset: number) => string> = {
  semimonthly: () =>
    "Hours worked from the 1st to the 15th of a month are paid by the 26th, and hours from the 16th to the end of the month are paid by the 10th of the next month.",
  weekly: (n) => `Each pay period runs Monday to Sunday, and payday is ${n} ${n === 1 ? "day" : "days"} after the period ends.`,
  biweekly: (n) => `Each pay period is two weeks, Monday to Sunday, and payday is ${n} ${n === 1 ? "day" : "days"} after the period ends.`,
  monthly: (n) => `Each pay period is a calendar month, and payday is ${n} ${n === 1 ? "day" : "days"} after the month ends.`,
};

/**
 * The Host changes a match's pay schedule. It starts with the first pay period at least 7 days
 * out, and the Joey gets a written notice in Agreements to acknowledge.
 */
export async function changePaySchedule(
  matchId: string,
  kind: PayScheduleKind,
  paydayOffset: number | null,
): Promise<Result<{ from: string }>> {
  const { uid, ip, ua } = await actor();
  const supabase = await createClient();
  const offset = kind === "semimonthly" ? 0 : Math.max(0, Math.min(7, Math.round(paydayOffset ?? 5)));

  const { data: today } = await supabase.rpc("local_today");
  const { data: current } = await supabase
    .from("pay_schedules")
    .select("kind")
    .eq("match_id", matchId)
    .lte("effective_from", today as string)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentKind: PayScheduleKind = current?.kind ?? "semimonthly";

  const { data: from, error } = await supabase.rpc("set_pay_schedule", {
    p_match: matchId,
    p_kind: kind,
    p_payday_offset: kind === "semimonthly" ? null : offset,
  });
  if (error) return fail(error, "Couldn't change the pay schedule. Try again.");

  const names = await partyNames(uid, matchId);
  const issued = await issueNotice("pay_schedule_notice", uid, matchId, ip, ua, {
    notice_date: todayPacific(),
    joey_name: names.joey,
    host_name: names.host,
    old_schedule: SCHEDULE_LABELS[currentKind].toLowerCase(),
    new_schedule: SCHEDULE_LABELS[kind].toLowerCase(),
    effective_date: from as string,
    payday_rule: PAYDAY_RULES[kind](offset),
  });
  if (!issued.ok) return { ok: false, error: `The schedule changed, but ${issued.error}` };
  refresh();
  return { ok: true, from: from as string };
}

async function partyNames(hostId: string, matchId: string) {
  const admin = createAdminClient();
  const [{ data: host }, { data: match }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", hostId).single(),
    admin.from("matches").select("joey:profiles!matches_joey_id_fkey(full_name, email)").eq("id", matchId).single(),
  ]);
  const joey = (match as unknown as { joey: { full_name: string | null; email: string } | null } | null)?.joey;
  return {
    host: host?.full_name || host?.email || "Host",
    joey: joey?.full_name || joey?.email || "Joey",
  };
}

/**
 * Creates and delivers a notice to the Joey. Any earlier notice of the same kind they haven't
 * acknowledged is withdrawn, and the new one replaces it.
 */
async function issueNotice(
  kind: AgreementKind,
  uid: string,
  matchId: string,
  ip: string | null,
  ua: string | null,
  values: Fields,
): Promise<Result<{ id: string }>> {
  const admin = createAdminClient();
  const { data: earlier } = await admin
    .from("agreements")
    .select("id, status")
    .eq("match_id", matchId)
    .eq("kind", kind)
    .neq("status", "void")
    .order("created_at", { ascending: false });
  for (const n of earlier ?? []) {
    if (n.status === "sent") {
      await admin.rpc("agreement_void", { p_actor: uid, p_id: n.id, p_comment: "Replaced by a newer notice", p_ip: ip, p_ua: ua });
    }
  }

  const template = TEMPLATES[kind];
  const { fields, rendered, hash } = freeze(template, values);
  const { data: id, error: createError } = await admin.rpc("agreement_create", {
    p_actor: uid,
    p_kind: kind,
    p_match: matchId,
    p_fields: fields,
  });
  if (createError) return fail(createError, "the notice couldn't be created. Try again.");
  if (earlier?.[0]) await admin.from("agreements").update({ replaces_id: earlier[0].id }).eq("id", id);
  const { error: sendError } = await admin.rpc("agreement_send", {
    p_actor: uid,
    p_id: id,
    p_fields: fields,
    p_rendered: rendered,
    p_hash: hash,
    p_template_version: template.version,
    p_ends_on: null,
    p_note: null,
    p_ip: ip,
    p_ua: ua,
  });
  if (sendError) return fail(sendError, "the notice couldn't be sent. Try again.");
  return { ok: true, id: id as string };
}

// ─────────────────────────────────────────────
// Ending a match, with the written notice the contracts require
// ─────────────────────────────────────────────

/**
 * The Host ends employment on the last day of work and gives notice to move out (at least 7 days,
 * per Offer Letter §4 and Housing License §II). The Joey gets the notice in Agreements.
 */
export async function endMatchWithNotice(
  matchId: string,
  lastDay: string,
  moveOut: string,
  message: string,
): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_match_end", { p_match: matchId, p_last_day: lastDay, p_move_out: moveOut });
  if (error) return fail(error, "Couldn't end the match. Try again.");

  const admin = createAdminClient();
  const [names, license, { data: hsa }, { data: ledger }] = await Promise.all([
    partyNames(uid, matchId),
    signedFields(matchId, "housing_license"),
    admin.from("agreements").select("draft_fields").eq("host_id", uid).eq("kind", "host_services").neq("status", "void").maybeSingle(),
    admin.from("pto_ledger").select("hours").eq("match_id", matchId),
  ]);
  const pto = (ledger ?? []).reduce((sum, r) => sum + Number(r.hours), 0);
  const address =
    (license?.premises_address as string | undefined) ||
    ((hsa?.draft_fields as Fields | undefined)?.host_address as string | undefined) ||
    "your Host's home";

  const issued = await issueNotice("termination_notice", uid, matchId, ip, ua, {
    notice_date: todayPacific(),
    joey_name: names.joey,
    host_name: names.host,
    address,
    last_day: lastDay,
    move_out: moveOut,
    pto_hours: pto > 0 ? `${Math.round(pto * 100) / 100} hours` : "none",
    message: message.trim() || null,
  });
  if (!issued.ok) {
    // Without the written notice the end date isn't valid, so take it back.
    await supabase.rpc("cancel_match_end", { p_match: matchId });
    return { ok: false, error: `Couldn't send the notice, so nothing changed: ${issued.error}` };
  }
  refresh();
  return { ok: true };
}

/** Takes back an ending before the last day of work, and withdraws the notice if it's unread. */
export async function cancelMatchEnd(matchId: string): Promise<Result> {
  const { uid, ip, ua } = await actor();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_match_end", { p_match: matchId });
  if (error) return fail(error, "Couldn't undo that. Try again.");
  const admin = createAdminClient();
  const { data: notices } = await admin
    .from("agreements")
    .select("id, status")
    .eq("match_id", matchId)
    .eq("kind", "termination_notice")
    .eq("status", "sent");
  for (const n of notices ?? []) {
    await admin.rpc("agreement_void", { p_actor: uid, p_id: n.id, p_comment: "The Host withdrew the notice", p_ip: ip, p_ua: ua });
  }
  refresh();
  return { ok: true };
}
