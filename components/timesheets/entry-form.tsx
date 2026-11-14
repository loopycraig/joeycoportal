"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  KIND_LABELS,
  TAGS,
  formatDay,
  formatHours,
  hoursBetween,
  type EntryKind,
  type ScheduledDay,
  type TimeEntry,
} from "@/lib/timesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import { selectClass, textareaClass } from "@/components/page-parts";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

const KINDS: EntryKind[] = ["work", "pto", "sick", "holiday"];
const MEAL_OPTIONS = [0, 15, 30, 45, 60, 90];

export function EntryForm({
  entry,
  date,
  today,
  match,
  joeyId,
  scheduled,
  ptoBalance,
  onDone,
}: {
  entry: TimeEntry | null;
  date: string;
  today: string;
  match: { id: string; hostId: string };
  joeyId: string;
  scheduled: ScheduledDay | null;
  /** Hours left after everything already approved or pending, not counting this entry. */
  ptoBalance: number;
  onDone: () => void;
}) {
  const status = entry?.status ?? "draft";
  const editable = status === "draft" || status === "changes_requested";
  const future = date > today;

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? (future ? "pto" : "work"));
  const [workDate, setWorkDate] = useState(entry?.work_date ?? date);
  const [useTimes, setUseTimes] = useState(entry ? entry.start_time !== null : true);
  const [start, setStart] = useState(entry?.start_time?.slice(0, 5) ?? scheduled?.start ?? "09:00");
  const [end, setEnd] = useState(entry?.end_time?.slice(0, 5) ?? scheduled?.end ?? "13:00");
  const [meal, setMeal] = useState(entry?.meal_break_minutes ?? scheduled?.mealMinutes ?? 0);
  const [hours, setHours] = useState(
    entry ? String(Number(entry.hours)) : scheduled?.hours ? String(scheduled.hours) : "",
  );
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const router = useRouter();

  const timed = kind === "work" && useTimes;
  const computed = timed && start && end ? hoursBetween(start, end, meal) : Number(hours) || 0;
  const drawsPto = kind === "pto" || kind === "sick";

  const run = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setPending(label);
    setError(null);
    const { error } = await fn();
    if (error) {
      setError(friendlyError(error));
      setPending(null);
      return false;
    }
    router.refresh();
    onDone();
    return true;
  };

  const fields = () => ({
    work_date: workDate,
    kind,
    start_time: timed ? start : null,
    end_time: timed ? end : null,
    meal_break_minutes: timed ? meal : 0,
    hours: computed,
    tags: kind === "work" ? tags : [],
    notes: notes.trim() || null,
  });

  const save = async (andSubmit: boolean) => {
    if (computed <= 0 || computed > 24) {
      setError(timed ? "Check the start and end times." : "Enter hours between 0.25 and 24.");
      return;
    }
    const supabase = createClient();
    setPending(andSubmit ? "submit" : "save");
    setError(null);
    let id = entry?.id;
    if (entry) {
      const { error } = await supabase.from("time_entries").update(fields()).eq("id", entry.id);
      if (error) return fail(error);
    } else {
      const { data, error } = await supabase
        .from("time_entries")
        .insert({ ...fields(), match_id: match.id, host_id: match.hostId, joey_id: joeyId })
        .select("id")
        .single();
      if (error) return fail(error);
      id = data.id;
    }
    if (andSubmit) {
      const { error } = await supabase.rpc("submit_time_entries", { p_ids: [id] });
      if (error) return fail(error);
    }
    router.refresh();
    onDone();
  };

  const fail = (err: unknown) => {
    setError(friendlyError(err));
    setPending(null);
    router.refresh();
  };

  const canSubmitNow = workDate <= today || kind === "pto" || kind === "holiday";

  if (!editable && entry) {
    return (
      <ReadOnly
        entry={entry}
        pending={pending}
        error={error}
        onWithdraw={() => run("withdraw", () => createClient().rpc("withdraw_time_entries", { p_ids: [entry.id] }))}
        onDone={onDone}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(canSubmitNow);
      }}
      className="flex flex-col gap-4"
    >
      {status === "changes_requested" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          <p className="font-medium">Your Host asked for a change</p>
          {entry?.review_note && <p className="mt-0.5 text-muted-foreground">{entry.review_note}</p>}
        </div>
      )}

      <div role="radiogroup" aria-label="Type" className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              kind === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="te-date">Date</Label>
        <Input id="te-date" type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
      </div>

      {kind === "work" && useTimes ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="te-start">Start</Label>
            <Input id="te-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-end">End</Label>
            <Input id="te-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-meal">Meal break</Label>
            <select id="te-meal" className={selectClass} value={meal} onChange={(e) => setMeal(Number(e.target.value))}>
              {MEAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "None" : `${m} min`}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="te-hours">Hours</Label>
          <Input
            id="te-hours"
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
      )}

      <div className="-mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {kind === "work" && useTimes && computed > 0 && <>{formatHours(computed)} worked</>}
          {drawsPto && (
            <>
              PTO after this: <span className="tabular-nums">{formatHours(ptoBalance - computed)}</span>
              {ptoBalance - computed < 0 && <span className="text-red-500"> · more than you have</span>}
            </>
          )}
        </span>
        {kind === "work" && (
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setUseTimes(!useTimes)}>
            {useTimes ? "Enter hours instead" : "Enter start and end times"}
          </button>
        )}
      </div>

      {kind === "work" && useTimes && computed > 5 && meal < 30 && (
        <p className="-mt-2 text-xs text-amber-600 dark:text-amber-400">
          Shifts over 5 hours include a 30-minute meal break. If you didn&apos;t get one, say so in the notes.
        </p>
      )}

      {kind === "work" && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">What you helped with (optional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="grid gap-2">
        <Label htmlFor="te-notes">Notes (optional)</Label>
        <textarea
          id="te-notes"
          className={textareaClass}
          placeholder={kind === "work" ? "Anything your Host should know" : "e.g. Family visit"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        {entry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-500"
            disabled={pending !== null}
            onClick={() => run("delete", () => createClient().from("time_entries").delete().eq("id", entry.id))}
          >
            {pending === "delete" ? "Deleting…" : "Delete"}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => save(false)}>
            {pending === "save" ? "Saving…" : "Save draft"}
          </Button>
          {canSubmitNow && (
            <Button type="submit" size="sm" disabled={pending !== null}>
              {pending === "submit"
                ? "Submitting…"
                : future
                  ? "Request time off"
                  : status === "changes_requested"
                    ? "Resubmit"
                    : "Submit"}
            </Button>
          )}
        </div>
      </div>
      {!canSubmitNow && (
        <p className="-mt-2 text-right text-xs text-muted-foreground">You can submit hours once the day is over.</p>
      )}
    </form>
  );
}

