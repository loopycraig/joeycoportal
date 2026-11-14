"use client";

// Pay by pay period. Each row: the period, what it comes to, when it's due, and paid or not.
// Expanded: the days in it (linking back to Timesheets) and, for the Host, recording the payment.

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import type { PayPeriod } from "@/lib/payments/periods";
import { PAY_STATUS } from "@/lib/payments/pay-status";
import {
  KIND_LABELS,
  OT_MULTIPLIER,
  formatDay,
  formatHours,
  formatMoney,
  formatRange,
  formatShort,
  formatTime,
  rateOn,
} from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import { WeekTotals } from "@/components/timesheets/week-totals";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, ChevronDown, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";


export function PayPeriodList({
  periods,
  role,
  today,
}: {
  periods: PayPeriod[];
  role: "host" | "joey";
  today: string;
}) {
  return (
    <ul className="divide-y border-b">
      {periods.map((p) => (
        <PayPeriodRow key={p.id} period={p} role={role} today={today} />
      ))}
    </ul>
  );
}

function PayPeriodRow({ period: p, role, today }: { period: PayPeriod; role: "host" | "joey"; today: string }) {
  const s = PAY_STATUS[p.status];
  const amount = p.paid ? p.paid.amountCents : p.totals.grossCents;
  const ref = useRef<HTMLDetailsElement>(null);
  // Linked from Home as #pay-<id>: open it and bring it into view.
  useEffect(() => {
    if (window.location.hash === `#pay-${p.id}` && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
  }, [p.id]);
  return (
    <li id={`pay-${p.id}`} className="scroll-mt-4">
      <details ref={ref} className="group" open={role === "host" && (p.status === "overdue" || p.status === "due") && p.periodEnd < today}>
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-4 px-4 py-3 text-sm sm:px-6",
            "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.dot)} />
          <div className="min-w-0 flex-1">
            <p className="truncate">
              {formatRange(p.periodStart, p.periodEnd)}
              <span className="ml-2 text-muted-foreground">{p.otherName}</span>
            </p>
            <p className={cn("text-xs", p.status === "overdue" ? "text-red-500" : "text-muted-foreground")}>
              {role === "host" ? s.host : s.joey}
              {p.paid ? ` on ${formatShort(p.paid.on)}` : ` · due ${formatShort(p.payday)}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-medium tabular-nums">{formatMoney(amount)}</p>
            <p className="text-xs text-muted-foreground">{p.paid ? "paid, gross" : "estimated, gross"}</p>
          </div>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-4 px-4 pb-5 sm:px-6 sm:pl-12">
          <ul className="divide-y rounded-md border text-sm">
            {p.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2">
                <span className="w-28 shrink-0">{formatDay(e.work_date)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {e.kind === "work"
                    ? e.start_time
                      ? `${formatTime(e.start_time)} – ${formatTime(e.end_time)}`
                      : "Worked"
                    : KIND_LABELS[e.kind]}
                  {e.late && " · from an earlier period"}
                </span>
                <span className="tabular-nums">
                  {formatHours(e.hours)}
                  {(p.splits[e.id]?.overtime ?? 0) > 0 && (
                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                      ({formatHours(p.splits[e.id].overtime)} OT)
                    </span>
                  )}
                </span>
                <StatusPill status={e.status} />
              </li>
            ))}
          </ul>

          <WeekTotals totals={p.totals} />

          <Link href={p.timesheetHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Open these days in Timesheets
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>

          {p.paid ? (
            <PaidSummary period={p} role={role} />
          ) : role === "host" && (p.status === "due" || p.status === "overdue") ? (
            <MarkPaid period={p} today={today} />
          ) : null}
        </div>
      </details>
    </li>
  );
}

function PaidSummary({ period: p, role }: { period: PayPeriod; role: "host" | "joey" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const paid = p.paid!;

  const undo = async () => {
    if (!confirm("Mark this pay period as not paid?")) return;
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("unmark_pay_period_paid", { p_period: p.id });
    setPending(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  };

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm">
      <p>
        Paid {formatMoney(paid.amountCents)} on {formatShort(paid.on)}
        {paid.note && <span className="text-muted-foreground"> · {paid.note}</span>}
      </p>
      {role === "host" && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          disabled={pending}
          onClick={undo}
        >
          {pending ? "Undoing…" : "Mark as not paid"}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** The Host records the payment, with the hours to enter in their payroll provider. */
function MarkPaid({ period: p, today }: { period: PayPeriod; today: string }) {
  const [paidOn, setPaidOn] = useState(today < p.payday ? today : p.payday);
  const [amount, setAmount] = useState((p.totals.grossCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const rate = rateOn(p.rates, p.periodEnd);
  const t = p.totals;
  const lines: [string, number, string | null][] = [
    ["Regular hours", t.regular, rate ? `at ${formatMoney(rate)}/h` : null],
    ["Overtime hours", t.overtime, rate ? `at ${formatMoney(rate * OT_MULTIPLIER)}/h` : null],
    ["PTO hours", t.pto, null],
    ["Sick hours", t.sick, null],
    ["Holiday hours", t.holiday, null],
  ];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number.parseFloat(amount.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents)) return setError("Enter the amount paid.");
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("mark_pay_period_paid", {
      p_period: p.id,
      p_paid_on: paidOn,
      p_amount_cents: cents,
      p_note: note,
    });
    setPending(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  };

  return (
    <form onSubmit={save} className="grid gap-4 rounded-md border bg-muted/40 p-3">
      <div>
        <p className="text-sm font-medium">Pay {p.otherName}</p>
        <p className="text-xs text-muted-foreground">
          {p.payday < today
            ? `This was due ${formatShort(p.payday)}. Run it through your payroll provider (such as Poppins) now, then record it here.`
            : `Run it through your payroll provider (such as Poppins) by ${formatShort(p.payday)}, then record it here.`}
        </p>
      </div>
      <dl className="grid gap-1.5 text-sm">
        {lines
          .filter(([, h], i) => i < 2 || h > 0)
          .map(([label, h, sub]) => (
            <div key={label} className="flex items-center gap-3">
              <dt className="flex-1">
                {label}
                {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
              </dt>
              <dd className="tabular-nums">{Number(h.toFixed(2))}</dd>
              <CopyButton value={String(Number(h.toFixed(2)))} label={label} />
            </div>
          ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={`paid-on-${p.id}`}>Date paid</Label>
          <Input id={`paid-on-${p.id}`} type="date" required max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`amount-${p.id}`}>Gross amount</Label>
          <Input id={`amount-${p.id}`} inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`note-${p.id}`}>Reference (optional)</Label>
          <Input id={`note-${p.id}`} placeholder="e.g. Poppins payroll, Nov 26" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Mark as paid"}
        </Button>
      </div>
    </form>
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
