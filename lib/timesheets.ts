// Timesheets: shared types and the arithmetic both portals use (dates, overtime, estimated pay).
// Safe to import from server or client components.

export type EntryKind = "work" | "pto" | "sick" | "holiday";
export type EntryStatus = "draft" | "submitted" | "approved" | "changes_requested";
export type PayScheduleKind = "semimonthly" | "weekly" | "biweekly" | "monthly";

export type TimeEntry = {
  id: string;
  match_id: string;
  joey_id: string;
  host_id: string;
  work_date: string; // YYYY-MM-DD
  kind: EntryKind;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  meal_break_minutes: number;
  hours: number;
  tags: string[];
  notes: string | null;
  status: EntryStatus;
  pay_period_id: string | null;
  late: boolean;
  review_note: string | null;
};

export const ENTRY_FIELDS =
  "id, match_id, joey_id, host_id, work_date, kind, start_time, end_time, meal_break_minutes, hours, tags, notes, status, pay_period_id, late, review_note";

export type PeriodSpan = { period_start: string; period_end: string; payday: string; handed_off: boolean };

export type Rate = { effective_date: string; hourly_rate_cents: number | null };

/** The Exhibit A categories, offered as optional tags on a worked day. */
export const TAGS = ["Around the House", "Meals & Groceries", "Out & About", "Wellness", "Staying Connected"];

export const KIND_LABELS: Record<EntryKind, string> = {
  work: "Worked",
  pto: "PTO",
  sick: "Sick",
  holiday: "Holiday",
};

export const SCHEDULE_LABELS: Record<PayScheduleKind, string> = {
  semimonthly: "Semi-monthly",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
};

