// What the Home cards show, for each portal. Each card is a list of the same rows its own page has
// (pay periods, agreements, people), to-dos first. Server only: reads with the signed-in user's session.

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { listMyAgreements } from "@/lib/agreements/queries";
import { toListItem } from "@/components/agreements/agreement-view";
import { getStatements } from "@/lib/payments/queries";
import { getPayPeriods, type PayPeriod } from "@/lib/payments/periods";
import { personName, type Person } from "@/lib/people";
import {
  SCHEDULE_LABELS,
  addDays,
  formatHours,
  formatMoney,
  formatRange,
  formatShort,
  mondayOf,
  type PeriodSpan,
  type TimeEntry,
} from "@/lib/timesheets";
import { getPaySchedules, getPtoBalances, getToday } from "@/lib/timesheets-server";
import type { HomeCardData, HomeRow } from "@/components/home/home-grid";
import type { PillTone } from "@/components/status-pill";

/** Days after a pay period ends that the Host has to approve it (same as the Timesheets page). */
const APPROVE_WITHIN_DAYS = 2;

type Role = "host" | "joey";

type MatchRow = {
  id: string;
  started_at: string;
  employment_ends_on: string | null;
  housing_ends_on: string | null;
  other: Person;
};

type TermRow = {
  match_id: string;
  effective_date: string;
  hourly_rate_cents: number | null;
  monthly_rent_cents: number | null;
  status: string;
  proposed_by: string;
};

/** In force today, from accepted terms. */
function currentTerms(rows: TermRow[], matchId: string, today: string) {
  return rows
    .filter((t) => t.match_id === matchId && t.status === "accepted" && t.effective_date <= today)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    .at(-1);
}

/** Rent and pay schedule; the hourly rate goes in the row's value. */
function termsLine(t: TermRow | undefined, schedule: string) {
  const rent = t?.monthly_rent_cents != null ? `Rent ${formatMoney(t.monthly_rent_cents)}/mo` : "Rent not set";
  return `${rent} · paid ${schedule.toLowerCase()}`;
}

const rateValue = (t: TermRow | undefined) =>
  t?.hourly_rate_cents != null ? `${formatMoney(t.hourly_rate_cents)}/hr` : "No rate yet";

const periodHours = (p: PayPeriod) => p.totals.regular + p.totals.overtime + p.totals.pto + p.totals.sick + p.totals.holiday;

// ─────────────────────────────────────────────
// Shared rows
// ─────────────────────────────────────────────

/** Payments: every pay period not yet paid, then the most recent paid ones. Same rows as the Payments page. */
function paymentRows(periods: PayPeriod[], role: Role, today: string): HomeRow[] {
  const unpaid = periods.filter((p) => !p.paid).sort((a, b) => a.payday.localeCompare(b.payday));
  const paid = periods.filter((p) => p.paid).slice(0, 2);
  return [...unpaid, ...paid].map((p) => {
    const [status, tone]: [string, PillTone] =
      p.status === "paid"
        ? [`Paid ${formatShort(p.paid!.on)}`, "done"]
        : p.status === "overdue"
          ? [`Overdue, due ${formatShort(p.payday)}`, "stopped"]
          : p.status === "due"
            ? [`Due ${formatShort(p.payday)}`, p.periodEnd < today ? "waiting" : "neutral"]
            : p.status === "needs_approval"
              ? [role === "host" ? "Needs your approval" : "Waiting for approval", "waiting"]
              : [role === "host" ? "Waiting on your Joey" : "Changes requested", "stopped"];
    return {
      key: `pay-${p.id}`,
      label: formatRange(p.periodStart, p.periodEnd),
      detail: p.paid ? p.otherName : `${p.otherName} · estimate`,
      href: `/${role}/payments#pay-${p.id}`,
      status,
      tone,
      value: formatMoney(p.paid ? p.paid.amountCents : p.totals.grossCents),
      // The Host's turn once the period is over and approved; the Joey only waits.
      action: role === "host" && (p.status === "due" || p.status === "overdue") && p.periodEnd < today,
    };
  });
}

