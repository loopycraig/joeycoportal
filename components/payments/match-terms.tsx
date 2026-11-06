"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCents, formatDate, parseDollarsToCents, todayIn } from "@/lib/money";
import type { MatchWithTerms, Terms } from "@/lib/payments/queries";

const TZ = "America/Denver";

export function MatchTermsList({ matches, userId }: { matches: MatchWithTerms[]; userId: string }) {
  return (
    <ul className="divide-y">
      {matches.map((m) => (
        <MatchTermsRow key={m.id} match={m} userId={userId} />
      ))}
    </ul>
  );
}

function summarize(t: Terms) {
  return `${formatCents(t.hourly_rate_cents)}/hr and ${formatCents(t.monthly_rent_cents)}/mo rent`;
}

function MatchTermsRow({ match, userId }: { match: MatchWithTerms; userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const today = todayIn(TZ);
  const accepted = match.terms
    .filter((t) => t.status === "accepted")
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const current = accepted.find((t) => t.effective_date <= today) ?? null;
  const upcoming = accepted.filter((t) => t.effective_date > today).reverse();
  const proposal = match.terms.find((t) => t.status === "proposed") ?? null;
  const past = accepted.filter((t) => t !== current && !upcoming.includes(t));

  const name = match.other?.full_name || match.other?.email || "Unknown";
  const otherFirst = (match.other?.full_name || "They").split(" ")[0];

  const run = (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    startTransition(async () => {
      const { error } = await fn();
      if (error) {
        setError(error.message);
        return;
      }
      setFormOpen(false);
      router.refresh();
    });
  };

  const supabase = createClient();
  const respond = (accept: boolean) =>
    run(() => supabase.rpc("respond_to_terms", { p_terms_id: proposal!.id, p_accept: accept }));
  const withdraw = () => run(() => supabase.rpc("withdraw_terms", { p_terms_id: proposal!.id }));

  return (
    <li className="px-6 py-4 text-sm">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {current ? (
            <p className="text-muted-foreground">
              {summarize(current)}, since {formatDate(current.effective_date)}
            </p>
          ) : (
            <p className="text-amber-500">No agreed rate or rent yet. Hours can&apos;t be paid until you agree on terms.</p>
          )}
          {upcoming.map((t) => (
            <p key={t.id} className="text-muted-foreground">
              Changes to {summarize(t)} on {formatDate(t.effective_date)}
            </p>
          ))}
        </div>
        {!formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)} disabled={pending}>
            {proposal ? "Propose different terms" : current ? "Propose a change" : "Propose terms"}
          </Button>
        )}
      </div>

      {proposal && (
        <div className="mt-3 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
          <p>
            {proposal.proposed_by === userId ? "You proposed " : `${otherFirst} proposed `}
            <span className="font-medium">{summarize(proposal)}</span> starting {formatDate(proposal.effective_date)}.
          </p>
          {proposal.note && <p className="mt-1 text-muted-foreground">&ldquo;{proposal.note}&rdquo;</p>}
          <div className="mt-2 flex gap-2">
            {proposal.proposed_by === userId ? (
              <>
                <span className="self-center text-xs text-muted-foreground">Waiting for {otherFirst} to respond</span>
                <Button variant="ghost" size="sm" onClick={withdraw} disabled={pending}>
                  Withdraw
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => respond(true)} disabled={pending}>
                  Accept terms
                </Button>
                <Button variant="ghost" size="sm" onClick={() => respond(false)} disabled={pending}>
                  Decline
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <ProposeForm
          defaults={current ?? upcoming.at(-1) ?? null}
          minDate={today}
          pending={pending}
          onCancel={() => {
            setFormOpen(false);
            setError(null);
          }}
          onSubmit={(v) =>
            run(() =>
              supabase.rpc("propose_terms", {
                p_match_id: match.id,
                p_effective_date: v.effectiveDate,
                p_hourly_rate_cents: v.hourly,
                p_monthly_rent_cents: v.rent,
                p_note: v.note,
              }),
            )
          }
          onInvalid={setError}
          replacing={!!proposal}
        />
      )}

      {error && <p className="mt-2 text-red-500">{error}</p>}

      {past.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Earlier terms</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {past.map((t) => (
              <li key={t.id}>
                {summarize(t)} from {formatDate(t.effective_date)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function ProposeForm({
  defaults,
  minDate,
  pending,
  replacing,
  onSubmit,
  onCancel,
  onInvalid,
}: {
  defaults: Terms | null;
  minDate: string;
  pending: boolean;
  replacing: boolean;
  onSubmit: (v: { effectiveDate: string; hourly: number; rent: number; note: string }) => void;
  onCancel: () => void;
  onInvalid: (msg: string) => void;
}) {
  const [effectiveDate, setEffectiveDate] = useState(minDate);
  const [hourly, setHourly] = useState(defaults ? (defaults.hourly_rate_cents / 100).toFixed(2) : "");
  const [rent, setRent] = useState(defaults ? (defaults.monthly_rent_cents / 100).toFixed(2) : "");
  const [note, setNote] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseDollarsToCents(hourly);
    const r = parseDollarsToCents(rent);
    if (h === null) return onInvalid("Enter the hourly rate as a dollar amount, like 25 or 25.50.");
    if (r === null) return onInvalid("Enter the monthly rent as a dollar amount, like 900.");
    if (!effectiveDate) return onInvalid("Choose the date these terms start.");
    onSubmit({ effectiveDate, hourly: h, rent: r, note });
  };

  const field = "h-8 text-sm";

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-md border px-3 py-3 sm:grid-cols-3">
      <div className="grid gap-1">
        <Label htmlFor="hourly" className="text-xs text-muted-foreground">Hourly rate</Label>
        <Input id="hourly" inputMode="decimal" placeholder="25.00" value={hourly} onChange={(e) => setHourly(e.target.value)} className={field} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rent" className="text-xs text-muted-foreground">Monthly rent</Label>
        <Input id="rent" inputMode="decimal" placeholder="900.00" value={rent} onChange={(e) => setRent(e.target.value)} className={field} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="effective" className="text-xs text-muted-foreground">Starts on</Label>
        <Input id="effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={field} />
      </div>
      <div className="grid gap-1 sm:col-span-3">
        <Label htmlFor="note" className="text-xs text-muted-foreground">Note (optional)</Label>
        <Input id="note" placeholder="What changed and why" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      </div>
      <div className={cn("flex items-center gap-2 sm:col-span-3")}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send proposal"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {replacing ? "This replaces the open proposal. " : ""}Takes effect once the other person accepts.
        </span>
      </div>
    </form>
  );
}
