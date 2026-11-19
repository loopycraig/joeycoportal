// Clarify → portal: when a Match (deal) reaches Contracting, create the match in the portal so the
// offer letter and housing license can be signed here. Matched keeps it in place. Earlier stages are
// only read (Proposed and Pending on the Matches page), and Completed doesn't end the portal match:
// the Host ends it in the portal, which sends the Joey their written notice.
//
// A Host or Joey without a portal account gets a placeholder: a sign-in account with no password,
// with their role set. They claim it by signing up with the same email (see claimPlaceholder).
//
// All functions here take the service-role client (lib/supabase/admin.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { clarifyConfigured, getRecord, listUpdatedAfter, readSelect, type ClarifyRecord } from "@/lib/clarify/client";
import { emailsOf } from "@/lib/clarify/matches";

type Admin = SupabaseClient;
type Role = "host" | "joey";

/** Deal stages at which the portal match should exist. */
const SYNC_STAGES = ["Contracting", "Matched"];

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A to-one link comes back as the related id (or occasionally as {id}). */
function linkedId(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  if (v && typeof v === "object") return ((v as { id?: string; _id?: string }).id ?? (v as { _id?: string })._id) || null;
  return null;
}

export type DealSyncResult =
  | "created"
  | "linked"
  | "exists"
  | "skipped_stage"
  | "no_host"
  | "no_joey"
  | "no_host_email"
  | "no_joey_email";

/** The portal profile for this person, creating a placeholder if there's none. */
async function ensureProfile(
  admin: Admin,
  role: Role,
  emails: string[],
  name: string | null,
): Promise<{ id: string; placeholder: boolean }> {
  const match = await findByEmail(admin, emails);
  if (match) {
    if (match.role && match.role !== role) {
      throw new Error(`${match.email} is a ${match.role} in the portal, but Clarify has them as the ${role}`);
    }
    if (!match.role) {
      const { error: roleErr } = await admin.from("profiles").update({ role }).eq("id", match.id);
      if (roleErr) throw roleErr;
    }
    return { id: match.id, placeholder: false };
  }

  const email = emails[0];
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name ?? undefined, placeholder: true },
  });
  if (createErr) throw createErr;
  const id = created.user.id;
  const { error: profErr } = await admin
    .from("profiles")
    .update({ role, full_name: name, is_placeholder: true })
    .eq("id", id);
  if (profErr) throw profErr;
  return { id, placeholder: true };
}

/** Emails in profiles are as typed at sign-up, so compare without case (escaping ilike's wildcards). */
async function findByEmail(admin: Admin, emails: string[]) {
  for (const e of emails) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, role")
      .ilike("email", e.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0] as { id: string; email: string; role: Role | null };
  }
  return null;
}

/** The Joey's portal profile: by their application's Clarify record, else by email (placeholder if new). */
async function ensureJoey(admin: Admin, joey: ClarifyRecord): Promise<{ id: string } | "no_joey_email"> {
  const { data: app, error } = await admin
    .from("joey_applications")
    .select("joey_id")
    .eq("clarify_joey_id", joey.id)
    .maybeSingle();
  if (error) throw error;
  if (app) return { id: app.joey_id as string };

  const personId = linkedId(joey.attributes.joey_id);
  const person = personId ? await getRecord("person", personId) : null;
  const emails = person ? emailsOf(listText(person.attributes.email_addresses).join(",")) : [];
  if (emails.length === 0) return "no_joey_email";
  return ensureProfile(admin, "joey", emails, text(joey.attributes.name));
}

function listText(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
    return listText((v as { items: unknown[] }).items);
  }
  return typeof v === "string" ? [v] : [];
}

/** Makes sure the portal has the match for one Clarify deal. Safe to run any number of times. */
export async function syncDeal(admin: Admin, dealId: string, known?: ClarifyRecord): Promise<DealSyncResult> {
  const deal = known ?? (await getRecord("deal", dealId));
  const stage = readSelect(deal.attributes.stage) ?? "";
  if (!SYNC_STAGES.includes(stage)) return "skipped_stage";

  const { data: existing, error: exErr } = await admin
    .from("matches")
    .select("id, clarify_deal_stage")
    .eq("clarify_deal_id", deal.id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) {
    // Kept current so the Joey's journey knows Contracting (signing) from Matched (moved in).
    if (existing.clarify_deal_stage !== stage) {
      const { error } = await admin.from("matches").update({ clarify_deal_stage: stage }).eq("id", existing.id);
      if (error) throw error;
    }
    return "exists";
  }

  const hostId = linkedId(deal.attributes.host_id);
  const joeyId = linkedId(deal.attributes.joey_id);
  if (!hostId) return "no_host";
  if (!joeyId) return "no_joey";
  const [host, joey] = await Promise.all([getRecord("c_host", hostId), getRecord("c_joey", joeyId)]);

  const hostEmails = emailsOf(host.attributes.email);
  if (hostEmails.length === 0) return "no_host_email";
  const hostProfile = await ensureProfile(admin, "host", hostEmails, text(host.attributes.name));
  const joeyProfile = await ensureJoey(admin, joey);
  if (joeyProfile === "no_joey_email") return "no_joey_email";

  // A match the Host already added by hand (Add Joey) is linked to the deal rather than duplicated.
  const { data: open, error: openErr } = await admin
    .from("matches")
    .select("id, clarify_deal_id")
    .eq("host_id", hostProfile.id)
    .eq("joey_id", joeyProfile.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openErr) throw openErr;
  if (open) {
    if (open.clarify_deal_id) return "exists";
    const { error } = await admin
      .from("matches")
      .update({ clarify_deal_id: deal.id, clarify_deal_stage: stage })
      .eq("id", open.id);
    if (error) throw error;
    return "linked";
  }

  const { error: insErr } = await admin
    .from("matches")
    .insert({ host_id: hostProfile.id, joey_id: joeyProfile.id, clarify_deal_id: deal.id, clarify_deal_stage: stage });
  if (insErr) throw insErr;
  return "created";
}

/** Catches up on every deal changed in Clarify since the last poll (the daily cron). */
export async function pollDeals(admin: Admin) {
  if (!clarifyConfigured()) return { skipped: "not_configured" };

  const pollStartedAt = new Date().toISOString();
  const { data: cursorRow } = await admin.from("sync_state").select("value").eq("key", "clarify_deal_cursor").maybeSingle();
  // Overlap by a minute so edits made during the last poll aren't missed. First run looks back 30 days.
  const since = cursorRow?.value
    ? new Date(Date.parse(cursorRow.value) - 60_000).toISOString()
    : new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const counts: Record<string, number> = {};
  for (let offset = 0; offset < 10_000; offset += 100) {
    const { records, hasMore } = await listUpdatedAfter("deal", since, offset);
    for (const r of records.filter((d) => SYNC_STAGES.includes(readSelect(d.attributes.stage) ?? ""))) {
      let result: string;
      try {
        result = await syncDeal(admin, r.id, r);
      } catch (e) {
        console.error("[clarify] deal sync failed", r.id, e);
        result = "error";
      }
      counts[result] = (counts[result] ?? 0) + 1;
    }
    if (!hasMore) break;
  }

  await admin.from("sync_state").upsert({ key: "clarify_deal_cursor", value: pollStartedAt, updated_at: pollStartedAt });
  return counts;
}
