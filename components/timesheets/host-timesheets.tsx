"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  KIND_LABELS,
  addDays,
  entryFlags,
  formatDay,
  formatHours,
  formatRange,
  formatShort,
  formatTime,
  totalsFor,
  weekdayIndex,
  type EntrySplit,
  type Rate,
  type ScheduledDay,
  type TimeEntry,
} from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pill, StatusPill } from "@/components/status-pill";
import { EmptyState, PageHeader, SectionHeader, textareaClass } from "@/components/page-parts";
import { WeekTotals } from "@/components/timesheets/week-totals";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type HostPeriod = {
  id: string;
  matchId: string;
  joeyName: string;
  periodStart: string;
  periodEnd: string;
  payday: string;
  paidOn: string | null;
  entries: TimeEntry[];
  rates: Rate[];
  ptoBalance: number;
  schedule: ScheduledDay[] | null;
};

/** Days after a pay period ends that the Host has to approve it, leaving time to enter payroll. */
const APPROVE_WITHIN_DAYS = 2;

export function HostTimesheets({
  today,
  periods,
  splits,
}: {
  today: string;
  periods: HostPeriod[];
  splits: Record<string, EntrySplit>;
}) {
  const has = (p: HostPeriod, s: TimeEntry["status"]) => p.entries.some((e) => e.status === s);
  const review = periods.filter((p) => has(p, "submitted")).reverse();
  const waiting = periods.filter((p) => !has(p, "submitted") && has(p, "changes_requested") && !p.paidOn);
  const ready = periods.filter((p) => !has(p, "submitted") && !has(p, "changes_requested") && !p.paidOn);
  const paid = periods.filter((p) => !has(p, "submitted") && p.paidOn).slice(0, 6);

  if (periods.length === 0) {
    return (
      <>
        <PageHeader title="Timesheets" />
        <EmptyState title="Nothing to review">
          When your Joey submits their hours, each pay period shows up here for you to approve.
        </EmptyState>
      </>
    );
  }

  const section = (title: string, list: HostPeriod[]) =>
    list.length > 0 && (
      <>
        <SectionHeader>{title}</SectionHeader>
        {list.map((p) => (
          <PeriodCard key={p.id} period={p} today={today} splits={splits} />
        ))}
      </>
    );

  return (
    <>
      <PageHeader title="Timesheets" />
      {review.length === 0 && (
        <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">You&apos;re all caught up.</p>
      )}
      {section("Waiting for your approval", review)}
      {section("Approved, not paid yet", ready)}
      {section("Waiting on your Joey", waiting)}
      {section("Paid", paid)}
    </>
  );
}

