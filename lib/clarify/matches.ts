// A Host's Matches as the JoeyCo team tracks them in Clarify. A Match is a deal: its Host is the
// c_host record in host_id (found by the c_host email), its proposed Joeys are the c_joey records in
// candidate_joeys, and the Joey picked for it is the c_joey in joey_id. Read-only.
//
// Stage → where the Host sees it on Matches:
//   Search      → Proposed (each candidate Joey)
//   Contracting → Pending  (the selected Joey)
//   Matched     → Active   (the selected Joey)
//   Completed   → Completed (the selected Joey)
// Intake and Refunded aren't shown.

import { clarifyConfigured, getRecord, listResources, readSelect, type ClarifyRecord } from "@/lib/clarify/client";

const STAGES = { proposed: "Search", pending: "Contracting", active: "Matched", completed: "Completed" } as const;
export type ClarifyTab = keyof typeof STAGES;

/** Candidates the team has closed out are left off Proposed, even if still linked to the Match. */
const HIDDEN_VETTING_STAGES = ["Rejected", "Inactive", "Suspected Spam / Bot"];

export type ClarifyJoey = {
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

/** A Joey picked for one of the Host's Matches (Contracting, Matched or Completed). */
export type ClarifyMatch = {
  dealId: string;
  /** The Match's close date in Clarify (YYYY-MM-DD), if the team set one. */
  date: string | null;
  joey: ClarifyJoey;
};

export type ClarifyMatches =
  | { configured: false }
  | {
      configured: true;
      proposed: ClarifyJoey[];
      pending: ClarifyMatch[];
      active: ClarifyMatch[];
      completed: ClarifyMatch[];
    };

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

function toJoey(r: ClarifyRecord): ClarifyJoey {
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

type Deal = ClarifyRecord & { relationships?: Record<string, unknown> };

/** Ids from a relationship, whether it comes as JSON:API linkage, embedded records, or {items: ids}. */
function relatedIds(record: Deal, field: string): string[] {
  const rel = record.relationships?.[field] ?? record.attributes[field];
  const data = rel && typeof rel === "object" && "data" in rel ? (rel as { data: unknown }).data : rel;
  const items =
    Array.isArray(data) ? data
    : data && typeof data === "object" && "items" in data ? (data as { items: unknown }).items
    : data ? [data]
    : [];
  return (Array.isArray(items) ? items : [])
    .map((x) =>
      typeof x === "string" ? x
      : x && typeof x === "object" ? ((x as { id?: string; _id?: string }).id ?? (x as { _id?: string })._id)
      : null,
    )
    .filter((x): x is string => Boolean(x));
}

/** Records embedded with a relationship (when Clarify returns them inline rather than in `included`). */
function embedded(record: Deal, field: string): ClarifyRecord[] {
  const rel = record.relationships?.[field];
  const data = rel && typeof rel === "object" && "data" in rel ? (rel as { data: unknown }).data : rel;
  return (Array.isArray(data) ? data : data ? [data] : []).filter(
    (x): x is ClarifyRecord => Boolean(x && typeof x === "object" && "id" in x && "attributes" in x),
  );
}

/** The c_host email field sometimes holds two addresses ("a@x.com, b@y.com"). */
export const emailsOf = (v: unknown) =>
  (text(v) ?? "")
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);

/**
 * The Host's Matches in Clarify, sorted into the Matches tabs. A Joey shows once per tab, in the
 * order the team added them.
 */
export async function getClarifyMatches(hostEmail: string): Promise<ClarifyMatches> {
  if (!clarifyConfigured()) return { configured: false };
  const email = hostEmail.trim().toLowerCase();
  const empty = { configured: true as const, proposed: [], pending: [], active: [], completed: [] };

  // 1. The Host's c_host record(s). Contains, because the team types emails with any capitalization
  //    (and sometimes two to a record); the exact check is done here. Clarify can't filter deals on
  //    host_id.email, hence two steps.
  const hosts = await listResources("c_host", { "filter[email][Contains]": email }, 10);
  const hostIds = hosts.data.filter((h) => emailsOf(h.attributes.email).includes(email)).map((h) => h.id);
  if (hostIds.length === 0) return empty;

  // 2. Their Matches in the stages we show, with the Joeys sent along in `included`.
  const pages = await Promise.all(
    hostIds.map((id) =>
      listResources("deal", {
        "filter[host_id]": id,
        "filter[stage]": Object.values(STAGES).join(","),
        include: "candidate_joeys,joey_id",
      }),
    ),
  );

  const known = new Map<string, ClarifyRecord>();
  for (const page of pages) {
    for (const r of page.included ?? []) known.set(r.id, r);
    for (const deal of page.data) {
      for (const r of [...embedded(deal, "candidate_joeys"), ...embedded(deal, "joey_id")]) known.set(r.id, r);
    }
  }

  const deals = pages.flatMap((p) => p.data as Deal[]);
  const inStage = (stage: string) => deals.filter((d) => readSelect(d.attributes.stage) === stage);
  const candidateIds = [...new Set(inStage(STAGES.proposed).flatMap((d) => relatedIds(d, "candidate_joeys")))];
  const selectedIds = deals.flatMap((d) => relatedIds(d, "joey_id"));

  // Anything Clarify linked but didn't send along, fetched one by one.
  await Promise.all(
    [...new Set([...candidateIds, ...selectedIds])]
      .filter((id) => !known.get(id)?.attributes)
      .map(async (id) => known.set(id, await getRecord("c_joey", id))),
  );

  const proposed = candidateIds
    .map((id) => known.get(id))
    .filter((r): r is ClarifyRecord => Boolean(r))
    .filter((r) => !HIDDEN_VETTING_STAGES.includes(readSelect(r.attributes.vetting_stage) ?? ""))
    .map(toJoey);

  const picked = (stage: string): ClarifyMatch[] => {
    const seen = new Set<string>();
    return inStage(stage).flatMap((d) => {
      const r = known.get(relatedIds(d, "joey_id")[0] ?? "");
      if (!r || seen.has(r.id)) return [];
      seen.add(r.id);
      return [{ dealId: d.id, date: text(d.attributes.close_date)?.slice(0, 10) ?? null, joey: toJoey(r) }];
    });
  };

  return {
    configured: true,
    proposed,
    pending: picked(STAGES.pending),
    active: picked(STAGES.active),
    completed: picked(STAGES.completed),
  };
}

/** Every Joey on the Host's Matches, for opening one profile. */
export function allJoeys(m: Extract<ClarifyMatches, { configured: true }>): ClarifyJoey[] {
  return [...m.proposed, ...[...m.pending, ...m.active, ...m.completed].map((x) => x.joey)];
}
