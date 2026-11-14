import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { HostJoeys, type JoeyMatch } from "@/components/host-joeys";
import { personName, type Person } from "@/lib/people";
import { getPaySchedules, getPtoBalances, getToday } from "@/lib/timesheets-server";
import type { TermValue } from "@/components/joey-terms";

type TermRow = { match_id: string; effective_date: string; hourly_rate_cents: number; monthly_rent_cents: number };
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
  const next = sorted.find((r) => r.effective_date > today && r[key] !== (current?.[key] ?? null)) ?? null;
  const f = open?.draft_fields ?? {};
  return {
    current: current?.[key] ?? null,
    next: next ? { cents: next[key], from: next.effective_date } : null,
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
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function HostJoeysPage() {
  return (
    <Suspense fallback={<PageHeader title="My Joeys" />}>
      <JoeysData />
    </Suspense>
  );
}

async function JoeysData() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("matches")
    .select("id, started_at, ended_at, employment_ends_on, housing_ends_on, joey:profiles!matches_joey_id_fkey(full_name, email)")
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

  return (
    <HostJoeys
      active={rows.filter((r) => r.ended === null)}
      ended={rows.filter((r) => r.ended !== null)}
    />
  );
}