function PeriodCard({
  period: p,
  today,
  splits,
}: {
  period: HostPeriod;
  today: string;
  splits: Record<string, EntrySplit>;
}) {
  const splitMap = new Map(Object.entries(splits));
  const submitted = p.entries.filter((e) => e.status === "submitted");
  const counted = p.entries.filter((e) => e.status === "approved" || e.status === "submitted");
  const totals = totalsFor(counted, splitMap, p.rates);
  const approveBy = addDays(p.periodEnd, APPROVE_WITHIN_DAYS);
  const overdue = submitted.length > 0 && today > approveBy;

  const [selected, setSelected] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const act = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setPending(label);
    setError(null);
    const { error } = await fn();
    setPending(null);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setAsking(false);
    setSelected([]);
    setNote("");
    router.refresh();
  };

  const ptoUsedHere = submitted.filter((e) => e.kind === "pto" || e.kind === "sick").reduce((s, e) => s + Number(e.hours), 0);

  return (
    <article id={`period-${p.id}`} className="scroll-mt-4 border-b px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">{p.joeyName}</h3>
        <span className="text-sm text-muted-foreground">
          {formatRange(p.periodStart, p.periodEnd)} · paid by {formatShort(p.payday)}
        </span>
        <span className="ml-auto">
          {submitted.length > 0 ? (
            <Pill
              tone={overdue ? "stopped" : "waiting"}
              label={overdue ? `Overdue · approve by ${formatShort(approveBy)}` : `Approve by ${formatShort(approveBy)}`}
            />
          ) : p.paidOn ? (
            <Pill tone="done" label={`Paid ${formatShort(p.paidOn)}`} />
          ) : null}
        </span>
      </header>

      {weekdayIndex(p.periodStart) !== 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          The week of {formatShort(addDays(p.periodStart, -weekdayIndex(p.periodStart)))} started in the previous pay
          period. Overtime counts the whole week.
        </p>
      )}

      <ul className="mt-3 divide-y rounded-md border">
        {p.entries.map((e) => {
          const split = splits[e.id];
          const flags = entryFlags(e, split, p.schedule?.[weekdayIndex(e.work_date)] ?? null);
          const selectable = e.status === "submitted";
          return (
            <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              {asking && (
                <input
                  type="checkbox"
                  aria-label={`Ask for changes on ${formatDay(e.work_date)}`}
                  className="mt-1"
                  disabled={!selectable}
                  checked={selected.includes(e.id)}
                  onChange={(ev) =>
                    setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))
                  }
                />
              )}
              <div className="grid min-w-0 flex-1 gap-x-4 gap-y-0.5 sm:grid-cols-[7.5rem_1fr_auto]">
                <span className={cn(e.late && "text-amber-600 dark:text-amber-400")}>
                  {formatDay(e.work_date)}
                </span>
                <span className="min-w-0">
                  {e.kind === "work"
                    ? e.start_time
                      ? `${formatTime(e.start_time)} – ${formatTime(e.end_time)}${e.meal_break_minutes ? ` · ${e.meal_break_minutes}m break` : ""}`
                      : "Worked"
                    : KIND_LABELS[e.kind]}
                  {e.tags.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{e.tags.join(", ")}</span>}
                  {e.notes && <span className="block truncate text-xs text-muted-foreground">{e.notes}</span>}
                  {(flags.length > 0 || e.late) && (
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      {[e.late ? "Submitted after its pay period was paid" : null, ...flags].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {e.status === "changes_requested" && e.review_note && (
                    <span className="block text-xs text-muted-foreground">You asked: {e.review_note}</span>
                  )}
                </span>
                <span className="flex items-center gap-3 sm:justify-end">
                  <span className="tabular-nums">
                    {formatHours(e.hours)}
                    {split && split.overtime > 0 && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">({formatHours(split.overtime)} OT)</span>
                    )}
                  </span>
                  <StatusPill status={e.status} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {weekdayIndex(p.periodEnd) !== 6 && (
        <p className="mt-2 text-xs text-muted-foreground">
          The week continues in the next pay period, from {formatShort(addDays(p.periodEnd, 1))}.
        </p>
      )}

      <div className="mt-4">
        <WeekTotals totals={totals} />
      </div>

      {ptoUsedHere > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          PTO balance {formatHours(p.ptoBalance)}, {formatHours(p.ptoBalance - ptoUsedHere)} after approving.
          {p.ptoBalance - ptoUsedHere < 0 && <span className="text-red-500"> That&apos;s more than they have.</span>}
        </p>
      )}

      {asking && (
        <div className="mt-4 grid gap-2">
          <Label htmlFor={`note-${p.id}`}>What needs changing? (Your Joey sees this)</Label>
          <textarea
            id={`note-${p.id}`}
            className={textareaClass}
            placeholder="e.g. I think Tuesday ended at 3, not 4"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Tick the days to send back. You can approve the rest after.</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {submitted.length > 0 &&
          (asking ? (
            <>
              <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending !== null || selected.length === 0 || !note.trim()}
                onClick={() =>
                  act("ask", () => createClient().rpc("request_time_changes", { p_ids: selected, p_note: note }))
                }
              >
                {pending === "ask" ? "Sending…" : `Send back ${selected.length || ""}`.trim()}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => setAsking(true)}>
                Ask for changes
              </Button>
              <Button
                size="sm"
                disabled={pending !== null}
                onClick={() => act("approve", () => createClient().rpc("approve_pay_period", { p_period: p.id }))}
              >
                {pending === "approve" ? "Approving…" : `Approve ${submitted.length} ${submitted.length === 1 ? "entry" : "entries"}`}
              </Button>
            </>
          ))}
      </div>

      {submitted.length === 0 && !p.entries.some((e) => e.status === "changes_requested") && (
        <div className="mt-2 flex justify-end">
          <Link
            href="/host/payments"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {p.paidOn ? `Paid ${formatShort(p.paidOn)} · see Payments` : "Approved · pay and record it in Payments"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </article>
  );
}
