"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ESIGN_CONSENT } from "@/lib/agreements/templates";
import { giveEsignConsent } from "@/lib/agreements/actions";

/**
 * Typed-name signature, with the one-time consent to sign electronically. `onSign` does the
 * actual signing (Joey, Host countersignature or the Host Services Agreement).
 */
export function SignPanel({
  printedName,
  hasConsent,
  statement,
  addendum,
  signLabel = "Sign",
  onSign,
}: {
  printedName: string;
  hasConsent: boolean;
  /** What the signer agrees to by signing. */
  statement: string;
  /** Housing license: the AB 1482 addendum needs its own acknowledgment. */
  addendum?: boolean;
  signLabel?: string;
  onSign: (typedName: string, addendumAck: boolean) => Promise<string | null>;
}) {
  const id = useId();
  const [consent, setConsent] = useState(hasConsent);
  const [ack, setAck] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = consent && name.trim().length >= 2 && (!addendum || ack);

  const sign = async () => {
    setBusy(true);
    setError(null);
    if (!hasConsent) {
      const res = await giveEsignConsent();
      if (!res.ok) {
        setBusy(false);
        return setError(res.error);
      }
    }
    const err = await onSign(name.trim(), ack);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4 rounded-lg border p-4 text-sm">
      <h3 id={`${id}-h`} className="font-medium">
        Sign
      </h3>

      {!hasConsent && (
        <div className="space-y-2 rounded-md bg-muted/40 px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Signing electronically</p>
          {ESIGN_CONSENT.text.map((t) => (
            <p key={t} className="text-muted-foreground">
              {t}
            </p>
          ))}
          <label className="flex items-start gap-2.5 pt-1">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-foreground" />
            <span>I agree to sign electronically.</span>
          </label>
        </div>
      )}

      {addendum && (
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-foreground" />
          <span>I have received, reviewed and understand the AB 1482 Just Cause and Rent Limit Exemption Addendum.</span>
        </label>
      )}

      <p>{statement}</p>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-sig`} className="block font-medium">
            Type your full name to sign
          </label>
          <input
            id={`${id}-sig`}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-transparent px-3 font-serif text-base italic shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Printed name: {printedName || "—"} · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button type="button" onClick={sign} disabled={!ready || busy}>
          {busy ? "Signing…" : signLabel}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
