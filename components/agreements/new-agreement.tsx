"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { selectClass } from "@/components/page-parts";
import { createAgreement } from "@/lib/agreements/actions";
import { KIND_LABEL } from "@/lib/agreements/fields";
import { JOEY_AGREEMENT_KINDS } from "@/lib/agreements/templates";
import type { AgreementKind } from "@/lib/agreements/types";

const HINTS: Partial<Record<AgreementKind, string>> = {
  pay_amendment: "Change the hourly rate in a signed offer letter",
  rent_amendment: "Change the rent in a signed housing license",
};

export function NewAgreementButton({
  matches,
  initialKind = "offer_letter",
  initialMatch,
  label = "New agreement",
  variant,
}: {
  matches: { id: string; name: string }[];
  initialKind?: AgreementKind;
  initialMatch?: string;
  label?: string;
  variant?: "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState(initialMatch ?? matches[0]?.id ?? "");
  const [kind, setKind] = useState<AgreementKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await createAgreement(kind, matchId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/host/agreements/${res.id}`);
  };

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={matches.length === 0}
        title={matches.length === 0 ? "Add a Joey first" : undefined}
      >
        {!variant && <Plus />}
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New agreement">
        <div className="space-y-4 text-sm">
          <label className="block space-y-1.5">
            <span className="font-medium">Joey</span>
            <select className={selectClass} value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 font-medium">Agreement</legend>
            {JOEY_AGREEMENT_KINDS.map((k) => (
              <label key={k} className="flex items-start gap-2.5">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="mt-0.5 size-4 accent-foreground" />
                <span>
                  {KIND_LABEL[k]}
                  {HINTS[k] && <span className="block text-xs text-muted-foreground">{HINTS[k]}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-muted-foreground">We&apos;ll fill in what we already know. You can review everything before it&apos;s sent.</p>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={start} disabled={busy || !matchId}>
              {busy ? "Starting…" : "Start"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
