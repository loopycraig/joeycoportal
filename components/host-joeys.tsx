"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, SectionHeader } from "@/components/page-parts";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type JoeyMatch = {
  id: string;
  name: string;
  email: string;
  started: string; // pre-formatted on the server
  ended: string | null;
};

export function HostJoeys({ active, ended }: { active: JoeyMatch[]; ended: JoeyMatch[] }) {
  const [adding, setAdding] = useState(false);
  const isEmpty = active.length === 0 && ended.length === 0;

  return (
    <>
      <PageHeader
        title="Joeys"
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
        Use the email they signed up with. They&apos;ll be able to submit timecards to you right away.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}

function JoeyRow({ match }: { match: JoeyMatch }) {
  const [confirming, setConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const endMatch = async () => {
    setIsLoading(true);
    setError(null);
    const { error } = await createClient().rpc("end_match", { p_match_id: match.id });
    if (error) {
      setError(friendlyError(error));
      setIsLoading(false);
      return;
    }
    router.refresh();
  };

  return (
    <li className="px-4 py-3 text-sm sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className={match.ended ? "size-2 rounded-full bg-muted-foreground/40" : "size-2 rounded-full bg-emerald-500"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate">{match.name}</p>
          <p className="truncate text-xs text-muted-foreground">{match.email}</p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {match.ended ? `${match.started} – ${match.ended}` : `Since ${match.started}`}
        </p>
        {!match.ended &&
          (confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">End this match?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={endMatch} disabled={isLoading}>
                {isLoading ? "Ending…" : "End match"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              End match
            </Button>
          ))}
      </div>
      {error && <p className="mt-2 text-red-500">{error}</p>}
    </li>
  );
}
