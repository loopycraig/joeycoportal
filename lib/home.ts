// What the Home cards show, for each portal. Server only: reads with the signed-in user's session.

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { listMyAgreements, personLabel } from "@/lib/agreements/queries";
import { KIND_LABEL, isNotice, needsAction, statusLabel } from "@/lib/agreements/fields";
import { getStatements } from "@/lib/payments/queries";
import { personName, type Person } from "@/lib/people";
import {
  SCHEDULE_LABELS,
  addDays,
  formatHours,
  formatMoney,
  formatRange,
  formatShort,
  mondayOf,
  splitEntries,
  totalsFor,
  type PeriodSpan,
  type TimeEntry,
} from "@/lib/timesheets";
import { getPaySchedules, getPtoBalances, getRates, getToday } from "@/lib/timesheets-server";
import type { HomeAction, HomeCardData } from "@/components/home/home-grid";

/** Days after a pay period ends that the Host has to approve it (same as the Timesheets page). */
const APPROVE_WITHIN_DAYS = 2;

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

const money = (c: number | null, suffix: string) => (c === null ? "not set" : `${formatMoney(c)}${suffix}`);

/** In force today, from accepted terms. */
function currentTerms(rows: TermRow[], matchId: string, today: string) {
  return rows
    .filter((t) => t.match_id === matchId && t.status === "accepted" && t.effective_date <= today)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    .at(-1);
}

function nextChange(rows: TermRow[], matchId: string, today: string) {
  return rows
    .filter((t) => t.match_id === matchId && t.status === "accepted" && t.effective_date > today)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0];
}

