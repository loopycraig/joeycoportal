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

export function NewAgreementButton({ matches }: { matches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [kind, setKind] = useState<AgreementKind>("offer_letter");
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
      <Button size="sm" onClick={() => setOpen(true)} disabled={matches.length === 0} title={matches.length === 0 ? "Add a Joey first" : undefined}>
        <Plus />
        New agreement
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
              <label key={k} className="flex items-center gap-2.5">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-foreground" />
                {KIND_LABEL[k]}
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