// ---------------------------------------------------------------------------
// Dates. Everything is a YYYY-MM-DD string; arithmetic happens in UTC so time zones never shift a day.
// ---------------------------------------------------------------------------

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number) {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string) {
  return (toUTC(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the workweek (Mon–Sun) containing the date. */
export function mondayOf(iso: string) {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  toUTC(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** "Mon, Nov 10" */
export const formatDay = (iso: string) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });
/** "Nov 10" */
export const formatShort = (iso: string) => fmt(iso, { month: "short", day: "numeric" });

/** "Nov 1 – 15", or "Nov 24 – Dec 7" across months. */
export function formatRange(from: string, to: string) {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${formatShort(from)} – ${sameMonth ? Number(to.slice(8)) : formatShort(to)}`;
}

// ---------------------------------------------------------------------------
// Times and hours
// ---------------------------------------------------------------------------

export function formatHours(h: number) {
  return `${Number(h).toFixed(2).replace(/\.?0+$/, "")}h`;
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "09:30:00" → "9:30a" */
export function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "a" : "p";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Same rule as the database: an end before the start runs past midnight. */
export function hoursBetween(start: string, end: string, mealMinutes: number) {
  let span = minutes(end) - minutes(start);
  if (span <= 0) span += 24 * 60;
  return Math.round(((span - mealMinutes) / 60) * 100) / 100;
}

/** Reads loose schedule times like "9am", "9:30 am", "13:00" or "noon" into "HH:MM". */
export function parseLooseTime(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/\./g, "");
  if (!t) return null;
  if (t === "noon") return "12:00";
  if (t === "midnight") return "00:00";
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  if (m[3]?.startsWith("p") && h < 12) h += 12;
  if (m[3]?.startsWith("a") && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The Joey's typical schedule (offer letter, Exhibit A)
// ---------------------------------------------------------------------------

export type ScheduledDay = {
  label: string; // "9am – 1pm" as written in the contract
  hours: number | null;
  start: string | null; // HH:MM, when the contract's times can be read
  end: string | null;
  mealMinutes: number;
};

/** Monday … Sunday from the offer letter's schedule rows. */
export function scheduleFromContract(
  rows: { begin: string; end: string; resume: string; finish: string; hours: string }[] | null,
): ScheduledDay[] | null {
  if (!rows || rows.length < 7) return null;
  const days = rows.slice(0, 7).map((r): ScheduledDay => {
    const parsedHours = Number.parseFloat(r.hours.replace(/[^0-9.]/g, ""));
    const begin = parseLooseTime(r.begin);
    const end = parseLooseTime(r.end);
    const resume = parseLooseTime(r.resume);
    const finish = parseLooseTime(r.finish);
    const split = begin && end && resume && finish;
    const start = begin;
    const stop = split ? finish : end;
    let meal = split ? minutes(resume) - minutes(end) : 0;
    if (meal < 0 || meal > 240) meal = 0;
    const hours =
      Number.isFinite(parsedHours) && parsedHours > 0
        ? parsedHours
        : start && stop
          ? hoursBetween(start, stop, meal)
          : null;
    const label = [r.begin, r.end].every((x) => x.trim())
      ? split
        ? `${r.begin} – ${r.end}, ${r.resume} – ${r.finish}`
        : `${r.begin} – ${r.end}`
      : "";
    return { label, hours, start: start && stop ? start : null, end: start && stop ? stop : null, mealMinutes: meal };
  });
  return days.some((d) => d.hours) ? days : null;
}

// ---------------------------------------------------------------------------
// Overtime (California live-in household rule, as chosen with counsel's review pending):
// hours past 9 in a day, and every hour on the 6th or 7th day worked in a Mon–Sun workweek.
// ---------------------------------------------------------------------------

export const DAILY_OT_AFTER = 9;
export const OT_MULTIPLIER = 1.5;

export type EntrySplit = { regular: number; overtime: number; dayNumber: number | null };

type SplitInput = Pick<TimeEntry, "id" | "work_date" | "kind" | "hours" | "start_time">;

/** Regular and overtime hours for each worked entry, from every entry in the same workweeks. */
export function splitEntries(entries: SplitInput[]): Map<string, EntrySplit> {
  const out = new Map<string, EntrySplit>();
  const work = entries
    .filter((e) => e.kind === "work")
    .sort((a, b) =>
      a.work_date === b.work_date
        ? (a.start_time ?? "").localeCompare(b.start_time ?? "")
        : a.work_date.localeCompare(b.work_date),
    );

  let week = "";
  let lastDay = "";
  let dayNumber = 0;
  let dayTotal = 0;
  for (const e of work) {
    const w = mondayOf(e.work_date);
    if (w !== week) {
      week = w;
      dayNumber = 0;
      lastDay = "";
    }
    if (e.work_date !== lastDay) {
      lastDay = e.work_date;
      dayNumber += 1;
      dayTotal = 0;
    }
    const h = Number(e.hours);
    let overtime: number;
    if (dayNumber >= 6) {
      overtime = h;
    } else {
      const before = dayTotal;
      overtime = Math.max(0, before + h - DAILY_OT_AFTER) - Math.max(0, before - DAILY_OT_AFTER);
    }
    dayTotal += h;
    out.set(e.id, { regular: round2(h - overtime), overtime: round2(overtime), dayNumber });
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The hourly rate in force on a date (rows without a rate are skipped). */
export function rateOn(rates: Rate[], date: string): number | null {
  return rateFor(rates, date)?.cents ?? null;
}

/**
 * The rate for a day. Days before the first agreed rate (say, hours worked before the offer
 * letter's start date) use that first rate, marked `assumed` so the estimate can say so.
 */
export function rateFor(rates: Rate[], date: string): { cents: number; assumed: boolean } | null {
  const known = rates
    .filter((r): r is Rate & { hourly_rate_cents: number } => r.hourly_rate_cents !== null)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  if (known.length === 0) return null;
  const inForce = known.filter((r) => r.effective_date <= date).at(-1);
  return inForce ? { cents: inForce.hourly_rate_cents, assumed: false } : { cents: known[0].hourly_rate_cents, assumed: true };
}

const firstRateDate = (rates: Rate[]) =>
  rates
    .filter((r) => r.hourly_rate_cents !== null)
    .map((r) => r.effective_date)
    .sort()[0] ?? null;

export type Totals = {
  regular: number;
  overtime: number;
  pto: number;
  sick: number;
  holiday: number;
  grossCents: number;
  missingRate: boolean;
  /** Some days are before the first agreed rate and were estimated at it. */
  assumedRateFrom: string | null;
};

/** Hours by type and estimated gross pay for a set of entries (split from their full weeks). */
export function totalsFor(entries: SplitInput[], splits: Map<string, EntrySplit>, rates: Rate[]): Totals {
  const t: Totals = { regular: 0, overtime: 0, pto: 0, sick: 0, holiday: 0, grossCents: 0, missingRate: false, assumedRateFrom: null };
  for (const e of entries) {
    const rate = rateFor(rates, e.work_date);
    if (rate === null) t.missingRate = true;
    else if (rate.assumed) t.assumedRateFrom = firstRateDate(rates);
    const r = rate?.cents ?? 0;
    const h = Number(e.hours);
    if (e.kind === "work") {
      const s = splits.get(e.id) ?? { regular: h, overtime: 0 };
      t.regular += s.regular;
      t.overtime += s.overtime;
      t.grossCents += s.regular * r + s.overtime * r * OT_MULTIPLIER;
    } else {
      t[e.kind] += h;
      t.grossCents += h * r;
    }
  }
  for (const k of ["regular", "overtime", "pto", "sick", "holiday"] as const) t[k] = round2(t[k]);
  t.grossCents = Math.round(t.grossCents);
  return t;
}

/** Days a Host should look at twice. */
export function entryFlags(e: TimeEntry, split: EntrySplit | undefined, scheduled: ScheduledDay | null): string[] {
  const flags: string[] = [];
  if (e.kind !== "work") return flags;
  if (split?.dayNumber && split.dayNumber >= 6) flags.push(`${split.dayNumber === 6 ? "6th" : "7th"} day worked this week`);
  else if (split && split.overtime > 0) flags.push(`Over ${DAILY_OT_AFTER}h`);
  if (e.start_time && Number(e.hours) > 5 && e.meal_break_minutes < 30) flags.push("No meal break");
  if (scheduled?.hours && Number(e.hours) > scheduled.hours + 0.5) flags.push(`Scheduled ${formatHours(scheduled.hours)}`);
  return flags;
}
