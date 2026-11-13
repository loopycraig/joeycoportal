import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { ESIGN_CONSENT } from "@/lib/agreements/templates";
import { sectionOf, todayPacific, type Section } from "@/lib/agreements/fields";
import type { AgreementKind, AgreementStatus, Fields, Party, RenderedBlock } from "@/lib/agreements/types";

type Person = { full_name: string | null; email: string } | null;

export type AgreementSummary = {
  id: string;
  kind: AgreementKind;
  status: AgreementStatus;
  current_version: number;
  ends_on: string | null;
  updated_at: string;
  executed_at: string | null;
  match_id: string | null;
  joey: Person;
  host: Person;
  section: Section;
};

const SUMMARY_SELECT =
  "id, kind, status, current_version, ends_on, updated_at, executed_at, match_id, replaces_id, " +
  "joey:profiles!agreements_joey_id_fkey(full_name, email), host:profiles!agreements_host_id_fkey(full_name, email), " +
  "match:matches(ended_at)";

type SummaryRow = Omit<AgreementSummary, "section"> & { replaces_id: string | null; match: { ended_at: string | null } | null };

function toSummaries(rows: SummaryRow[]): AgreementSummary[] {
  const today = todayPacific();
  const replaced = new Set(rows.filter((r) => r.status === "executed" && r.replaces_id).map((r) => r.replaces_id));
  return rows.map((row) => {
    const { match, ...a } = row;
    delete (a as Partial<SummaryRow>).replaces_id;
    return {
      ...a,
      section: sectionOf({ status: a.status, ends_on: a.ends_on, match_ended: Boolean(match?.ended_at), superseded: replaced.has(a.id) }, today),
    };
  });
}

/** Every agreement the signed-in user is a party to (RLS limits the rows). */
export const listMyAgreements = cache(async (): Promise<AgreementSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agreements").select(SUMMARY_SELECT).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return toSummaries(data as unknown as SummaryRow[]);
});

export type AgreementVersion = {
  version: number;
  template_version: string;
  fields: Fields;
  rendered: RenderedBlock[];
  content_hash: string;
  note: string | null;
  created_at: string;
};

export type AgreementSignature = {
  version: number;
  party: Party;
  typed_name: string;
  signer_title: string | null;
  addendum_ack: boolean | null;
  signed_at: string;
};

export type AgreementEvent = {
  id: number;
  version: number | null;
  action: string;
  comment: string | null;
  at: string;
  actor_id: string | null;
};

export type AgreementDetail = AgreementSummary & {
  host_id: string;
  joey_id: string | null;
  draft_fields: Fields;
  versions: AgreementVersion[];
  signatures: AgreementSignature[];
  events: AgreementEvent[];
};

export async function getAgreement(id: string): Promise<AgreementDetail | null> {
  const supabase = await createClient();
  const [{ data: a, error }, versions, signatures, events] = await Promise.all([
    supabase.from("agreements").select(`${SUMMARY_SELECT}, host_id, joey_id, draft_fields`).eq("id", id).maybeSingle(),
    supabase
      .from("agreement_versions")
      .select("version, template_version, fields, rendered, content_hash, note, created_at")
      .eq("agreement_id", id)
      .order("version"),
    supabase
      .from("agreement_signatures")
      .select("version, party, typed_name, signer_title, addendum_ack, signed_at")
      .eq("agreement_id", id)
      .order("signed_at"),
    supabase.from("agreement_events").select("id, version, action, comment, at, actor_id").eq("agreement_id", id).order("at"),
  ]);
  if (error) throw new Error(error.message);
  if (!a) return null;
  const [summary] = toSummaries([a as unknown as SummaryRow]);
  const row = a as unknown as { host_id: string; joey_id: string | null; draft_fields: Fields };
  return {
    ...summary,
    host_id: row.host_id,
    joey_id: row.joey_id,
    draft_fields: row.draft_fields ?? {},
    versions: (versions.data ?? []) as AgreementVersion[],
    signatures: (signatures.data ?? []) as AgreementSignature[],
    events: (events.data ?? []) as AgreementEvent[],
  };
}

/** Whether the signed-in user has agreed to sign electronically (current consent wording). */
export async function hasEsignConsent(): Promise<boolean> {
  const profile = await getProfile();
  const supabase = await createClient();
  const { count } = await supabase
    .from("esign_consents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("consent_version", ESIGN_CONSENT.version);
  return (count ?? 0) > 0;
}

/** The Host's active matches, for choosing who to send an agreement to. */
export async function activeMatchesForHost() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("id, joey:profiles!matches_joey_id_fkey(full_name, email)")
    .eq("host_id", profile.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as { id: string; joey: Person }[]).map((m) => ({
    id: m.id,
    name: m.joey?.full_name || m.joey?.email || "Joey",
  }));
}

export const personLabel = (p: Person) => p?.full_name || p?.email || "—";
