// Pay by pay period: the hours in each period, what they come to, when it's due and whether it's
// been paid. Works the same whichever payroll provider the Host uses (or none). Server only.

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { personName, type Person } from "@/lib/people";
import {
  ENTRY_FIELDS,
  addDays,
  mondayOf,
  splitEntries,
  totalsFor,
  type EntrySplit,
  type Rate,
  type TimeEntry,
  type Totals,
} from "@/lib/timesheets";
import { getRates, getToday } from "@/lib/timesheets-server";

import type { PayStatus } from "@/lib/payments/pay-status";
export type { PayStatus };

export type PayPeriod = {
  id: string;
  matchId: string;
  /** The Joey (for a Host) or the Host (for a Joey). */
  otherName: string;
  periodStart: string;
  periodEnd: string;
  payday: string;
  paid: { on: string; amountCents: number; note: string | null } | null;
  status: PayStatus;
  entries: TimeEntry[];
  splits: Record<string, EntrySplit>;
  totals: Totals;
  rates: Rate[];
  timesheetHref: string;
};

const MAX_PERIODS = 48;

export async function getPayPeriods(role: "host" | "joey"): Promise<{ today: string; periods: PayPeriod[] }> {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const today = await getToday(supabase);
  const other = role === "host" ? "other:profiles!matches_joey_id_fkey" : "other:profiles!matches_host_id_fkey";

  const { data: matchData, error } = await supabase
    .from("matches")
    .select(`id, ${other}(full_name, email)`)
    .eq(role === "host" ? "host_id" : "joey_id", profile.id);
  if (error) throw new Error(error.message);
  const matches = matchData as unknown as { id: string; other: Person }[];
  const ids = matches.map((m) => m.id);
  if (ids.length === 0) return { today, periods: [] };

  const { data: periodData, error: periodError } = await supabase
    .from("pay_periods")
    .select("id, match_id, period_start, period_end, payday, paid_on, paid_amount_cents, paid_note")
    .in("match_id", ids)
    .order("period_start", { ascending: false })
    .limit(MAX_PERIODS);
  if (periodError) throw new Error(periodError.message);
  type Row = {
    id: string;
    match_id: string;
    period_start: string;
    period_end: string;
    payday: string;
    paid_on: string | null;
    paid_amount_cents: number | null;
    paid_note: string | null;
  };
  const rows = periodData as Row[];
  if (rows.length === 0) return { today, periods: [] };

  // Overtime depends on every day in the workweek, so load from the Monday before the oldest period.
  const oldest = rows.reduce((min, p) => (p.period_start < min ? p.period_start : min), rows[0].period_start);
  const [entryData, rates] = await Promise.all([
    supabase
      .from("time_entries")
      .select(ENTRY_FIELDS)
      .in("match_id", ids)
      .neq("status", "draft")
      .gte("work_date", addDays(mondayOf(oldest), -7))
      .order("work_date")
      .order("start_time"),
    getRates(supabase, ids),
  ]);
  if (entryData.error) throw new Error(entryData.error.message);
  const entries = entryData.data as unknown as TimeEntry[];
  const splitsByMatch = new Map(ids.map((id) => [id, splitEntries(entries.filter((e) => e.match_id === id))]));

  const periods = rows
    .map((p): PayPeriod => {
      const mine = entries.filter((e) => e.pay_period_id === p.id);
      const splits = splitsByMatch.get(p.match_id)!;
      const counted = mine.filter((e) => e.status === "approved" || e.status === "submitted");
      const matchRates = rates.get(p.match_id) ?? [];
      const status: PayStatus = p.paid_on
        ? "paid"
        : mine.some((e) => e.status === "submitted")
          ? "needs_approval"
          : mine.some((e) => e.status === "changes_requested")
            ? "changes_requested"
            : p.payday < today
              ? "overdue"
              : "due";
      return {
        id: p.id,
        matchId: p.match_id,
        otherName: personName(matches.find((m) => m.id === p.match_id)?.other),
        periodStart: p.period_start,
        periodEnd: p.period_end,
        payday: p.payday,
        paid: p.paid_on ? { on: p.paid_on, amountCents: p.paid_amount_cents ?? 0, note: p.paid_note } : null,
        status,
        entries: mine,
        splits: Object.fromEntries(mine.flatMap((e) => (splits.has(e.id) ? [[e.id, splits.get(e.id)!]] : []))),
        totals: totalsFor(counted, splits, matchRates),
        rates: matchRates,
        timesheetHref:
          role === "host"
            ? `/host/timesheets#period-${p.id}`
            : `/joey/timesheets?match=${p.match_id}&week=${mondayOf(mine[0]?.work_date ?? p.period_start)}`,
      };
    })
    .filter((p) => p.entries.length > 0);

  return { today, periods };
}
