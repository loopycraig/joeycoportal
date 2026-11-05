"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  formatHours,
  formatWorkDate,
  personName,
  todayISO,
  type Timecard,
} from "@/lib/timecards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/modal";
import { StatusPill } from "@/components/status-pill";
import { TimecardRowCells, timecardRowClass } from "@/components/timecard-row";
import { EmptyState, PageHeader, selectClass, textareaClass } from "@/components/page-parts";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export type OpenMatch = { id: string; host_id: string; hostName: string };

export function JoeyTimecards({
  joeyId,
  timecards,
  openMatches,
}: {
  joeyId: string;
  timecards: Timecard[];
  openMatches: OpenMatch[];
}) {
  const [editing, setEditing] = useState<Timecard | "new" | null>(null);
  const canCreate = openMatches.length > 0;

  const newButton = canCreate ? (
    <Button size="sm" onClick={() => setEditing("new")}>
      <Plus />
      New timecard
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title="Timecards" actions={timecards.length > 0 ? newButton : null} />

      {timecards.length === 0 ? (
        <EmptyState title="No timecards yet" action={newButton}>
          {canCreate
            ? "Log the hours you've worked and submit them to your Host."
            : "Once a Host adds you, you'll log your hours here."}
        </EmptyState>
      ) : (
        <ul className="divide-y border-b">
          {timecards.map((tc) => (
            <li key={tc.id}>
              <button
                type="button"
                onClick={() => setEditing(tc)}
                className={`${timecardRowClass} transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none`}
              >
                <TimecardRowCells
                  workDate={tc.work_date}
                  name={personName(tc.host)}
                  detail={tc.notes}
                  hours={tc.hours}
                  status={tc.status}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New timecard" : "Timecard"}
      >
        {editing && (
          <TimecardForm
            joeyId={joeyId}
            timecard={editing === "new" ? null : editing}
            openMatches={openMatches}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function TimecardForm({
  joeyId,
  timecard,
  openMatches,
  onDone,
}: {
  joeyId: string;
  timecard: Timecard | null;
  openMatches: OpenMatch[];
  onDone: () => void;
}) {
  const status = timecard?.status ?? "draft";
  const [matchId, setMatchId] = useState(timecard?.match_id ?? openMatches[0]?.id ?? "");
  const [workDate, setWorkDate] = useState(timecard?.work_date ?? todayISO());
  const [hours, setHours] = useState(timecard ? String(timecard.hours) : "");
  const [notes, setNotes] = useState(timecard?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const intent = useRef<"draft" | "submitted">("submitted");
  const router = useRouter();

  if (status === "approved" && timecard) {
    return <ApprovedDetails timecard={timecard} onDone={onDone} />;
  }

  const finish = () => {
    router.refresh();
    onDone();
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nextStatus = intent.current;
    setPending(nextStatus);
    setError(null);

    const supabase = createClient();
    const fields = {
      work_date: workDate,
      hours: Number(hours),
      notes: notes.trim() || null,
      status: nextStatus,
    };

    let result;
    if (!timecard) {
      const match = openMatches.find((m) => m.id === matchId);
      if (!match) {
        setError("Choose a Host.");
        setPending(null);
        return;
      }
      result = await supabase.from("timecards").insert({
        ...fields,
        match_id: match.id,
        host_id: match.host_id,
        joey_id: joeyId,
      });
    } else {
      result = await supabase.from("timecards").update(fields).eq("id", timecard.id);
    }

    if (result.error) {
      setError(friendlyError(result.error));
      setPending(null);
      return;
    }
    finish();
  };

  const handleDelete = async () => {
    if (!timecard) return;
    setPending("delete");
    setError(null);
    const { error } = await createClient().from("timecards").delete().eq("id", timecard.id);
    if (error) {
      setError(friendlyError(error));
      setPending(null);
      return;
    }
    finish();
  };

  // Button labels depend on where the timecard is in its life
  const secondary =
    status === "submitted" ? "Move to draft" : "Save draft";
  const primary =
    status === "submitted" ? "Save changes" : status === "rejected" ? "Resubmit" : "Submit";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {status === "rejected" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          <p className="font-medium">Your Host rejected this timecard</p>
          {timecard?.review_note && (
            <p className="mt-0.5 text-muted-foreground">{timecard.review_note}</p>
          )}
        </div>
      )}
      {status === "submitted" && (
        <p className="text-sm text-muted-foreground">
          Waiting for your Host to review. You can still make changes.
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="tc-host">Host</Label>
        {timecard ? (
          <p id="tc-host" className="text-sm">{personName(timecard.host)}</p>
        ) : (
          <select
            id="tc-host"
            className={selectClass}
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            required
          >
            {openMatches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.hostName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="tc-date">Date</Label>
          <Input
            id="tc-date"
            type="date"
            required
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tc-hours">Hours</Label>
          <Input
            id="tc-hours"
            type="number"
            inputMode="decimal"
            min={0.25}
            max={24}
            step={0.25}
            required
            placeholder="8"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tc-notes">Notes</Label>
        <textarea
          id="tc-notes"
          className={textareaClass}
          placeholder="What did you work on?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        {timecard && status === "draft" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-500"
            onClick={handleDelete}
            disabled={pending !== null}
          >
            {pending === "delete" ? "Deleting…" : "Delete"}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            onClick={() => (intent.current = "draft")}
            disabled={pending !== null}
          >
            {pending === "draft" ? "Saving…" : secondary}
          </Button>
          <Button
            type="submit"
            size="sm"
            onClick={() => (intent.current = "submitted")}
            disabled={pending !== null}
          >
            {pending === "submitted" ? "Saving…" : primary}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ApprovedDetails({ timecard, onDone }: { timecard: Timecard; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <StatusPill status="approved" />
      <dl className="grid grid-cols-[5rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">Host</dt>
        <dd>{personName(timecard.host)}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatWorkDate(timecard.work_date)}</dd>
        <dt className="text-muted-foreground">Hours</dt>
        <dd className="tabular-nums">{formatHours(timecard.hours)}</dd>
        {timecard.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{timecard.notes}</dd>
          </>
        )}
        {timecard.review_note && (
          <>
            <dt className="text-muted-foreground">Host note</dt>
            <dd className="whitespace-pre-wrap">{timecard.review_note}</dd>
          </>
        )}
      </dl>
      <p className="text-muted-foreground">Approved timecards can&apos;t be changed.</p>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
