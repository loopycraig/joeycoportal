"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, textareaClass } from "@/components/page-parts";
import { PageTabs } from "@/components/page-tabs";
import { JoeyTerms, type JoeyTermsInfo } from "@/components/joey-terms";
import { cancelMatchEnd, endMatchWithNotice } from "@/lib/agreements/actions";
import { addDays, formatHours, formatShort } from "@/lib/timesheets";
import type { ClarifyJoey, ClarifyMatch } from "@/lib/clarify/matches";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type JoeyMatch = {
  id: string;
  name: string;
  email: string;
  /** JoeyCo set up their account from the Clarify match; they haven't signed up yet. */
  notSignedUp: boolean;
  started: string; // pre-formatted on the server
  ended: string | null;
  terms: JoeyTermsInfo;
  today: string;
  ptoBalance: number;
  /** Set once the Host has ended employment and given notice. */
  ending: { lastDay: string; moveOut: string; canUndo: boolean } | null;
};

type ClarifyLists = { pending: ClarifyMatch[]; active: ClarifyMatch[]; completed: ClarifyMatch[] };

/**
 * Proposed: Joeys the JoeyCo team has lined up while the Match is in Search (from Clarify).
 * Pending: a Joey is picked (Contracting in Clarify), or matched in the portal but the offer letter
 * and housing license aren't both signed yet. Active: Matched in Clarify, or working under signed
 * agreements. Completed: Completed in Clarify, or the portal match has ended.
 * A Joey with a portal match shows as that match; Clarify-only rows are simpler and link to the profile.
 * Opens on Pending when there are any (something is waiting on someone), then Proposed when there are
 * Joeys to look at, otherwise Active.
 */
export function HostJoeys({
  proposed,
  proposedNote,
  clarify,
  pending,
  active,
  completed,
}: {
  proposed: ClarifyJoey[];
  /** Shown instead of the list when Clarify couldn't be read. */
  proposedNote: string | null;
  clarify: ClarifyLists;
  pending: JoeyMatch[];
  active: JoeyMatch[];
  completed: JoeyMatch[];
}) {
  const [adding, setAdding] = useState(false);
  const pendingCount = pending.length + clarify.pending.length;
  const isEmpty =
    proposed.length === 0 &&
    !proposedNote &&
    [pending, active, completed, clarify.pending, clarify.active, clarify.completed].every((l) => l.length === 0);

  const list = (rows: JoeyMatch[], fromClarify: ClarifyMatch[], tab: keyof ClarifyLists, empty: string) =>
    rows.length === 0 && fromClarify.length === 0 ? (
      <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">{empty}</p>
    ) : (
      <ul className="divide-y border-b">
        {fromClarify.map((m) => (
          <ClarifyMatchRow key={m.dealId + m.joey.id} match={m} tab={tab} />
        ))}
        {rows.map((m) => (
          <JoeyRow key={m.id} match={m} />
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title="Matches"
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

      {isEmpty && !adding ? (
        <EmptyState title="No matches yet">
          Joeys the JoeyCo team has interviewed for you show up here. If you already have a Joey, add them by email.
        </EmptyState>
      ) : (
        <PageTabs
          defaultTab={pendingCount > 0 ? "pending" : proposed.length > 0 ? "proposed" : "active"}
          tabs={[
            {
              id: "proposed",
              label: "Proposed",
              count: proposed.length,
              content: <ProposedList joeys={proposed} note={proposedNote} />,
            },
            {
              id: "pending",
              label: "Pending",
              count: pendingCount,
              content: list(pending, clarify.pending, "pending", "No Joeys waiting on agreements."),
            },
            { id: "active", label: "Active", content: list(active, clarify.active, "active", "No active Joeys.") },
            {
              id: "completed",
              label: "Completed",
              content: list(completed, clarify.completed, "completed", "No completed matches."),
            },
          ]}
        />
      )}
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function JoeyAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ${className ?? "size-10 text-sm"}`}
    >
      {initials(name)}
    </span>
  );
}

const CLARIFY_STATUS: Record<keyof ClarifyLists, string> = {
  pending: "JoeyCo is preparing the agreements",
  active: "Matched",
  completed: "Completed",
};

/** A Joey picked for a Match in Clarify who isn't set up in the portal yet. */
function ClarifyMatchRow({ match, tab }: { match: ClarifyMatch; tab: keyof ClarifyLists }) {
  const j = match.joey;
  const status =
    match.date && tab !== "pending"
      ? `${CLARIFY_STATUS[tab]} ${tab === "active" ? "since" : "on"} ${formatShort(match.date)}`
      : CLARIFY_STATUS[tab];
  return (
    <li id={`joey-${j.id}`} className="scroll-mt-4 text-sm target:bg-accent/30">
      <Link
        href={`/host/joeys/profile/${j.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-accent/40 sm:px-6"
      >
        <JoeyAvatar name={j.name} className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate">{j.name}</p>
          {j.school && <p className="truncate text-xs text-muted-foreground">{j.school}</p>}
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">{status}</p>
      </Link>
    </li>
  );
}

function ProposedList({ joeys, note }: { joeys: ClarifyJoey[]; note: string | null }) {
  if (note || joeys.length === 0) {
    return (
      <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">
        {note ?? "No Joeys proposed yet. The JoeyCo team adds candidates here as they find them."}
      </p>
    );
  }
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
      {joeys.map((j) => (
        <li key={j.id}>
          <Link
            href={`/host/joeys/profile/${j.id}`}
            className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3">
              <JoeyAvatar name={j.name} />
              <div className="min-w-0">
                <p className="truncate font-medium">{j.name}</p>
                {j.school && <p className="truncate text-xs text-muted-foreground">{j.school}</p>}
              </div>
            </div>
            {j.bio ? (
              <p className="line-clamp-4 text-muted-foreground">{j.bio}</p>
            ) : (
              <p className="text-muted-foreground italic">No bio yet.</p>
            )}
            {j.cities.length > 0 && (
              <p className="mt-auto text-xs text-muted-foreground">Prefers {j.cities.join(", ")}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
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
    <li id={`joey-${match.id}`} className="scroll-mt-4 px-4 py-3 text-sm target:bg-accent/30 sm:px-6">
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
          <p className="truncate text-xs text-muted-foreground">
            {match.email}
            {match.notSignedUp && " · hasn't signed up yet, so they can't sign agreements"}
          </p>
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
