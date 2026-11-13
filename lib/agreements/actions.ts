"use server";

// Every change to an agreement goes through here. The session says who's acting; the document
// is rendered and hashed here (never trusted from the browser); then one agreement_* SQL function
// makes the change in a single transaction (supabase/migrations/20261113_agreements.sql).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESIGN_CONSENT, TEMPLATES } from "@/lib/agreements/templates";
import { cleanFields, missingFields, renderAgreement } from "@/lib/agreements/render";
import { sanitizeFields, todayPacific } from "@/lib/agreements/fields";
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

  const m = match as { started_at: string; joey: { full_name: string | null } | null } | null;
  const source: Record<Prefill, Fields[string]> = {
    today: todayPacific(),
    host_name: host?.full_name ?? null,
    joey_name: m?.joey?.full_name ?? null,
    host_address: (hsa?.draft_fields as Fields | undefined)?.host_address ?? null,
    hourly_rate: terms?.hourly_rate_cents ?? null,
    monthly_rent: terms?.monthly_rent_cents ?? null,
    match_start: m ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(m.started_at)) : null,
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
  const { uid } = await actor();
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
