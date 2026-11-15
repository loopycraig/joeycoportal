"use client";

// Every payment the viewer is part of, in one list: wages (Host → Joey), rent (Joey → Host) and
// JoeyCo fees. One row each, with its direction, who pays whom, what for, the amount, when it's due
// and where it stands. A row opens to its details and anything to do about it.

import { Pill, type PillTone } from "@/components/status-pill";
import { formatMoney, formatShort } from "@/lib/timesheets";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export type PaymentItem = {
  /** Also the row's id, so Home can link to #<key>. */
  key: string;
  /** Money coming to the viewer, or going from them. */
  direction: "in" | "out";
  from: string;
  to: string;
  purpose: string;
  /** e.g. the dates it covers. */
  purposeDetail?: string;
  amountCents: number;
  /** e.g. "est." while hours can still change. */
  amountNote?: string;
  dueOn: string | null;
  status: { label: string; tone: PillTone };
  defaultOpen?: boolean;
  detail: React.ReactNode;
};

const GRID = "xl:grid xl:grid-cols-[6.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem_7rem_minmax(9rem,1.1fr)_1rem] xl:items-center xl:gap-4";

export function PaymentList({ items }: { items: PaymentItem[] }) {
  return (
    <div className="border-b text-sm">
      <div className={cn(GRID, "hidden border-b px-6 py-2 text-xs text-muted-foreground xl:grid")}>
        <span>Direction</span>
        <span>Purpose</span>
        <span>From</span>
        <span>To</span>
        <span>Due</span>
        <span className="text-right">Amount</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <PaymentRow key={item.key} item={item} />
        ))}
      </ul>
    </div>
  );
}

function PaymentRow({ item: p }: { item: PaymentItem }) {
  // Open or closed is decided once, then left to the user, so acting on it doesn't collapse it.
  const [open, setOpen] = useState(!!p.defaultOpen);
  // Linked from Home as #<key>: open it.
  useEffect(() => {
    if (window.location.hash === `#${p.key}`) setOpen(true);
  }, [p.key]);

  const amount = (
    <>
      <span className="font-medium tabular-nums">{formatMoney(p.amountCents)}</span>
      {p.amountNote && <span className="ml-1 text-xs text-muted-foreground">{p.amountNote}</span>}
    </>
  );

  return (
    <li id={p.key} className="scroll-mt-4 target:bg-accent/30">
      <details className="group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary
          className={cn(
            "cursor-pointer list-none px-4 py-3 sm:px-6",
            "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
            "[&::-webkit-details-marker]:hidden",
            GRID,
          )}
        >
          {/* Narrow screens: two lines. */}
          <div className="flex items-start gap-3 xl:hidden">
            <Direction direction={p.direction} compact />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {p.purpose}
                {p.purposeDetail && <span className="ml-2 text-muted-foreground">{p.purposeDetail}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.from} → {p.to}
                {p.dueOn && ` · due ${formatShort(p.dueOn)}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p>{amount}</p>
              <Pill tone={p.status.tone} label={p.status.label} />
            </div>
          </div>

          {/* Wide screens: one row of columns. */}
          <span className="hidden xl:block">
            <Direction direction={p.direction} />
          </span>
          <span className="hidden min-w-0 xl:block">
            <span className="block truncate">{p.purpose}</span>
            {p.purposeDetail && <span className="block truncate text-xs text-muted-foreground">{p.purposeDetail}</span>}
          </span>
          <span className="hidden truncate xl:block">{p.from}</span>
          <span className="hidden truncate xl:block">{p.to}</span>
          <span className="hidden tabular-nums xl:block">{p.dueOn ? formatShort(p.dueOn) : "—"}</span>
          <span className="hidden whitespace-nowrap text-right xl:block">{amount}</span>
          <span className="hidden min-w-0 xl:block">
            <Pill tone={p.status.tone} label={p.status.label} />
          </span>
          <ChevronDown
            aria-hidden
            className="hidden size-4 text-muted-foreground transition-transform group-open:rotate-180 xl:block"
          />
        </summary>
        <div className="px-4 pb-5 sm:px-6 xl:pl-[8.5rem]">{p.detail}</div>
      </details>
    </li>
  );
}

function Direction({ direction, compact }: { direction: "in" | "out"; compact?: boolean }) {
  const In = direction === "in";
  const Icon = In ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        In ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        compact && "mt-0.5",
      )}
      title={In ? "Inbound: money to you" : "Outbound: money from you"}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className={cn(compact && "sr-only")}>{In ? "Inbound" : "Outbound"}</span>
    </span>
  );
}