async function statementLine(today: string): Promise<string | null> {
  const statements = await getStatements();
  const next = statements
    .filter((s) => s.payment && s.payment.status === "pending" && s.pay_date >= today)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))[0];
  if (next?.payment) {
    const what = next.payment.direction === "charge" ? "charge" : "payout";
    return `Next statement: ${formatMoney(next.payment.amount_cents)} ${what} on ${formatShort(next.pay_date)}`;
  }
  return statements.length === 0 ? "No statements yet" : null;
}

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

  const [periods, terms, agreements, statement] = await Promise.all([
    ids.length
      ? supabase
          .from("pay_periods")
          .select("id, match_id, period_start, period_end, payday, time_entries(status)")
          .in("match_id", ids)
          .is("paid_on", null)
          .order("period_start")
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase
          .from("match_terms")
          .select("match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, proposed_by")
          .in("match_id", ids)
          .in("status", ["accepted", "proposed"])
      : Promise.resolve({ data: [], error: null }),
    listMyAgreements(),
    statementLine(today),
  ]);
  if (periods.error) throw new Error(periods.error.message);
  if (terms.error) throw new Error(terms.error.message);
  const termRows = (terms.data ?? []) as TermRow[];

  // Timesheets, and approved periods to pay (Payments)
  const ts: HomeAction[] = [];
  const tsInfo: string[] = [];
  const pay: HomeAction[] = [];
  type PeriodRow = {
    id: string;
    match_id: string;
    period_start: string;
    period_end: string;
    payday: string;
    time_entries: { status: string }[];
  };
  for (const p of (periods.data ?? []) as PeriodRow[]) {
    const statuses = p.time_entries.map((e) => e.status);
    const submitted = statuses.filter((s) => s === "submitted").length;
    const range = formatRange(p.period_start, p.period_end);
    if (submitted > 0) {
      const due = addDays(p.period_end, APPROVE_WITHIN_DAYS);
      ts.push({
        label: `Approve ${nameOf(p.match_id)}'s hours, ${range}`,
        detail: `${submitted} ${submitted === 1 ? "entry" : "entries"} · ${today > due ? "overdue, was due" : "approve by"} ${formatShort(due)}`,
        href: "/host/timesheets",
        urgent: today > due,
      });
    } else if (statuses.includes("changes_requested")) {
      tsInfo.push(`Waiting on ${nameOf(p.match_id)} to fix hours for ${range}`);
    } else if (statuses.length > 0 && statuses.every((s) => s === "approved") && p.period_end < today) {
      pay.push({
        label: `Pay ${nameOf(p.match_id)} for ${range}`,
        detail: `${today > p.payday ? "Overdue, was due" : "Due"} ${formatShort(p.payday)} · then mark it paid`,
        href: "/host/payments",
        urgent: today > p.payday,
      });
    }
  }
  if (ts.length === 0 && tsInfo.length === 0) tsInfo.push(matches.length ? "No hours waiting for you." : "Hours show up here once you have a Joey.");

  // Payments
  for (const t of termRows.filter((t) => t.status === "proposed" && t.proposed_by !== profile.id)) {
    pay.push({ label: `Respond to ${nameOf(t.match_id)}'s proposed terms`, href: "/host/payments" });
  }
  const payInfo = matches.map((m) => {
    const t = currentTerms(termRows, m.id, today);
    return `${personName(m.other)}: ${money(t?.hourly_rate_cents ?? null, "/hr")} · rent ${money(t?.monthly_rent_cents ?? null, "/mo")}`;
  });
  if (statement) payInfo.push(statement);

  // Agreements
  const ag: HomeAction[] = agreements
    .filter((a) => a.status !== "void" && needsAction(a.status, "host", a.kind))
    .map((a) => ({
      label: `${KIND_LABEL[a.kind]}${a.kind === "host_services" ? "" : ` with ${personLabel(a.joey)}`}`,
      detail: statusLabel(a.status, "host", a.kind),
      href: `/host/agreements/${a.id}`,
    }));
  const withJoey = agreements.filter((a) => a.status === "sent" && !isNotice(a.kind)).length;
  const unread = agreements.filter((a) => a.status === "sent" && isNotice(a.kind));
  const agInfo: string[] = [];
  if (withJoey) agInfo.push(`${withJoey} with your ${withJoey === 1 ? "Joey" : "Joeys"} to review and sign`);
  for (const n of unread) agInfo.push(`${personLabel(n.joey)} hasn't acknowledged the ${KIND_LABEL[n.kind].toLowerCase()} yet`);

  // My Joeys
  const joeys: HomeAction[] = [];
  const joeysInfo: string[] = [];
  if (matches.length === 0) joeys.push({ label: "Add your Joey", detail: "By the email they signed up with", href: "/host/joeys" });
  for (const m of matches) {
    const name = personName(m.other);
    if (m.employment_ends_on && m.housing_ends_on) {
      if (today >= m.employment_ends_on) {
        joeys.push({
          label: `Run ${name}'s final pay in Poppins`,
          detail: `Last day was ${formatShort(m.employment_ends_on)} · include unused PTO`,
          href: "/host/joeys",
          urgent: true,
        });
      }
      joeysInfo.push(`${name}: last day ${formatShort(m.employment_ends_on)} · moves out by ${formatShort(m.housing_ends_on)}`);
    } else {
      joeysInfo.push(`${name}, since ${formatShort(m.started_at.slice(0, 10))}`);
    }
    const change = nextChange(termRows, m.id, today);
    const now = currentTerms(termRows, m.id, today);
    if (change && change.hourly_rate_cents !== (now?.hourly_rate_cents ?? null)) {
      joeysInfo.push(`${name}'s rate becomes ${money(change.hourly_rate_cents, "/hr")} on ${formatShort(change.effective_date)}`);
    }
  }
  const schedules = await getPaySchedules(supabase, ids, today);
  for (const m of matches) {
    const s = schedules.get(m.id);
    if (s?.next) {
      joeysInfo.push(`${personName(m.other)} is paid ${SCHEDULE_LABELS[s.next.kind].toLowerCase()} from ${formatShort(s.next.from)}`);
    }
  }

  return [
    { title: "Timesheets", href: "/host/timesheets", actions: ts, info: tsInfo },
    { title: "Payments", href: "/host/payments", actions: pay, info: payInfo },
    { title: "Agreements", href: "/host/agreements", actions: ag, info: agInfo },
    { title: "My Joeys", href: "/host/joeys", actions: joeys, info: joeysInfo },
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
  const matches = matchData as unknown as MatchRow[];
  const match = matches[0];
  const agreements = await listMyAgreements();

  // Agreements (needed even before a match)
  const ag: HomeAction[] = agreements
    .filter((a) => needsAction(a.status, "joey", a.kind))
    .map((a) => ({
      label: isNotice(a.kind) ? `Acknowledge: ${KIND_LABEL[a.kind]}` : `Review and sign: ${KIND_LABEL[a.kind]}`,
      detail: `From ${personLabel(a.host)}`,
      href: `/joey/agreements/${a.id}`,
    }));
  const waitingOnHost = agreements.filter((a) => a.status === "awaiting_countersign").length;
  const agInfo = waitingOnHost ? [`${waitingOnHost} signed by you, waiting for your Host`] : [];

  if (!match) {
    return [
      { title: "Timesheets", href: "/joey/timesheets", actions: [], info: ["Unlocks once you're matched with a Host."] },
      { title: "Payments", href: "/joey/payments", actions: [], info: ["Unlocks once you're matched with a Host."] },
      { title: "Agreements", href: "/joey/agreements", actions: ag, info: agInfo },
      { title: "My Host", href: "/joey/hosts", actions: [], info: ["You're not matched with a Host yet."] },
    ];
  }

  const hostName = personName(match.other);
  const from = addDays(mondayOf(today), -63);
  const to = addDays(today, 60);
  const [entries, periods, rates, balances, terms, schedules, statement] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, work_date, kind, hours, start_time, status, pay_period_id")
      .eq("match_id", match.id)
      .gte("work_date", from)
      .lte("work_date", to),
    supabase.rpc("pay_periods_between", { p_match: match.id, p_from: from, p_to: to }),
    getRates(supabase, [match.id]),
    getPtoBalances(supabase, [match.id]),
    supabase
      .from("match_terms")
      .select("match_id, effective_date, hourly_rate_cents, monthly_rent_cents, status, proposed_by")
      .eq("match_id", match.id)
      .in("status", ["accepted", "proposed"]),
    getPaySchedules(supabase, [match.id], today),
    statementLine(today),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  if (periods.error) throw new Error(periods.error.message);
  const list = entries.data as Pick<TimeEntry, "id" | "work_date" | "kind" | "hours" | "start_time" | "status" | "pay_period_id">[];
  const spans = periods.data as PeriodSpan[];
  const termRows = (terms.data ?? []) as TermRow[];
  const periodOf = (d: string) => spans.find((p) => p.period_start <= d && d <= p.period_end);
  const current = periodOf(today);

  // Timesheets
  const ts: HomeAction[] = [];
  const open = (e: (typeof list)[number]) => e.status === "draft" || e.status === "changes_requested";
  const overdue = list.filter((e) => {
    const p = periodOf(e.work_date);
    return open(e) && (e.work_date <= today || e.kind === "pto" || e.kind === "holiday") && p && p.period_end < today;
  });
  if (overdue.length) {
    const first = periodOf(overdue.map((e) => e.work_date).sort()[0])!;
    ts.push({
      label: `Submit ${overdue.length} overdue ${overdue.length === 1 ? "day" : "days"}`,
      detail: `From ${formatRange(first.period_start, first.period_end)} · so you're paid on time`,
      href: "/joey/timesheets",
      urgent: true,
    });
  }
  for (const e of list.filter((x) => x.status === "changes_requested").slice(0, 3)) {
    ts.push({ label: `Fix ${formatShort(e.work_date)}`, detail: "Your Host asked for a change", href: "/joey/timesheets" });
  }
  const tsInfo: string[] = [];
  if (current) {
    const logged = list
      .filter((e) => e.kind === "work" && e.work_date >= current.period_start && e.work_date <= current.period_end)
      .reduce((s, e) => s + Number(e.hours), 0);
    tsInfo.push(`This pay period, ${formatRange(current.period_start, current.period_end)}: ${formatHours(logged)} logged`);
    if (current.period_end >= today) tsInfo.push(`Submit it by ${formatShort(current.period_end)}`);
  }
  if (match.employment_ends_on) tsInfo.push(`Your last day of work is ${formatShort(match.employment_ends_on)}`);

  // Payments
  const pay: HomeAction[] = termRows
    .filter((t) => t.status === "proposed" && t.proposed_by !== profile.id)
    .map(() => ({ label: `Respond to ${hostName}'s proposed terms`, href: "/joey/payments" }));
  const payInfo: string[] = [];
  if (current) {
    const inPeriod = list.filter((e) => e.work_date >= current.period_start && e.work_date <= current.period_end);
    const totals = totalsFor(inPeriod, splitEntries(list), rates.get(match.id) ?? []);
    payInfo.push(
      `Next payday ${formatShort(current.payday)}: about ${formatMoney(totals.grossCents)} before taxes so far`,
    );
  }
  const now = currentTerms(termRows, match.id, today);
  payInfo.push(`Hourly rate ${money(now?.hourly_rate_cents ?? null, "/hr")} · rent ${money(now?.monthly_rent_cents ?? null, "/mo")}`);
  const { data: paidRows } = await supabase
    .from("pay_periods")
    .select("period_start, period_end, payday, paid_on, paid_amount_cents")
    .eq("match_id", match.id)
    .order("period_start", { ascending: false })
    .limit(6);
  const lastPaid = (paidRows ?? []).find((p) => p.paid_on);
  if (lastPaid) {
    payInfo.push(
      `Last paid ${formatMoney(lastPaid.paid_amount_cents ?? 0)} on ${formatShort(lastPaid.paid_on!)} for ${formatRange(lastPaid.period_start, lastPaid.period_end)}`,
    );
  }
  for (const p of (paidRows ?? []).filter((p) => !p.paid_on && p.payday < today)) {
    payInfo.push(`${formatRange(p.period_start, p.period_end)} isn't marked paid yet (was due ${formatShort(p.payday)})`);
  }
  payInfo.push(`PTO available: ${formatHours(balances.get(match.id) ?? 0)}`);
  if (statement) payInfo.push(statement);

  // My Host
  const hostInfo: string[] = [`${hostName}, since ${formatShort(match.started_at.slice(0, 10))}`];
  const hostActions: HomeAction[] = [];
  if (match.employment_ends_on && match.housing_ends_on) {
    hostActions.push({
      label: `Move out by ${formatShort(match.housing_ends_on)}`,
      detail: `Your last day of work is ${formatShort(match.employment_ends_on)}`,
      href: "/joey/agreements",
      urgent: today >= addDays(match.housing_ends_on, -2),
    });
  }
  const change = nextChange(termRows, match.id, today);
  if (change && change.hourly_rate_cents !== (now?.hourly_rate_cents ?? null)) {
    hostInfo.push(`Your rate becomes ${money(change.hourly_rate_cents, "/hr")} on ${formatShort(change.effective_date)}`);
  }
  const s = schedules.get(match.id);
  hostInfo.push(
    s?.next
      ? `Paid ${SCHEDULE_LABELS[s.current].toLowerCase()}, then ${SCHEDULE_LABELS[s.next.kind].toLowerCase()} from ${formatShort(s.next.from)}`
      : `Paid ${SCHEDULE_LABELS[s?.current ?? "semimonthly"].toLowerCase()}`,
  );

  return [
    { title: "Timesheets", href: "/joey/timesheets", actions: ts, info: tsInfo },
    { title: "Payments", href: "/joey/payments", actions: pay, info: payInfo },
    { title: "Agreements", href: "/joey/agreements", actions: ag, info: agInfo },
    { title: "My Host", href: "/joey/hosts", actions: hostActions, info: hostInfo },
  ];
}
