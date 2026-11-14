import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { JoeyTimesheet } from "@/components/timesheets/joey-timesheet";
import { personName, type Person } from "@/lib/people";
import { ENTRY_FIELDS, addDays, mondayOf, type PeriodSpan, type TimeEntry } from "@/lib/timesheets";
import {
  getOfferTerms,
  getPaySchedules,
  getPtoBalances,
  getRates,
  getToday,
} from "@/lib/timesheets-server";

type SearchParams = Promise<{ match?: string; week?: string }>;

export default function JoeyTimesheetPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageHeader title="Timesheets" />}>
      <TimesheetData searchParams={searchParams} />
    </Suspense>
  );
}

// The page loads a window of weeks around today; moving between weeks happens in the browser.
const WEEKS_BACK = 16;
const WEEKS_AHEAD = 8;

async function TimesheetData({ searchParams }: { searchParams: SearchParams }) {
  const [{ match: matchParam, week: weekParam }, profile, supabase] = await Promise.all([searchParams, getProfile(), createClient()]);
  const today = await getToday(supabase);

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select("id, host_id, employment_ends_on, housing_ends_on, host:profiles!matches_host_id_fkey(full_name, email)")
    .eq("joey_id", profile.id)
    .is("ended_at", null)
    .order("started_at", { ascending: true });
  if (matchError) throw new Error(matchError.message);

  type Row = { id: string; host_id: string; employment_ends_on: string | null; housing_ends_on: string | null; host: Person };
  const matches = (matchRows as unknown as Row[]).map((m) => ({
    id: m.id,
    hostId: m.host_id,
    hostName: personName(m.host),
    ending: m.employment_ends_on && m.housing_ends_on ? { lastDay: m.employment_ends_on, moveOut: m.housing_ends_on } : null,
  }));
  const match = matches.find((m) => m.id === matchParam) ?? matches[0];
  if (!match) return <PageHeader title="Timesheets" />;

  const from = addDays(mondayOf(today), -7 * WEEKS_BACK);
  const to = addDays(mondayOf(today), 7 * WEEKS_AHEAD + 6);

  const [entries, periods, rates, balances, schedules, offer] = await Promise.all([
    supabase
      .from("time_entries")
      .select(ENTRY_FIELDS)
      .eq("match_id", match.id)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date")
      .order("start_time"),
    supabase.rpc("pay_periods_between", { p_match: match.id, p_from: from, p_to: to }),
    getRates(supabase, [match.id]),
    getPtoBalances(supabase, [match.id]),
    getPaySchedules(supabase, [match.id], today),
    getOfferTerms(supabase, match.id),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  if (periods.error) throw new Error(periods.error.message);

  return (
    <JoeyTimesheet
      key={match.id}
      today={today}
      initialWeek={weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? mondayOf(weekParam) : undefined}
      windowStart={from}
      windowEnd={to}
      joeyId={profile.id}
      match={match}
      otherMatches={matches.filter((m) => m.id !== match.id)}
      entries={entries.data as unknown as TimeEntry[]}
      periods={periods.data as PeriodSpan[]}
      rates={rates.get(match.id) ?? []}
      ptoBalance={balances.get(match.id) ?? 0}
      hasPtoPolicy={offer.ptoAmount !== null}
      paySchedule={schedules.get(match.id)!}
      schedule={offer.schedule}
    />
  );
}
