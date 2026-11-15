"use client";

// A month's rent in the payments list: the Joey pays the Host directly, and the Host marks each month
// received (or undoes it).

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { monthName, type RentPayment } from "@/lib/payments/rent-status";
import { formatMoney, formatShort } from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** How a month's rent is paid and, for the Host, marking it received (or undoing that). */
export function RentDetail({ payment: p, role, today }: { payment: RentPayment; role: "host" | "joey"; today: string }) {
  const host = role === "host";
  const [receivedOn, setReceivedOn] = useState(p.dueOn < today ? p.dueOn : today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  const lateNote =
    !p.receivedOn && p.status !== "late" && p.lateFrom && p.lateFeeCents
      ? `A 5% late fee (${formatMoney(p.lateFeeCents)}) applies from ${formatShort(p.lateFrom)}.`
      : null;

  return (
    <div className="text-sm">
      {!p.receivedOn && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {host
              ? `${p.otherName} pays you directly${p.paymentMethod ? `: ${p.paymentMethod}` : ""}.`
              : `Pay ${p.otherName} directly${p.paymentMethod ? `: ${p.paymentMethod}` : ""}.`}
            {lateNote && ` ${lateNote}`}
            {p.status === "late" && p.lateFeeCents && ` It's late: a ${formatMoney(p.lateFeeCents)} late fee applies.`}
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
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          disabled={pending}
          onClick={() => setReceived(null)}
        >
          {pending ? "Undoing…" : "Mark as not received"}
        </button>
      )}
      {p.receivedOn && !host && <p className="text-xs text-muted-foreground">Paid {formatShort(p.receivedOn)}.</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
