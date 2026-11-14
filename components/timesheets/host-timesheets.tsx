"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  KIND_LABELS,
  OT_MULTIPLIER,
  addDays,
  entryFlags,
  formatDay,
  formatHours,
  formatMoney,
  formatRange,
  formatShort,
  formatTime,
  rateOn,
  totalsFor,
  weekdayIndex,
  type EntrySplit,
  type Rate,
  type ScheduledDay,
  type TimeEntry,
  type Totals,
} from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pill, StatusPill } from "@/components/status-pill";
import { EmptyState, PageHeader, SectionHeader, textareaClass } from "@/components/page-parts";
import { WeekTotals } from "@/components/timesheets/week-totals";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type HostPeriod = {
  id: string;
  matchId: string;
  joeyName: string;
  periodStart: string;
  periodEnd: string;
  payday: string;
  handedOffAt: string | null;
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
  const waiting = periods.filter((p) => !has(p, "submitted") && has(p, "changes_requested") && !p.handedOffAt);
  const ready = periods.filter((p) => !has(p, "submitted") && !has(p, "changes_requested") && !p.handedOffAt);
  const entered = periods.filter((p) => !has(p, "submitted") && p.handedOffAt).slice(0, 6);

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
      {section("Ready to enter in Poppins", ready)}
      {section("Waiting on your Joey", waiting)}
      {section("Entered in Poppins", entered)}
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
  const over = p.periodEnd < today;

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
    <article className="border-b px-4 py-4 sm:px-6">
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
          ) : p.handedOffAt ? (
            <Pill tone="done" label={`Entered ${formatShort(p.handedOffAt.slice(0, 10))}`} />
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
                      {[e.late ? "Submitted after its pay period was entered" : null, ...flags].filter(Boolean).join(" · ")}
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
        <PayrollHandoff
          period={p}
          totals={totals}
          over={over}
          pending={pending}
          onToggle={(done) =>
            act("handoff", () => createClient().rpc("set_pay_period_handed_off", { p_period: p.id, p_done: done }))
          }
        />
      )}
    </article>
  );
}

/** The numbers the Host types into Poppins, until there's an integration to send them. */
function PayrollHandoff({
  period: p,
  totals,
  over,
  pending,
  onToggle,
}: {
  period: HostPeriod;
  totals: Totals;
  over: boolean;
  pending: string | null;
  onToggle: (done: boolean) => void;
}) {
  const rate = rateOn(p.rates, p.periodEnd);
  const lines: [string, number, string | null][] = [
    ["Regular hours", totals.regular, rate ? `at ${formatMoney(rate)}/h` : null],
    ["Overtime hours", totals.overtime, rate ? `at ${formatMoney(rate * OT_MULTIPLIER)}/h` : null],
    ["PTO hours", totals.pto, null],
    ["Sick hours", totals.sick, null],
    ["Holiday hours", totals.holiday, null],
  ];

  if (p.handedOffAt) {
    return (
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => onToggle(false)}>
          {pending === "handoff" ? "Undoing…" : "Undo “entered in Poppins”"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium">Enter in Poppins</p>
      <p className="text-xs text-muted-foreground">
        For the {formatShort(p.payday)} payday. Poppins needs hours before its cutoff, a few days before payday.
      </p>
      <dl className="mt-3 grid gap-1.5 text-sm">
        {lines
          .filter(([, h], i) => i < 2 || h > 0)
          .map(([label, h, note]) => (
            <div key={label} className="flex items-center gap-3">
              <dt className="flex-1">
                {label}
                {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
              </dt>
              <dd className="tabular-nums">{Number(h.toFixed(2))}</dd>
              <CopyButton value={String(Number(h.toFixed(2)))} label={label} />
            </div>
          ))}
      </dl>
      <div className="mt-3 flex items-center justify-end gap-3">
        {!over && <span className="text-xs text-muted-foreground">You can mark this once the period ends.</span>}
        <Button size="sm" disabled={pending !== null || !over} onClick={() => onToggle(true)}>
          {pending === "handoff" ? "Saving…" : "Mark as entered in Poppins"}
        </Button>
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label.toLowerCase()}`}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the number is right there to copy by hand.
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
