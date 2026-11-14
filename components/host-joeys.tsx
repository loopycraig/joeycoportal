"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, SectionHeader, textareaClass } from "@/components/page-parts";
import { JoeyTerms, type JoeyTermsInfo } from "@/components/joey-terms";
import { cancelMatchEnd, endMatchWithNotice } from "@/lib/agreements/actions";
import { addDays, formatHours, formatShort } from "@/lib/timesheets";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type JoeyMatch = {
  id: string;
  name: string;
  email: string;
  started: string; // pre-formatted on the server
  ended: string | null;
  terms: JoeyTermsInfo;
  today: string;
  ptoBalance: number;
  /** Set once the Host has ended employment and given notice. */
  ending: { lastDay: string; moveOut: string; canUndo: boolean } | null;
};

export function HostJoeys({ active, ended }: { active: JoeyMatch[]; ended: JoeyMatch[] }) {
  const [adding, setAdding] = useState(false);
  const isEmpty = active.length === 0 && ended.length === 0;

  return (
    <>
      <PageHeader
        title="My Joeys"
        actions={
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              Add Joey
            </Button>
          )
        }
      />

      {adding && <AddJoeyForm onDone={() => setAdding(false)} />}

      {isEmpty && !adding && (
        <EmptyState title="No Joeys yet">
          Add a Joey by email. They need to sign up and choose Joey first.
        </EmptyState>
      )}

      {active.length > 0 && (
        <>
          <SectionHeader>Active</SectionHeader>
          <ul className="divide-y border-b">
            {active.map((m) => (
              <JoeyRow key={m.id} match={m} />
            ))}
          </ul>
        </>
      )}

      {ended.length > 0 && (
        <>
          <SectionHeader>Ended</SectionHeader>
          <ul className="divide-y border-b">
            {ended.map((m) => (
              <JoeyRow key={m.id} match={m} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function AddJoeyForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await createClient().rpc("add_joey", { p_email: email.trim() });
    if (error) {
      setError(friendlyError(error));
      setIsLoading(false);
      return;
    }
    router.refresh();
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 border-b bg-card px-4 py-4 sm:px-6">
      <Label htmlFor="joey-email">Joey&apos;s email</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="joey-email"
          type="email"
          required
          autoFocus
          placeholder="joey@example.com"
          className="w-full sm:max-w-xs"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-9" disabled={isLoading}>
          {isLoading ? "Adding…" : "Add Joey"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use the email they signed up with. They&apos;ll be able to submit their hours to you right away.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}

function JoeyRow({ match }: { match: JoeyMatch }) {
  const [ending, setEnding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const end = match.ending;

  const undo = async () => {
    setIsLoading(true);
    setError(null);
    const res = await cancelMatchEnd(match.id);
    setIsLoading(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  return (
    <li className="px-4 py-3 text-sm sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className={
            match.ended
              ? "size-2 rounded-full bg-muted-foreground/40"
              : end
                ? "size-2 rounded-full bg-amber-400"
                : "size-2 rounded-full bg-emerald-500"
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate">{match.name}</p>
          <p className="truncate text-xs text-muted-foreground">{match.email}</p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {match.ended ? `${match.started} – ${match.ended}` : `Since ${match.started}`}
        </p>
        {!match.ended && !end && !ending && (
          <Button size="sm" variant="ghost" onClick={() => setEnding(true)}>
            End match
          </Button>
        )}
      </div>
      {!match.ended && end && (
        <p className="mt-2 pl-6 text-xs text-muted-foreground">
          Last day of work {formatShort(end.lastDay)} · moves out by {formatShort(end.moveOut)}. The notice is in their
          Agreements.
          {end.canUndo && (
            <button
              type="button"
              className="ml-2 underline underline-offset-2 hover:text-foreground"
              disabled={isLoading}
              onClick={undo}
            >
              {isLoading ? "Undoing…" : "Undo"}
            </button>
          )}
        </p>
      )}
      {!match.ended && !end && !ending && <JoeyTerms matchId={match.id} joeyName={match.name} terms={match.terms} />}
      {ending && <EndMatchForm match={match} onCancel={() => setEnding(false)} />}
      {error && <p className="mt-2 text-red-500">{error}</p>}
    </li>
  );
}

/** Ending employment and giving the written notice to move out the contracts require. */
function EndMatchForm({ match, onCancel }: { match: JoeyMatch; onCancel: () => void }) {
  const [lastDay, setLastDay] = useState(match.today);
  // Offer Letter §4: 7 days' notice after employment ends, counted from today at the earliest.
  const earliestFor = (last: string) => addDays(last > match.today ? last : match.today, 7);
  const [moveOut, setMoveOut] = useState(earliestFor(match.today));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const minMoveOut = earliestFor(lastDay);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await endMatchWithNotice(match.id, lastDay, moveOut, message);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onCancel();
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="mt-3 ml-6 grid max-w-lg gap-4 rounded-md border bg-card p-4">
      <p className="text-sm font-medium">End {match.name}&apos;s employment and housing</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`last-${match.id}`}>Last day of work</Label>
          <Input
            id={`last-${match.id}`}
            type="date"
            required
            min={addDays(match.today, -7)}
            value={lastDay}
            onChange={(e) => {
              setLastDay(e.target.value);
              if (e.target.value && moveOut < earliestFor(e.target.value)) setMoveOut(earliestFor(e.target.value));
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`out-${match.id}`}>Move out by</Label>
          <Input
            id={`out-${match.id}`}
            type="date"
            required
            min={minMoveOut}
            value={moveOut}
            onChange={(e) => setMoveOut(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`msg-${match.id}`}>Message to {match.name} (optional)</Label>
        <textarea
          id={`msg-${match.id}`}
          className={textareaClass}
          placeholder="Anything about the move-out, keys or final week"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          {match.name} gets a written notice in their Agreements. The contracts require at least 7 days&apos; notice to
          move out after employment ends, so the earliest is {formatShort(minMoveOut)}. Rent continues until then.
        </li>
        <li>
          Final pay is due when employment ends: all hours through the last day
          {match.ptoBalance > 0 ? `, plus ${formatHours(match.ptoBalance)} of unused PTO` : ""}. Run it in Poppins.
        </li>
        <li>No hours can be logged after the last day. You can undo this until then.</li>
      </ul>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={busy}>
          {busy ? "Sending…" : "End employment and send notice"}
        </Button>
      </div>
    </form>
  );
}
