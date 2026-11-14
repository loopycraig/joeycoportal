import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { HostTimesheets, type HostPeriod } from "@/components/timesheets/host-timesheets";
import { personName, type Person } from "@/lib/people";
import { ENTRY_FIELDS, addDays, mondayOf, splitEntries, type TimeEntry } from "@/lib/timesheets";
import { getOfferTerms, getPtoBalances, getRates, getToday } from "@/lib/timesheets-server";

export default function HostTimesheetsPage() {
  return (
    <Suspense fallback={<PageHeader title="Timesheets" />}>
      <TimesheetsData />
    </Suspense>
  );
}

const DAYS_BACK = 120;

async function TimesheetsData() {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const today = await getToday(supabase);

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select("id, ended_at, joey:profiles!matches_joey_id_fkey(full_name, email)")
    .eq("host_id", profile.id);
  if (matchError) throw new Error(matchError.message);
  const matches = matchRows as unknown as { id: string; ended_at: string | null; joey: Person }[];
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length === 0) return <HostTimesheets today={today} periods={[]} splits={{}} />;

  const since = addDays(today, -DAYS_BACK);
  const { data: periodRows, error: periodError } = await supabase
    .from("pay_periods")
    .select("id, match_id, period_start, period_end, payday, paid_on")
    .in("match_id", matchIds)
    .gte("period_end", since)
    .order("period_start", { ascending: false });
  if (periodError) throw new Error(periodError.message);

  // A week's overtime depends on every day in it, so load from the Monday before the oldest period.
  const oldest = periodRows.reduce((min, p) => (p.period_start < min ? p.period_start : min), since);
  const [entries, rates, balances, offers] = await Promise.all([
    supabase
      .from("time_entries")
      .select(ENTRY_FIELDS)
      .eq("host_id", profile.id)
      .gte("work_date", addDays(mondayOf(oldest), -31))
      .order("work_date")
      .order("start_time"),
    getRates(supabase, matchIds),
    getPtoBalances(supabase, matchIds),
    Promise.all(matchIds.map(async (id) => [id, await getOfferTerms(supabase, id)] as const)),
  ]);
  if (entries.error) throw new Error(entries.error.message);

  const allEntries = entries.data as unknown as TimeEntry[];
  const offerByMatch = new Map(offers);
  // Overtime depends on every day in the workweek, including days in the neighbouring period.
  const splits = Object.fromEntries(
    matchIds.flatMap((id) => [...splitEntries(allEntries.filter((e) => e.match_id === id))]),
  );

  const periods: HostPeriod[] = periodRows
    .map((p) => {
      const m = matches.find((x) => x.id === p.match_id)!;
      return {
        id: p.id,
        matchId: p.match_id,
        joeyName: personName(m.joey),
        periodStart: p.period_start,
        periodEnd: p.period_end,
        payday: p.payday,
        paidOn: p.paid_on,
        entries: allEntries.filter((e) => e.pay_period_id === p.id),
        rates: rates.get(p.match_id) ?? [],
        ptoBalance: balances.get(p.match_id) ?? 0,
        schedule: offerByMatch.get(p.match_id)?.schedule ?? null,
      };
    })
    .filter((p) => p.entries.length > 0);

  return <HostTimesheets today={today} periods={periods} splits={splits} />;
}