function ReadOnly({
  entry,
  pending,
  error,
  onWithdraw,
  onDone,
}: {
  entry: TimeEntry;
  pending: string | null;
  error: string | null;
  onWithdraw: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <StatusPill status={entry.status} />
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatDay(entry.work_date)}</dd>
        <dt className="text-muted-foreground">Type</dt>
        <dd>{KIND_LABELS[entry.kind]}</dd>
        {entry.start_time && (
          <>
            <dt className="text-muted-foreground">Time</dt>
            <dd>
              {entry.start_time.slice(0, 5)} – {entry.end_time?.slice(0, 5)}
              {entry.meal_break_minutes > 0 && `, ${entry.meal_break_minutes} min meal break`}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Hours</dt>
        <dd className="tabular-nums">{formatHours(entry.hours)}</dd>
        {entry.tags.length > 0 && (
          <>
            <dt className="text-muted-foreground">Helped with</dt>
            <dd>{entry.tags.join(", ")}</dd>
          </>
        )}
        {entry.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{entry.notes}</dd>
          </>
        )}
      </dl>
      <p className="text-muted-foreground">
        {entry.status === "submitted"
          ? "Waiting for your Host. Take it back to make changes."
          : "Approved days can't be changed. If something's wrong, add another entry for that day and explain in the notes."}
      </p>
      {error && <p className="text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        {entry.status === "submitted" && (
          <Button size="sm" variant="outline" disabled={pending !== null} onClick={onWithdraw}>
            {pending === "withdraw" ? "Taking back…" : "Take back"}
          </Button>
        )}
        <Button size="sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
