"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { formatHours, formatWorkDate, personName, type Timecard } from "@/lib/timecards";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimecardRowCells, timecardRowClass } from "@/components/timecard-row";
import { EmptyState, PageHeader, SectionHeader, textareaClass } from "@/components/page-parts";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewQueue({
  pending,
  reviewed,
}: {
  pending: Timecard[];
  reviewed: Timecard[];
}) {
  const totalHours = pending.reduce((sum, tc) => sum + Number(tc.hours), 0);

  if (pending.length === 0 && reviewed.length === 0) {
    return (
      <>
        <PageHeader title="Review" />
        <EmptyState title="Nothing to review">
          Timecards your Joeys submit will show up here for approval.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Review"
        actions={
          pending.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatHours(totalHours)} across {pending.length}{" "}
              {pending.length === 1 ? "timecard" : "timecards"}
            </span>
          )
        }
      />

      <SectionHeader>Waiting for review</SectionHeader>
      {pending.length === 0 ? (
        <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">
          You&apos;re all caught up.
        </p>
      ) : (
        <ul className="divide-y border-b">
          {pending.map((tc) => (
            <ReviewRow key={tc.id} timecard={tc} />
          ))}
        </ul>
      )}

      {reviewed.length > 0 && (
        <>
          <SectionHeader>Recently reviewed</SectionHeader>
          <ul className="divide-y border-b">
            {reviewed.map((tc) => (
              <li key={tc.id} className={timecardRowClass}>
                <TimecardRowCells
                  workDate={tc.work_date}
                  name={personName(tc.joey)}
                  detail={tc.review_note ?? tc.notes}
                  hours={tc.hours}
                  status={tc.status}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ReviewRow({ timecard }: { timecard: Timecard }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const noteId = `reject-note-${timecard.id}`;

  const decide = async (decision: "approved" | "rejected") => {
    setPending(decision);
    setError(null);
    const { error } = await createClient().rpc("review_timecard", {
      p_id: timecard.id,
      p_decision: decision,
      p_note: decision === "rejected" ? note.trim() || null : null,
    });
    if (error) {
      setError(friendlyError(error));
      setPending(null);
      return;
    }
    router.refresh();
  };

  return (
    <li className="px-4 py-3 text-sm sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate">
            <span className="font-medium">{personName(timecard.joey)}</span>
            <span className="ml-2 text-muted-foreground">{formatWorkDate(timecard.work_date)}</span>
          </p>
          {timecard.notes && (
            <p className="mt-0.5 line-clamp-2 text-muted-foreground">{timecard.notes}</p>
          )}
        </div>
        <span className="tabular-nums">{formatHours(timecard.hours)}</span>
        {!rejecting && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejecting(true)}
              disabled={pending !== null}
            >
              Reject
            </Button>
            <Button size="sm" onClick={() => decide("approved")} disabled={pending !== null}>
              {pending === "approved" ? "Approving…" : "Approve"}
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-3 grid gap-2">
          <Label htmlFor={noteId}>Reason (the Joey will see this)</Label>
          <textarea
            id={noteId}
            className={textareaClass}
            placeholder="e.g. Hours don't match the schedule for this day"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setNote("");
              }}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => decide("rejected")}
              disabled={pending !== null}
            >
              {pending === "rejected" ? "Rejecting…" : "Reject timecard"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-red-500">{error}</p>}
    </li>
  );
}
