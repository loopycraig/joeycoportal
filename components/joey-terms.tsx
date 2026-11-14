"use client";

// A Joey's key contract terms on My Joeys, each with Change. Rate and rent changes are signed
// amendments (an open one is reopened rather than duplicated); the pay schedule sends a notice.

import { createAgreement } from "@/lib/agreements/actions";
import { formatMoney, formatShort } from "@/lib/timesheets";
import type { ScheduleInfo } from "@/lib/timesheets-server";
import { PayScheduleControl } from "@/components/timesheets/pay-schedule-control";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TermValue = {
  current: number | null; // cents
  next: { cents: number; from: string } | null;
  /** An amendment that's started but not signed by both yet. */
  open: { id: string; cents: number | null; from: string | null; waitingOn: "you" | "joey" } | null;
};

export type JoeyTermsInfo = { rate: TermValue; rent: TermValue; schedule: ScheduleInfo };

export function JoeyTerms({ matchId, joeyName, terms }: { matchId: string; joeyName: string; terms: JoeyTermsInfo }) {
  return (
    <div className="mt-2 grid gap-1 pl-6 text-xs text-muted-foreground">
      <TermLine matchId={matchId} kind="pay_amendment" label="Hourly rate" suffix="/hr" value={terms.rate} />
      <TermLine matchId={matchId} kind="rent_amendment" label="Rent" suffix="/mo" value={terms.rent} />
      <PayScheduleControl matchId={matchId} joeyName={joeyName} schedule={terms.schedule} />
    </div>
  );
}

function TermLine({
  matchId,
  kind,
  label,
  suffix,
  value,
}: {
  matchId: string;
  kind: "pay_amendment" | "rent_amendment";
  label: string;
  suffix: string;
  value: TermValue;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setBusy(true);
    setError(null);
    const res = await createAgreement(kind, matchId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/host/agreements/${res.id}`);
  };

  const amount = (c: number | null) => (c === null ? "not set" : `${formatMoney(c)}${suffix}`);

  return (
    <div>
      <p>
        {label} {amount(value.current)}
        {value.next && (
          <>
            {" "}
            · {amount(value.next.cents)} from {formatShort(value.next.from)}
          </>
        )}
        {value.open ? (
          <Link
            href={`/host/agreements/${value.open.id}`}
            className="ml-2 underline underline-offset-2 hover:text-foreground"
          >
            {value.open.waitingOn === "you"
              ? `Finish change${value.open.cents !== null ? ` to ${amount(value.open.cents)}` : ""}`
              : `Change to ${amount(value.open.cents)} waiting for the Joey`}
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy || value.current === null}
            title={value.current === null ? "Set in the signed offer letter and housing license" : undefined}
            className="ml-2 underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60"
            onClick={change}
          >
            {busy ? "Starting…" : "Change"}
          </button>
        )}
      </p>
      {error && <p className="mt-1 text-red-500">{error}</p>}
    </div>
  );
}
