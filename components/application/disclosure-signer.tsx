"use client";

import { useId, useState } from "react";
import { Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { cn } from "@/lib/utils";
import { DISCLOSURES, type Disclosure, type DisclosureId } from "@/lib/joey/disclosures";

export type Signature = {
  signature: string | null;
  signedAt: string | null;
  /** California only */
  copyRequested?: boolean | null;
};

export type SignInput = { signature: string; version: string; copyRequested?: boolean };

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The documents in Acknowledgements: background check disclosures and the Code of Conduct. Each opens in a modal as its own document; the Joey signs
 * by typing their full name. Signing saves right away, and the database stamps the time.
 */
export function DisclosureSigner({
  signatures,
  printedName,
  onSign,
  missing,
}: {
  signatures: Record<DisclosureId, Signature>;
  printedName: string;
  /** Saves the signature. Resolves false if it couldn't be saved. */
  onSign: (id: DisclosureId, input: SignInput) => Promise<boolean>;
  missing: Record<DisclosureId, boolean>;
}) {
  const [openId, setOpenId] = useState<DisclosureId | null>(null);
  const open = DISCLOSURES.find((d) => d.id === openId) ?? null;

  return (
    <>
      <ul className="max-w-xl divide-y rounded-lg border">
        {DISCLOSURES.map((d) => {
          const s = signatures[d.id];
          const signed = Boolean(s.signature?.trim());
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border",
                  signed ? "border-emerald-500 bg-emerald-500 text-white" : "text-muted-foreground",
                  !signed && missing[d.id] && "border-destructive text-destructive",
                )}
              >
                {signed ? <Check className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <p className={cn("text-xs", !signed && missing[d.id] ? "text-destructive" : "text-muted-foreground")}>
                  {signed
                    ? `Signed by ${s.signature}${s.signedAt ? ` · ${stamp(s.signedAt)}` : ""}`
                    : missing[d.id]
                      ? "Needs your signature"
                      : "Not signed yet"}
                </p>
              </div>
              <Button type="button" size="sm" variant={signed ? "outline" : "default"} onClick={() => setOpenId(d.id)}>
                {signed ? "View" : "Read and sign"}
              </Button>
            </li>
          );
        })}
      </ul>

      <Modal open={open !== null} onClose={() => setOpenId(null)} title={open?.name ?? ""} size="lg">
        {open && (
          <DisclosureDocument
            key={open.id}
            disclosure={open}
            current={signatures[open.id]}
            printedName={printedName}
            onSign={async (input) => {
              const ok = await onSign(open.id, input);
              if (ok) setOpenId(null);
              return ok;
            }}
            onClose={() => setOpenId(null)}
          />
        )}
      </Modal>
    </>
  );
}

/** One document with its signature. Without onSign/onClose it's read-only (no buttons). */
export function DisclosureDocument({
  disclosure: d,
  current,
  printedName,
  onSign,
  onClose,
}: {
  disclosure: Disclosure;
  current: Signature;
  printedName: string;
  onSign?: (input: SignInput) => Promise<boolean>;
  onClose?: () => void;
}) {
  const id = useId();
  const signed = Boolean(current.signature?.trim());
  const [name, setName] = useState("");
  const [copy, setCopy] = useState(Boolean(current.copyRequested));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = async () => {
    if (!onSign) return;
    setSaving(true);
    setError(null);
    const ok = await onSign({ signature: name.trim(), version: d.version, copyRequested: d.copyOption ? copy : undefined });
    setSaving(false);
    if (!ok) setError("Couldn't save your signature. Check your connection and try again.");
  };

  return (
    <div className="space-y-6 px-2 pb-2 pt-2 text-sm leading-relaxed">
      {/* The disclosure itself, on its own */}
      <article className="space-y-4">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide">
          {d.title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h3>
        {d.body.map((b, i) =>
          b.kind === "p" ? (
            <p key={i}>{b.text}</p>
          ) : (
            <p key={i} className="flex gap-3">
              <span className="tabular-nums">{b.n}.</span>
              <span>
                <span className="font-medium underline underline-offset-2">{b.heading}</span> {b.text}
              </span>
            </p>
          ),
        )}

        {d.copyOption && (
          <label className="flex items-start gap-3 rounded-md border px-3 py-2.5">
            <input
              type="checkbox"
              checked={copy}
              disabled={signed}
              onChange={(e) => setCopy(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-foreground"
            />
            <span>{d.copyOption}</span>
          </label>
        )}
      </article>

      <section aria-labelledby={`${id}-auth`} className="space-y-4 border-t pt-5">
        <h3 id={`${id}-auth`} className="text-center text-sm font-semibold uppercase tracking-wide">
          {d.authorizationHeading ?? "Authorization"}
        </h3>
        <p>{d.authorization}</p>

        {signed ? (
          <dl className="grid gap-x-6 gap-y-2 rounded-md bg-muted/40 px-4 py-3 sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">Signature</dt>
            <dd className="font-serif text-base italic">{current.signature}</dd>
            <dt className="text-muted-foreground">Printed name</dt>
            <dd>{printedName || "—"}</dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{current.signedAt ? stamp(current.signedAt) : "Just now"}</dd>
          </dl>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-sig`} className="block font-medium">
                Type your full name to sign
              </label>
              <input
                id={`${id}-sig`}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 font-serif text-base italic shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-sm"
              />
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-[8rem_1fr]">
              <dt>Printed name</dt>
              <dd className="text-foreground">{printedName || "Add your name in About you"}</dd>
              <dt>Date</dt>
              <dd className="text-foreground">{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</dd>
            </dl>
          </div>
        )}
      </section>

      {error && <p className="text-destructive">{error}</p>}

      {onClose && (
        <div className="flex justify-end gap-2 border-t pt-4">
          {signed ? (
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={sign} disabled={saving || name.trim().length < 2}>
                {saving ? "Signing…" : (d.signLabel ?? "Sign and authorize")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
