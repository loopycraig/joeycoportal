"use client";

import { changePaySchedule } from "@/lib/agreements/actions";
import { SCHEDULE_LABELS, formatShort, type PayScheduleKind } from "@/lib/timesheets";
import type { ScheduleInfo } from "@/lib/timesheets-server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/page-parts";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DESCRIPTIONS: Record<PayScheduleKind, string> = {
  semimonthly: "1st–15th paid by the 26th; 16th–end paid by the 10th (as in the offer letter)",
  weekly: "Monday–Sunday",
  biweekly: "Two weeks, Monday–Sunday",
  monthly: "Whole month",
};

/** A match's pay frequency, and changing it from the next pay period on. */
export function PayScheduleControl({
  matchId,
  joeyName,
  schedule,
}: {
  matchId: string;
  joeyName: string;
  schedule: ScheduleInfo;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PayScheduleKind>(schedule.next?.kind ?? schedule.current);
  const [offset, setOffset] = useState("5");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFrom, setSavedFrom] = useState<string | null>(null);
  const router = useRouter();

  const save = async () => {
    setPending(true);
    setError(null);
    const res = await changePaySchedule(matchId, kind, kind === "semimonthly" ? null : Number(offset));
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedFrom(res.from);
    setOpen(false);
    router.refresh();
  };

  return (
    <div>
      <p>
        Pay schedule {SCHEDULE_LABELS[schedule.current].toLowerCase()}
        {schedule.next && (
          <> · changes to {SCHEDULE_LABELS[schedule.next.kind].toLowerCase()} from {formatShort(schedule.next.from)}</>
        )}
        {!open && (
          <button type="button" className="ml-2 underline underline-offset-2 hover:text-foreground" onClick={() => setOpen(true)}>
            Change
          </button>
        )}
      </p>
      {savedFrom && !open && (
        <p className="mt-1">
          Saved. {joeyName} has a written notice in their Agreements to acknowledge. Change the schedule in Poppins
          too, starting {formatShort(savedFrom)}.
        </p>
      )}
      {open && (
        <div className="mt-2 grid max-w-md gap-3 rounded-md border bg-card p-3 text-sm text-foreground">
          <div className="grid gap-2">
            <Label htmlFor={`sched-${matchId}`}>Pay schedule</Label>
            <select
              id={`sched-${matchId}`}
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as PayScheduleKind)}
            >
              {(["semimonthly", "weekly", "biweekly", "monthly"] as const).map((k) => (
                <option key={k} value={k} disabled={k === "monthly"}>
                  {SCHEDULE_LABELS[k]}
                  {k === "monthly" ? " (not allowed for hourly household workers in California)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{DESCRIPTIONS[kind]}</p>
          </div>
          {kind !== "semimonthly" && (
            <div className="grid gap-2">
              <Label htmlFor={`offset-${matchId}`}>Payday, in days after the period ends</Label>
              <Input
                id={`offset-${matchId}`}
                type="number"
                min={0}
                max={7}
                className="w-24"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Starts with the first pay period that begins at least 7 days from now, so {joeyName} has notice. They
            get a written notice in their Agreements. Days already submitted keep the period they were paid in.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