/** JoeyCo's next rent-and-fees statement, if one is coming. */
async function statementRow(role: Role, today: string): Promise<HomeRow | null> {
  const next = (await getStatements())
    .filter((s) => s.payment && s.payment.status === "pending" && s.pay_date >= today)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))[0];
  if (!next?.payment) return null;
  return {
    key: `statement-${next.id}`,
    label: "JoeyCo statement",
    detail: `Rent and fees, ${formatRange(next.period_start, next.period_end)}`,
    href: `/${role}/payments`,
    status: `${next.payment.direction === "charge" ? "Charged" : "Paid out"} ${formatShort(next.pay_date)}`,
    tone: "neutral",
    value: formatMoney(next.payment.amount_cents),
  };
}

/** Agreements: everything still pending, as the Agreements page lists it. */
async function agreementRows(role: Role): Promise<HomeRow[]> {
  return (await listMyAgreements())
    .filter((a) => a.section === "pending")
    .map((a) => toListItem(a, role))
    .map((i) => ({
      key: i.key,
      label: i.title,
      detail: i.detail,
      href: i.href,
      status: i.status,
      tone: i.tone,
      action: i.action,
    }));
}

const proposalRows = (terms: TermRow[], me: string, name: (matchId: string) => string, role: Role): HomeRow[] =>
  terms
    .filter((t) => t.status === "proposed" && t.proposed_by !== me)
    .map((t) => ({
      key: `proposal-${t.match_id}-${t.effective_date}`,
      label: `Proposed terms from ${name(t.match_id)}`,
      detail: `From ${formatShort(t.effective_date)}`,
      href: `/${role}/payments`,
      status: "Needs your answer",
      tone: "waiting",
      action: true,
    }));

// ─────────────────────────────────────────────
// Host
// ─────────────────────────────────────────────

export async function getHostHome(): Promise<HomeCardData[]> {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const today = await getToday(supabase);

  const { data: matchData, error } = await supabase
    .from("matches")
    .select("id, started_at, employment_ends_on, housing_ends_on, other:profiles!matches_joey_id_fkey(full_name, email)")
    .eq("host_id", profile.id)
    .is("ended_at", null)
    .order("started_at");
  if (error) throw new Error(error.message);
  const matches = matchData as unknown as MatchRow[];
  const ids = matches.map((m) => m.id);
  const nameOf = (id: string) => personName(matches.find((m) => m.id === id)?.other);

  const [{ periods }, terms, agreements, statement, schedules] = await Promise.all([
    getPayPeriods("host"),
    ids.length
      ? supabase
          .from("match_terms")
          .select("match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, proposed_by")
          .in("match_id", ids)
          .in("status", ["accepted", "proposed"])
      : Promise.resolve({ data: [], error: null }),
    agreementRows("host"),
    statementRow("host", today),
    getPaySchedules(supabase, ids, today),
  ]);
  if (terms.error) throw new Error(terms.error.message);
  const termRows = (terms.data ?? []) as TermRow[];

  // Timesheets: periods with hours to approve, or sent back to the Joey.
  const ts: HomeRow[] = periods
    .filter((p) => p.status === "needs_approval" || p.status === "changes_requested")
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((p) => {
      const due = addDays(p.periodEnd, APPROVE_WITHIN_DAYS);
      const late = today > due;
      const toApprove = p.status === "needs_approval";
      return {
        key: `ts-${p.id}`,
        label: formatRange(p.periodStart, p.periodEnd),
        detail: p.otherName,
        href: `/host/timesheets#period-${p.id}`,
        status: toApprove ? (late ? `Overdue, approve by ${formatShort(due)}` : `Approve by ${formatShort(due)}`) : "Waiting on your Joey",
        tone: toApprove ? (late ? "stopped" : "waiting") : "neutral",
        value: formatHours(periodHours(p)),
        action: toApprove,
      };
    });

  // Payments
  const pay = [...proposalRows(termRows, profile.id, nameOf, "host"), ...paymentRows(periods, "host", today)];
  if (statement) pay.push(statement);

  // My Joeys: one row each, as on My Joeys.
  const joeys: HomeRow[] = matches.map((m) => {
    const ending = m.employment_ends_on && m.housing_ends_on;
    const finished = ending && today >= m.employment_ends_on!;
    const schedule = SCHEDULE_LABELS[schedules.get(m.id)?.current ?? "semimonthly"];
    return {
      key: `joey-${m.id}`,
      label: personName(m.other),
      detail: termsLine(currentTerms(termRows, m.id, today), schedule),
      value: rateValue(currentTerms(termRows, m.id, today)),
      href: `/host/joeys#joey-${m.id}`,
      status: finished
        ? "Run final pay, with unused PTO"
        : ending
          ? `Last day ${formatShort(m.employment_ends_on!)}`
          : `Since ${formatShort(m.started_at.slice(0, 10))}`,
      tone: finished ? "stopped" : ending ? "waiting" : "done",
      action: Boolean(finished),
    };
  });
  if (matches.length === 0) {
    joeys.push({
      key: "add-joey",
      label: "Add your Joey",
      detail: "By the email they signed up with",
      href: "/host/joeys",
      status: "To do",
      tone: "waiting",
      action: true,
    });
  }

  return [
    {
      title: "Timesheets",
      href: "/host/timesheets",
      rows: ts,
      empty: matches.length ? "No hours waiting for you." : "Hours show up here once you have a Joey.",
    },
    { title: "Payments", href: "/host/payments", rows: pay, empty: "No pay periods yet." },
    { title: "Agreements", href: "/host/agreements", rows: agreements, empty: "No agreements waiting on anyone." },
    { title: "My Joeys", href: "/host/joeys", rows: joeys, empty: "" },
  ];
}

