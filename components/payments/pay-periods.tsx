"use client";

// A pay period's details in the payments list: the days in it (linking back to Timecards), approving
// them and, for the Host, recording the payment.

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import type { PayPeriod } from "@/lib/payments/periods";
import {
  KIND_LABELS,
  OT_MULTIPLIER,
  formatDay,
  formatHours,
  formatMoney,
  formatShort,
  formatTime,
  rateOn,
} from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import { WeekTotals } from "@/components/timesheets/week-totals";
import { ArrowRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** A pay period's days, totals and, for the Host, approving the hours and recording the payment. */
export function PayPeriodDetail({ period: p, role, today }: { period: PayPeriod; role: "host" | "joey"; today: string }) {
  const submitted = p.entries.filter((e) => e.status === "submitted").length;
  return (
    <div className="space-y-4">
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

      {role === "host" && submitted > 0 && <ApprovePeriod periodId={p.id} count={submitted} />}

      <WeekTotals totals={p.totals} />

      <Link href={p.timesheetHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        Open these days in Timecards
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>

      {p.paid ? (
        <PaidSummary period={p} role={role} />
      ) : role === "host" && (p.status === "due" || p.status === "overdue") ? (
        <MarkPaid period={p} today={today} />
      ) : null}
    </div>
  );
}

/** The Host approves the period's submitted hours here, the same as from Timecards. */
function ApprovePeriod({ periodId, count }: { periodId: string; count: number }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const approve = async () => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("approve_pay_period", { p_period: periodId });
    setPending(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  };

  return (
    <div className="-mt-2 flex flex-wrap items-center justify-end gap-3">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="button" size="sm" disabled={pending} onClick={approve}>
        {pending ? "Approving…" : `Approve ${count} ${count === 1 ? "entry" : "entries"}`}
      </Button>
    </div>
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
