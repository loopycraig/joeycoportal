"use client";

// Rent by month: what the Joey pays the Host directly, when it's due and whether it's been received.
// The Host marks each month received (or undoes it).

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { RENT_STATUS, monthName, type RentPayment } from "@/lib/payments/rent-status";
import { formatMoney, formatShort } from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/status-pill";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function RentPaymentList({
  payments,
  role,
  today,
}: {
  payments: RentPayment[];
  role: "host" | "joey";
  today: string;
}) {
  return (
    <ul className="divide-y border-b">
      {payments.map((p) => (
        <RentRow key={p.key} payment={p} role={role} today={today} />
      ))}
    </ul>
  );
}

function RentRow({ payment: p, role, today }: { payment: RentPayment; role: "host" | "joey"; today: string }) {
  const s = RENT_STATUS[p.status];
  const host = role === "host";
  const [receivedOn, setReceivedOn] = useState(p.dueOn < today ? p.dueOn : today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  // Linked from Home as #rent-<key>: bring it into view.
  useEffect(() => {
    if (window.location.hash === `#rent-${p.key}`) ref.current?.scrollIntoView({ block: "start" });
  }, [p.key]);

  const setReceived = async (on: string | null) => {
    if (on === null && !confirm(`Mark ${monthName(p.month)} rent as not received?`)) return;
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("mark_rent_received", {
      p_match: p.matchId,
      p_month: p.month,
      p_received_on: on,
    });
    setPending(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  };

  const late = p.status === "late" && p.lateFeeCents ? ` · plus a ${formatMoney(p.lateFeeCents)} late fee` : "";
  const lateNote =
    !p.receivedOn && p.status !== "late" && p.lateFrom && p.lateFeeCents
      ? `A 5% late fee (${formatMoney(p.lateFeeCents)}) applies from ${formatShort(p.lateFrom)}.`
      : null;

  return (
    <li ref={ref} id={`rent-${p.key}`} className="scroll-mt-4 px-4 py-3 text-sm target:bg-accent/30 sm:px-6">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {monthName(p.month)} rent
            <span className="ml-2 text-muted-foreground">{p.otherName}</span>
          </p>
          <p className={cn("text-xs", s.tone === "stopped" ? "text-red-500" : "text-muted-foreground")}>
            {p.receivedOn
              ? `${host ? "Received" : "Paid"} ${formatShort(p.receivedOn)}`
              : `Due ${formatShort(p.dueOn)}${late}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium tabular-nums">{formatMoney(p.amountCents)}</p>
          <Pill tone={s.tone} label={host ? s.host : s.joey} />
        </div>
      </div>

      {!p.receivedOn && (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>
            {host
              ? `${p.otherName} pays you directly${p.paymentMethod ? `: ${p.paymentMethod}` : ""}.`
              : `Pay ${p.otherName} directly${p.paymentMethod ? `: ${p.paymentMethod}` : ""}.`}
            {lateNote && ` ${lateNote}`}
          </p>
          {host && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`received-${p.key}`}>Date received</Label>
                <Input
                  id={`received-${p.key}`}
                  type="date"
                  max={today}
                  value={receivedOn}
                  onChange={(e) => setReceivedOn(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" disabled={pending || !receivedOn} onClick={() => setReceived(receivedOn)}>
                {pending ? "Saving…" : "Mark received"}
              </Button>
            </div>
          )}
        </div>
      )}
      {p.receivedOn && host && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          disabled={pending}
          onClick={() => setReceived(null)}
        >
          {pending ? "Undoing…" : "Mark as not received"}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </li>
  );
}