// ─────────────────────────────────────────────
// Joey
// ─────────────────────────────────────────────

export async function getJoeyHome(): Promise<HomeCardData[]> {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const today = await getToday(supabase);

  const { data: matchData, error } = await supabase
    .from("matches")
    .select("id, started_at, employment_ends_on, housing_ends_on, other:profiles!matches_host_id_fkey(full_name, email)")
    .eq("joey_id", profile.id)
    .is("ended_at", null)
    .order("started_at");
  if (error) throw new Error(error.message);
  const match = (matchData as unknown as MatchRow[])[0];
  const agreements = await agreementRows("joey");
  const agreementsCard: HomeCardData = {
    title: "Agreements",
    href: "/joey/agreements",
    rows: agreements,
    empty: "No agreements waiting on anyone.",
  };

  if (!match) {
    const locked = "Unlocks once you're matched with a Host.";
    return [
      { title: "Timesheets", href: "/joey/timesheets", rows: [], empty: locked },
      { title: "Payments", href: "/joey/payments", rows: [], empty: locked },
      agreementsCard,
      { title: "My Host", href: "/joey/hosts", rows: [], empty: "You're not matched with a Host yet." },
    ];
  }

  const hostName = personName(match.other);
  const from = addDays(mondayOf(today), -63);
  const to = addDays(today, 60);
  const [entries, spansData, { periods }, balances, terms, schedules, statement] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, work_date, kind, hours, status")
      .eq("match_id", match.id)
      .gte("work_date", from)
      .lte("work_date", to),
    supabase.rpc("pay_periods_between", { p_match: match.id, p_from: from, p_to: to }),
    getPayPeriods("joey"),
    getPtoBalances(supabase, [match.id]),
    supabase
      .from("match_terms")
      .select("match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, proposed_by")
      .eq("match_id", match.id)
      .in("status", ["accepted", "proposed"]),
    getPaySchedules(supabase, [match.id], today),
    statementRow("joey", today),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  if (spansData.error) throw new Error(spansData.error.message);
  if (terms.error) throw new Error(terms.error.message);
  const list = entries.data as Pick<TimeEntry, "id" | "work_date" | "kind" | "hours" | "status">[];
  const spans = spansData.data as PeriodSpan[];
  const termRows = (terms.data ?? []) as TermRow[];
  const periodOf = (d: string) => spans.find((p) => p.period_start <= d && d <= p.period_end);
  const current = periodOf(today);
  const week = (d: string) => `/joey/timesheets?match=${match.id}&week=${mondayOf(d)}`;

  // Timesheets: days to submit or fix, then this pay period and any waiting for approval.
  const ts: HomeRow[] = [];
  const open = (e: (typeof list)[number]) => e.status === "draft" || e.status === "changes_requested";
  const overdue = list
    .filter((e) => {
      const p = periodOf(e.work_date);
      return e.status === "draft" && p && p.period_end < today;
    })
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (overdue.length) {
    const first = periodOf(overdue[0].work_date)!;
    ts.push({
      key: "overdue",
      label: formatRange(first.period_start, first.period_end),
      detail: `${overdue.length} ${overdue.length === 1 ? "day" : "days"} not submitted, so you're paid on time`,
      href: week(overdue[0].work_date),
      status: "Overdue, submit now",
      tone: "stopped",
      action: true,
    });
  }
  for (const e of list.filter((x) => x.status === "changes_requested").slice(0, 3)) {
    ts.push({
      key: `fix-${e.id}`,
      label: formatShort(e.work_date),
      detail: "Your Host asked for a change",
      href: week(e.work_date),
      status: "Fix and resubmit",
      tone: "stopped",
      action: true,
    });
  }
  if (current) {
    const inPeriod = list.filter((e) => e.work_date >= current.period_start && e.work_date <= current.period_end);
    const logged = inPeriod.filter((e) => e.kind === "work").reduce((s, e) => s + Number(e.hours), 0);
    ts.push({
      key: "current",
      label: formatRange(current.period_start, current.period_end),
      detail: "This pay period",
      href: week(today),
      status: inPeriod.some(open) || inPeriod.length === 0 ? `Submit by ${formatShort(current.period_end)}` : "All submitted",
      tone: inPeriod.some(open) || inPeriod.length === 0 ? "neutral" : "done",
      value: `${formatHours(logged)} logged`,
    });
  }
  for (const p of periods.filter((p) => p.status === "needs_approval" && p.periodStart !== current?.period_start)) {
    ts.push({
      key: `waiting-${p.id}`,
      label: formatRange(p.periodStart, p.periodEnd),
      detail: "Submitted",
      href: p.timesheetHref,
      status: "Waiting for approval",
      tone: "waiting",
      value: formatHours(periodHours(p)),
    });
  }

  // Payments
  const pay = [...proposalRows(termRows, profile.id, () => hostName, "joey"), ...paymentRows(periods, "joey", today)];
  if (statement) pay.push(statement);

  // My Host
  const ending = match.employment_ends_on && match.housing_ends_on;
  const moveSoon = ending && today >= addDays(match.housing_ends_on!, -2);
  const schedule = SCHEDULE_LABELS[schedules.get(match.id)?.current ?? "semimonthly"];
  const host: HomeRow[] = [
    {
      key: `host-${match.id}`,
      label: hostName,
      detail: `${termsLine(currentTerms(termRows, match.id, today), schedule)} · ${formatHours(balances.get(match.id) ?? 0)} PTO`,
      value: rateValue(currentTerms(termRows, match.id, today)),
      href: "/joey/hosts",
      status: ending
        ? `Move out by ${formatShort(match.housing_ends_on!)}`
        : `Since ${formatShort(match.started_at.slice(0, 10))}`,
      tone: moveSoon ? "stopped" : ending ? "waiting" : "done",
      action: Boolean(ending),
    },
  ];

  return [
    { title: "Timesheets", href: "/joey/timesheets", rows: ts, empty: "Nothing to submit." },
    { title: "Payments", href: "/joey/payments", rows: pay, empty: "No pay periods yet." },
    agreementsCard,
    { title: "My Host", href: "/joey/hosts", rows: host, empty: "" },
  ];
}
