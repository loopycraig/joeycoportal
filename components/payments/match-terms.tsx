"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCents, formatDate, todayIn } from "@/lib/money";
import type { MatchWithTerms, Terms } from "@/lib/payments/queries";
import { NewAgreementButton } from "@/components/agreements/new-agreement";

const TZ = "America/Denver";

export function MatchTermsList({
  matches,
  userId,
  role,
}: {
  matches: MatchWithTerms[];
  userId: string;
  role: "host" | "joey";
}) {
  return (
    <ul className="divide-y">
      {matches.map((m) => (
        <MatchTermsRow key={m.id} match={m} userId={userId} role={role} />
      ))}
    </ul>
  );
}

function summarize(t: Terms) {
  return `${formatCents(t.hourly_rate_cents)}/hr and ${formatCents(t.monthly_rent_cents)}/mo rent`;
}

// Rate and rent changes are signed amendments now (Agreements). Proposals made before that can
// still be answered or withdrawn here.
function MatchTermsRow({ match, userId, role }: { match: MatchWithTerms; userId: string; role: "host" | "joey" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
            <p className="text-amber-500">
              No agreed rate or rent yet. They come from the signed offer letter and housing license.
            </p>
          )}
          {upcoming.map((t) => (
            <p key={t.id} className="text-muted-foreground">
              Changes to {summarize(t)} on {formatDate(t.effective_date)}
            </p>
          ))}
        </div>
        {role === "host" && current && (
          <div className="flex gap-2">
            <NewAgreementButton
              matches={[{ id: match.id, name }]}
              initialMatch={match.id}
              initialKind="pay_amendment"
              label="Change hourly rate"
              variant="outline"
            />
            <NewAgreementButton
              matches={[{ id: match.id, name }]}
              initialMatch={match.id}
              initialKind="rent_amendment"
              label="Change rent"
              variant="outline"
            />
          </div>
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
