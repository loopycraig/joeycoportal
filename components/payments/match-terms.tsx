"use client";

// The agreed terms behind a payment, shown at the foot of an open wage or rent row: the hourly rate
// for wages, the rent for rent. What it is now, any change coming up, what it was before and, for
// the Host, changing it (a signed amendment, in Agreements).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCents, formatDate, todayIn } from "@/lib/money";
import type { MatchWithTerms, Terms } from "@/lib/payments/queries";
import { NewAgreementButton } from "@/components/agreements/new-agreement";

const TZ = "America/Denver";

type Field = "rate" | "rent";

const FIELDS = {
  rate: {
    title: "Agreed hourly rate",
    value: (t: Terms) => t.hourly_rate_cents,
    format: (c: number) => `${formatCents(c)}/hr`,
    missing: "No agreed hourly rate yet. It comes from the signed offer letter.",
    kind: "pay_amendment",
    change: "Change hourly rate",
  },
  rent: {
    title: "Agreed rent",
    value: (t: Terms) => t.monthly_rent_cents,
    format: (c: number) => `${formatCents(c)}/mo`,
    missing: "No agreed rent yet. It comes from the signed housing license.",
    kind: "rent_amendment",
    change: "Change rent",
  },
} as const;

function summarize(t: Terms) {
  const rate = t.hourly_rate_cents === null ? "no hourly rate yet" : `${formatCents(t.hourly_rate_cents)}/hr`;
  const rent = t.monthly_rent_cents === null ? "no rent yet" : `${formatCents(t.monthly_rent_cents)}/mo rent`;
  return `${rate} and ${rent}`;
}

/** Each value this field has had, from when, oldest first. Versions that only changed the other field are skipped. */
function history(terms: Terms[], field: Field) {
  const value = FIELDS[field].value;
  const out: { cents: number; from: string }[] = [];
  for (const t of terms.filter((t) => t.status === "accepted").sort((a, b) => a.effective_date.localeCompare(b.effective_date))) {
    const cents = value(t);
    if (cents === null || out.at(-1)?.cents === cents) continue;
    out.push({ cents, from: t.effective_date });
  }
  return out;
}

export function TermsFooter({
  match,
  field,
  userId,
  role,
}: {
  match: MatchWithTerms;
  field: Field;
  userId: string;
  role: "host" | "joey";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const f = FIELDS[field];

  const today = todayIn(TZ);
  const all = history(match.terms, field);
  const currentIndex = all.findLastIndex((h) => h.from <= today);
  const current = currentIndex >= 0 ? all[currentIndex] : null;
  const upcoming = all.slice(currentIndex + 1);
  const earlier = currentIndex > 0 ? all.slice(0, currentIndex).reverse() : [];
  // Proposals from before amendments; only the ones that change this field.
  const proposal = match.terms.find((t) => t.status === "proposed" && f.value(t) !== null && f.value(t) !== current?.cents) ?? null;

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
      router.refresh();
    });
  };

  const supabase = createClient();
  const respond = (accept: boolean) =>
    run(() => supabase.rpc("respond_to_terms", { p_terms_id: proposal!.id, p_accept: accept }));
  const withdraw = () => run(() => supabase.rpc("withdraw_terms", { p_terms_id: proposal!.id }));

  return (
    <section className="mt-4 border-t pt-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{f.title}</p>
          {current ? (
            <p>
              {f.format(current.cents)}
              <span className="text-muted-foreground"> since {formatDate(current.from)}</span>
            </p>
          ) : (
            <p className="text-amber-500">{f.missing}</p>
          )}
          {upcoming.map((h) => (
            <p key={h.from} className="text-muted-foreground">
              Changes to {f.format(h.cents)} on {formatDate(h.from)}
            </p>
          ))}
        </div>
        {role === "host" && current && (
          <NewAgreementButton
            matches={[{ id: match.id, name }]}
            initialMatch={match.id}
            initialKind={f.kind}
            label={f.change}
            variant="outline"
          />
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

      {error && <p className="mt-2 text-red-500">{error}</p>}

      {earlier.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Earlier</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {earlier.map((h) => (
              <li key={h.from}>
                {f.format(h.cents)} from {formatDate(h.from)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
