"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  KIND_LABELS,
  SCHEDULE_LABELS,
  addDays,
  formatDay,
  formatHours,
  formatRange,
  formatShort,
  formatTime,
  mondayOf,
  splitEntries,
  totalsFor,
  weekDates,
  weekdayIndex,
  type PeriodSpan,
  type Rate,
  type ScheduledDay,
  type TimeEntry,
} from "@/lib/timesheets";
import type { ScheduleInfo } from "@/lib/timesheets-server";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { StatusPill } from "@/components/status-pill";
import { PageHeader } from "@/components/page-parts";
import { EntryForm } from "@/components/timesheets/entry-form";
import { WeekTotals } from "@/components/timesheets/week-totals";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type MatchInfo = {
  id: string;
  hostId: string;
  hostName: string;
  ending: { lastDay: string; moveOut: string } | null;
};

const submittable = (e: TimeEntry, today: string) =>
  (e.status === "draft" || e.status === "changes_requested") &&
  (e.work_date <= today || e.kind === "pto" || e.kind === "holiday");

export function JoeyTimesheet({
  today,
  initialWeek,
  windowStart,
  windowEnd,
  joeyId,
  match,
  otherMatches,
  entries,
  periods,
  rates,
  ptoBalance,
  hasPtoPolicy,
  paySchedule,
  schedule,
}: {
  today: string;
  /** A week to open on (from a link), if it's in the loaded range. */
  initialWeek?: string;
  windowStart: string;
  windowEnd: string;
  joeyId: string;
  match: MatchInfo;
  otherMatches: MatchInfo[];
  entries: TimeEntry[];
  periods: PeriodSpan[];
  rates: Rate[];
  /** Approved balance from the ledger. */
  ptoBalance: number;
  hasPtoPolicy: boolean;
  paySchedule: ScheduleInfo;
  schedule: ScheduledDay[] | null;
}) {
  const [week, setWeek] = useState(
    initialWeek && initialWeek >= windowStart && initialWeek <= windowEnd ? initialWeek : mondayOf(today),
  );
  const [editing, setEditing] = useState<{ entry: TimeEntry | null; date: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const days = weekDates(week);
  const splits = useMemo(() => splitEntries(entries), [entries]);
  const weekEntries = entries.filter((e) => e.work_date >= days[0] && e.work_date <= days[6]);
  const totals = totalsFor(weekEntries, splits, rates);

  const periodFor = (d: string) => periods.find((p) => p.period_start <= d && d <= p.period_end);
  const weekPeriods = periods.filter((p) => p.period_end >= days[0] && p.period_start <= days[6]);

  // PTO not yet approved still counts against what's left to request.
  const ptoPending = entries
    .filter((e) => (e.kind === "pto" || e.kind === "sick") && e.status !== "approved")
    .reduce((s, e) => s + Number(e.hours), 0);
  const ptoAvailable = ptoBalance - ptoPending;

  const toSubmit = weekEntries.filter((e) => submittable(e, today));
  // Days from pay periods that have already ended and still aren't in.
  const overdue = entries.filter((e) => {
    const p = periodFor(e.work_date);
    return submittable(e, today) && p && p.period_end < today;
  });
  const changesRequested = entries.filter((e) => e.status === "changes_requested");

  const fillable = schedule
    ? days.filter((d, i) => schedule[i]?.hours && !weekEntries.some((e) => e.work_date === d) && !periodFor(d)?.handed_off)
    : [];

  const act = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setPending(label);
    setError(null);
    const { error } = await fn();
    setPending(null);
    if (error) setError(friendlyError(error));
    router.refresh();
  };

  const fillFromSchedule = () =>
    act("fill", () =>
      createClient()
        .from("time_entries")
        .insert(
          fillable.map((d) => {
            const s = schedule![weekdayIndex(d)];
            return {
              match_id: match.id,
              host_id: match.hostId,
              joey_id: joeyId,
              work_date: d,
              kind: "work",
              start_time: s.start,
              end_time: s.end,
              meal_break_minutes: s.start ? s.mealMinutes : 0,
              hours: s.hours,
            };
          }),
        ),
    );

  const submit = (list: TimeEntry[], label: string) =>
    act(label, () => createClient().rpc("submit_time_entries", { p_ids: list.map((e) => e.id) }));

  const canGoBack = week > windowStart;
  const canGoForward = addDays(week, 7) <= windowEnd;
  const thisWeek = mondayOf(today);

  return (
    <>
      <PageHeader
        title="Timesheets"
        actions={
          <div className="flex items-center gap-1">
            {week !== thisWeek && (
              <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>
                This week
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Previous week"
              disabled={!canGoBack}
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-28 text-center text-sm tabular-nums">{formatRange(days[0], days[6])}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Next week"
              disabled={!canGoForward}
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground sm:px-6">
        <span>
          Host: <span className="text-foreground">{match.hostName}</span>
          {otherMatches.map((m) => (
            <Link key={m.id} href={`/joey/timesheets?match=${m.id}`} className="ml-2 underline-offset-2 hover:underline">
              Switch to {m.hostName}
            </Link>
          ))}
        </span>
        <span>
          Paid {SCHEDULE_LABELS[paySchedule.current].toLowerCase()}
          {paySchedule.next && (
            <> · {SCHEDULE_LABELS[paySchedule.next.kind].toLowerCase()} from {formatShort(paySchedule.next.from)}</>
          )}
        </span>
        <span>
          PTO:{" "}
          {hasPtoPolicy || ptoBalance !== 0 ? (
            <>
              <span className="tabular-nums text-foreground">{formatHours(ptoAvailable)}</span> available
              {ptoPending > 0 && <> ({formatHours(ptoPending)} requested)</>}
            </>
          ) : (
            "none on file yet"
          )}
        </span>
      </div>

      {match.ending && (
        <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6">
          Your last day of work with {match.hostName} is {formatShort(match.ending.lastDay)}, and you&apos;ll move out by{" "}
          {formatShort(match.ending.moveOut)}. Submit all your hours through your last day so your final pay is right.{" "}
          <Link href="/joey/agreements" className="underline underline-offset-2">
            See the notice
          </Link>
        </div>
      )}

      {(overdue.length > 0 || changesRequested.length > 0) && (
        <div className="flex flex-col gap-2 border-b bg-amber-500/10 px-4 py-3 text-sm sm:px-6">
          {changesRequested.length > 0 && (
            <p>
              Your Host asked for changes on{" "}
              {changesRequested.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => {
                      setWeek(mondayOf(e.work_date));
                      setEditing({ entry: e, date: e.work_date });
                    }}
                  >
                    {formatShort(e.work_date)}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
          {overdue.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="flex-1">
                {overdue.length} {overdue.length === 1 ? "day" : "days"} from a pay period that has ended{" "}
                {overdue.length === 1 ? "isn't" : "aren't"} submitted yet. Submit now so you&apos;re paid on time.
              </p>
              <Button size="sm" disabled={pending !== null} onClick={() => submit(overdue, "overdue")}>
                {pending === "overdue" ? "Submitting…" : `Submit ${overdue.length}`}
              </Button>
            </div>
          )}
        </div>
      )}

      <ul className="border-b">
        {days.map((d, i) => {
          const dayEntries = weekEntries.filter((e) => e.work_date === d);
          const s = schedule?.[i];
          const period = periodFor(d);
          const endsHere = period && period.period_end === d && i < 6;
          return (
            <li key={d}>
              <div
                className={cn(
                  "grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-b px-4 py-3 sm:grid-cols-[10rem_1fr_auto] sm:px-6",
                  d === today && "bg-muted/40",
                )}
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {formatDay(d)}
                    {d === today && <span className="ml-2 text-xs font-normal text-muted-foreground">Today</span>}
                  </p>
                  {s?.hours ? (
                    <p className="text-xs text-muted-foreground">
                      Scheduled {s.label ? `${s.label} · ` : ""}
                      {formatHours(s.hours)}
                    </p>
                  ) : null}
                </div>
                <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:row-start-auto">
                  {dayEntries.map((e) => (
                    <EntryButton
                      key={e.id}
                      entry={e}
                      overtime={splits.get(e.id)?.overtime ?? 0}
                      onClick={() => setEditing({ entry: e, date: d })}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 justify-self-end"
                  aria-label={`Add time for ${formatDay(d)}`}
                  onClick={() => setEditing({ entry: null, date: d })}
                >
                  <Plus />
                </Button>
              </div>
              {endsHere && <PeriodDivider period={period} />}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {weekPeriods.map((p, i) => (
            <span key={p.period_start}>
              {i > 0 && " · "}
              Pay period {formatRange(p.period_start, p.period_end)}, paid by {formatShort(p.payday)}
            </span>
          ))}
        </p>
        <WeekTotals totals={totals} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {fillable.length > 0 && (
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={fillFromSchedule}>
              {pending === "fill" ? "Adding…" : `Fill ${fillable.length} ${fillable.length === 1 ? "day" : "days"} from schedule`}
            </Button>
          )}
          <Button size="sm" disabled={pending !== null || toSubmit.length === 0} onClick={() => submit(toSubmit, "week")}>
            {pending === "week"
              ? "Submitting…"
              : toSubmit.length === 0
                ? "Nothing to submit"
                : `Submit ${toSubmit.length} ${toSubmit.length === 1 ? "entry" : "entries"}`}
          </Button>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? (editing.entry ? `${KIND_LABELS[editing.entry.kind]} · ${formatDay(editing.date)}` : `Add time · ${formatDay(editing.date)}`) : ""}
      >
        {editing && (
          <EntryForm
            entry={editing.entry}
            date={editing.date}
            today={today}
            match={match}
            joeyId={joeyId}
            scheduled={schedule?.[weekdayIndex(editing.date)] ?? null}
            ptoBalance={
              ptoAvailable +
              (editing.entry && (editing.entry.kind === "pto" || editing.entry.kind === "sick") && editing.entry.status !== "approved"
                ? Number(editing.entry.hours)
                : 0)
            }
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function EntryButton({ entry, overtime, onClick }: { entry: TimeEntry; overtime: number; onClick: () => void }) {
  const what =
    entry.kind === "work"
      ? entry.start_time
        ? `${formatTime(entry.start_time)} – ${formatTime(entry.end_time)}${entry.meal_break_minutes ? ` · ${entry.meal_break_minutes}m break` : ""}`
        : "Worked"
      : KIND_LABELS[entry.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate">
        {what}
        {entry.tags.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{entry.tags.join(", ")}</span>}
        {entry.late && <span className="ml-2 text-xs text-muted-foreground">Paid in a later period</span>}
      </span>
      <span className="tabular-nums">
        {formatHours(entry.hours)}
        {overtime > 0 && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">({formatHours(overtime)} OT)</span>}
      </span>
      <StatusPill status={entry.status} />
    </button>
  );
}

function PeriodDivider({ period }: { period: PeriodSpan }) {
  return (
    <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground sm:px-6">
      <span className="h-px flex-1 bg-border" />
      Pay period {formatRange(period.period_start, period.period_end)} ends · paid by {formatShort(period.payday)}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

