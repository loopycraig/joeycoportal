// Proposed Joeys: the candidates the JoeyCo team has lined up for a Host, read from Clarify before
// any match exists in the portal. In Clarify a Match is a deal; its Host is the c_host record in
// host_id and its candidates are the c_joey records in candidate_joeys. Read-only.

import { clarifyConfigured, getRecord, listResources, readSelect, type ClarifyRecord } from "@/lib/clarify/client";

/** Match stages that mean the search is still on. Matched, Completed and Refunded are done. */
const OPEN_STAGES = ["Intake", "Search", "Contracting"];

/** Joeys the team has closed out are left off, even if they're still linked to the Match. */
const HIDDEN_VETTING_STAGES = ["Rejected", "Inactive", "Suspected Spam / Bot"];

export type ProposedJoey = {
  id: string; // c_joey record id
  name: string;
  bio: string | null;
  school: string | null;
  cities: string[];
  tasks: string[];
  hostPreference: string | null;
  livingArrangement: string | null;
  moveIn: string | null;
};

export type ProposedResult = { configured: false } | { configured: true; joeys: ProposedJoey[] };

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(readSelect).filter((s): s is string => Boolean(s));
  if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
    return list((v as { items: unknown[] }).items);
  }
  const one = readSelect(v);
  return one ? [one] : [];
}

/** Bios are written by the team. Anything after a "---" line is their screening notes, not for Hosts. */
function publicBio(v: unknown) {
  const bio = text(v);
  if (!bio) return null;
  return text(bio.split(/^\s*---\s*$/m)[0]);
}

function toJoey(r: ClarifyRecord): ProposedJoey {
  const a = r.attributes;
  return {
    id: r.id,
    name: text(a.name) ?? "Joey",
    bio: publicBio(a.bio),
    school: text(a.school_degree),
    cities: list(a.preferred_cities),
    tasks: list(a.preferred_tasks),
    hostPreference: readSelect(a.host_preference),
    livingArrangement: readSelect(a.living_arrangement),
    moveIn: readSelect(a.move_in_timeline),
  };
}

/** Ids from a relationship, whether it comes as JSON:API linkage, embedded records, or {items: ids}. */
function relatedIds(record: ClarifyRecord & { relationships?: Record<string, unknown> }, field: string): string[] {
  const rel = record.relationships?.[field] ?? record.attributes[field];
  const data = rel && typeof rel === "object" && "data" in rel ? (rel as { data: unknown }).data : rel;
  const items = Array.isArray(data) ? data : data && typeof data === "object" && "items" in data ? (data as { items: unknown }).items : data ? [data] : [];
  return (Array.isArray(items) ? items : [])
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? ((x as { id?: string; _id?: string }).id ?? (x as { _id?: string })._id) : null))
    .filter((x): x is string => Boolean(x));
}

/** Records embedded with a relationship (when Clarify returns them inline rather than in `included`). */
function embedded(record: { relationships?: Record<string, unknown> }, field: string): ClarifyRecord[] {
  const rel = record.relationships?.[field];
  const data = rel && typeof rel === "object" && "data" in rel ? (rel as { data: unknown }).data : rel;
  return (Array.isArray(data) ? data : data ? [data] : []).filter(
    (x): x is ClarifyRecord => Boolean(x && typeof x === "object" && "id" in x && "attributes" in x),
  );
}

/**
 * The Joeys proposed to this Host on their open Matches in Clarify, one entry per Joey (a Joey on
 * two open Matches shows once), in the order the team added them.
 */
export async function getProposedJoeys(hostEmail: string): Promise<ProposedResult> {
  if (!clarifyConfigured()) return { configured: false };
  const email = hostEmail.trim().toLowerCase();

  // Filter on the Host's email through the host_id link. Contains, because the team types emails
  // with any capitalization; the exact (case-insensitive) check is done below.
  const page = await listResources("deal", {
    "filter[host_id.email][Contains]": email,
    "filter[stage]": OPEN_STAGES.join(","),
    include: "host_id,candidate_joeys",
  });

  const known = new Map<string, ClarifyRecord>();
  for (const r of page.included ?? []) known.set(r.id, r);
  for (const deal of page.data) {
    for (const r of [...embedded(deal, "host_id"), ...embedded(deal, "candidate_joeys")]) known.set(r.id, r);
  }

  // Anything Clarify linked but didn't send along, fetched one by one.
  const fetchMissing = async (object: string, ids: string[]) =>
    Promise.all(
      ids.filter((id) => !known.get(id)?.attributes).map(async (id) => known.set(id, await getRecord(object, id))),
    );

  const deals = page.data.filter((d) => OPEN_STAGES.includes(readSelect(d.attributes.stage) ?? ""));
  await fetchMissing("c_host", [...new Set(deals.flatMap((d) => relatedIds(d, "host_id")))]);
  const mine = deals.filter((d) =>
    relatedIds(d, "host_id").some((id) => text(known.get(id)?.attributes.email)?.toLowerCase() === email),
  );

  const joeyIds = [...new Set(mine.flatMap((d) => relatedIds(d, "candidate_joeys")))];
  await fetchMissing("c_joey", joeyIds);

  const joeys = joeyIds
    .map((id) => known.get(id))
    .filter((r): r is ClarifyRecord => Boolean(r))
    .filter((r) => !HIDDEN_VETTING_STAGES.includes(readSelect(r.attributes.vetting_stage) ?? ""))
    .map(toJoey);
  return { configured: true, joeys };
}
