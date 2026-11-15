import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { HostJoeys, type JoeyMatch } from "@/components/host-joeys";
import { personName, type Person } from "@/lib/people";
import { getProposedJoeys, type ProposedJoey } from "@/lib/clarify/proposed";
import { getPaySchedules, getPtoBalances, getToday } from "@/lib/timesheets-server";
import type { TermValue } from "@/components/joey-terms";

type TermRow = {
  match_id: string;
  effective_date: string;
  hourly_rate_cents: number | null;
  monthly_rent_cents: number | null;
};
type OpenAmendment = {
  id: string;
  match_id: string;
  kind: "pay_amendment" | "rent_amendment";
  status: string;
  draft_fields: Record<string, unknown>;
};

/** Today's amount, the next scheduled change, and any amendment still being signed. */
function termValue(
  rows: TermRow[],
  key: "hourly_rate_cents" | "monthly_rent_cents",
  today: string,
  open: OpenAmendment | undefined,
  newKey: string,
): TermValue {
  const sorted = [...rows].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  const current = sorted.filter((r) => r.effective_date <= today).at(-1) ?? null;
  const next =
    sorted.find((r) => r.effective_date > today && r[key] !== null && r[key] !== (current?.[key] ?? null)) ?? null;
  const f = open?.draft_fields ?? {};
  return {
    current: current?.[key] ?? null,
    next: next && next[key] !== null ? { cents: next[key], from: next.effective_date } : null,
    open: open
      ? {
          id: open.id,
          cents: typeof f[newKey] === "number" ? (f[newKey] as number) : null,
          from: typeof f.effective_date === "string" ? f.effective_date : null,
          waitingOn: open.status === "sent" ? "joey" : "you",
        }
      : null,
  };
}

type MatchRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  employment_ends_on: string | null;
  housing_ends_on: string | null;
  joey: Person;
  agreements: { kind: string; status: string }[];
};

/** Pending until both the offer letter and the housing license are signed. */
const signed = (m: MatchRow) =>
  ["offer_letter", "housing_license"].every((k) => m.agreements.some((a) => a.kind === k && a.status === "executed"));

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Proposed Joeys from Clarify. A Clarify outage shows a note on the tab instead of breaking the page. */
async function loadProposed(email: string): Promise<{ joeys: ProposedJoey[]; note: string | null }> {
  try {
    const res = await getProposedJoeys(email);
    if (!res.configured) return { joeys: [], note: "Proposed Joeys aren't available right now." };
    return { joeys: res.joeys, note: null };
  } catch (e) {
    console.error("[clarify] proposed Joeys failed", e);
    return { joeys: [], note: "Proposed Joeys couldn't be loaded. Try again in a minute." };
  }
}

export default function HostJoeysPage() {
  return (
    <Suspense fallback={<PageHeader title="Matches" />}>
      <JoeysData />
    </Suspense>
  );
}

async function JoeysData() {
  const profile = await getProfile();
  const supabase = await createClient();

  const proposedLoad = loadProposed(profile.email);
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, started_at, ended_at, employment_ends_on, housing_ends_on, joey:profiles!matches_joey_id_fkey(full_name, email), agreements(kind, status)",
    )
    .eq("host_id", profile.id)
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);
  const ids = data.map((m) => m.id);
  const today = await getToday(supabase);
  const active = (data as unknown as MatchRow[]).filter((m) => !m.ended_at).map((m) => m.id);
  const [schedules, terms, amendments, pto] = await Promise.all([
    getPaySchedules(supabase, ids, today),
    supabase
      .from("match_terms")
      .select("match_id, effective_date, hourly_rate_cents, monthly_rent_cents")
      .in("match_id", ids)
      .eq("status", "accepted"),
    supabase
      .from("agreements")
      .select("id, match_id, kind, status, draft_fields")
      .in("match_id", ids)
      .in("kind", ["pay_amendment", "rent_amendment"])
      .not("status", "in", "(executed,void)"),
    getPtoBalances(supabase, active),
  ]);
  if (terms.error) throw new Error(terms.error.message);
  if (amendments.error) throw new Error(amendments.error.message);
  const termRows = terms.data as TermRow[];
  const open = amendments.data as OpenAmendment[];

  const rows: JoeyMatch[] = (data as unknown as MatchRow[]).map((m) => ({
    id: m.id,
    name: personName(m.joey),
    email: m.joey?.email ?? "",
    started: fmt(m.started_at),
    ended: m.ended_at ? fmt(m.ended_at) : null,
    terms: {
      rate: termValue(
        termRows.filter((t) => t.match_id === m.id),
        "hourly_rate_cents",
        today,
        open.find((a) => a.match_id === m.id && a.kind === "pay_amendment"),
        "new_rate_cents",
      ),
      rent: termValue(
        termRows.filter((t) => t.match_id === m.id),
        "monthly_rent_cents",
        today,
        open.find((a) => a.match_id === m.id && a.kind === "rent_amendment"),
        "new_rent_cents",
      ),
      schedule: schedules.get(m.id)!,
    },
    today,
    ptoBalance: pto.get(m.id) ?? 0,
    ending:
      m.employment_ends_on && m.housing_ends_on
        ? { lastDay: m.employment_ends_on, moveOut: m.housing_ends_on, canUndo: m.employment_ends_on >= today }
        : null,
  }));

  const proposed = await proposedLoad;
  const isSigned = new Set((data as unknown as MatchRow[]).filter(signed).map((m) => m.id));
  const current = rows.filter((r) => r.ended === null);
  return (
    <HostJoeys
      proposed={proposed.joeys}
      proposedNote={proposed.note}
      pending={current.filter((r) => !isSigned.has(r.id))}
      active={current.filter((r) => isSigned.has(r.id))}
      expired={rows.filter((r) => r.ended !== null)}
    />
  );
}
