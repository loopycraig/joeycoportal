"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChoiceChips, Field, TextArea, TextInput } from "@/components/application/fields";
import { AgreementDocument } from "@/components/agreements/agreement-document";
import { SignPanel } from "@/components/agreements/sign-panel";
import { TEMPLATES } from "@/lib/agreements/templates";
import { cleanFields, emptySchedule, isShown, missingFields, renderAgreement } from "@/lib/agreements/render";
import { saveAgreementDraft, sendAgreement, signHostServices, voidAgreement } from "@/lib/agreements/actions";
import type { AgreementKind, AgreementStatus, FieldDef, Fields, FieldValue, Party, ScheduleRow } from "@/lib/agreements/types";

type Save = "idle" | "saving" | "saved" | "error";

export function AgreementEditor({
  id,
  kind,
  status,
  initial,
  names,
  hasConsent,
  hostName,
}: {
  id: string;
  kind: AgreementKind;
  status: AgreementStatus;
  initial: Fields;
  names: Partial<Record<Party, string>>;
  hasConsent: boolean;
  hostName: string;
}) {
  const template = TEMPLATES[kind];
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(initial);
  const [save, setSave] = useState<Save>("idle");
  const [showMissing, setShowMissing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHsa = kind === "host_services";
  const resend = status === "sent" || status === "changes_requested";

  // Autosave the draft a moment after the last change.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fields);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave("saving");
    const res = await saveAgreementDraft(id, latest.current);
    setSave(res.ok ? "saved" : "error");
    return res.ok;
  }, [id]);
  const set = (key: string, value: FieldValue) => {
    setFields((f) => {
      const next = { ...f, [key]: value };
      latest.current = next;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const missing = useMemo(() => missingFields(template, fields), [template, fields]);
  const missingKeys = new Set(showMissing ? missing.map((m) => m.key) : []);
  const preview = useMemo(() => renderAgreement(template, cleanFields(template, fields)), [template, fields]);
  const groups = [...new Set(template.fields.map((f) => f.group))];

  const send = async () => {
    setError(null);
    if (missing.length) {
      setShowMissing(true);
      return setError(`Fill in: ${missing.map((m) => m.label).join(", ")}`);
    }
    setBusy(true);
    const res = await sendAgreement(id, fields, note || undefined);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push("/host/agreements");
  };

  const withdraw = async () => {
    if (!confirm("Withdraw this agreement? The Joey won't be able to sign it.")) return;
    setBusy(true);
    const res = await voidAgreement(id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push("/host/agreements");
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-8 border-b px-4 py-6 sm:px-6 lg:border-b-0 lg:border-r">
        {groups.map((g) => {
          const defs = template.fields.filter((f) => f.group === g && isShown(f, fields));
          return (
            <fieldset key={g} className="space-y-4">
              <legend className="mb-3 text-sm font-medium">{g}</legend>
              {defs.map((def) => (
                <FieldInput key={def.key} def={def} value={fields[def.key]} missing={missingKeys.has(def.key)} onChange={(v) => set(def.key, v)} />
              ))}
            </fieldset>
          );
        })}

        {!isHsa && (
          <div className="space-y-4 border-t pt-6">
            {resend && (
              <Field label="What changed (optional)" hint="Shown to the Joey with the new version.">
                {(fid, d) => <TextArea id={fid} aria-describedby={d} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
              </Field>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={send} disabled={busy}>
                {busy ? "Sending…" : resend ? "Send new version" : "Send to Joey"}
              </Button>
              <Button type="button" variant="ghost" onClick={withdraw} disabled={busy}>
                Withdraw
              </Button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {save === "saving" ? "Saving…" : save === "saved" ? "Draft saved" : save === "error" ? "Couldn't save the draft" : "Drafts save automatically"}
              </span>
            </div>
          </div>
        )}

        {isHsa && (
          <div className="space-y-3 border-t pt-6">
            {showMissing && missing.length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                Fill in: {missing.map((m) => m.label).join(", ")}
              </p>
            )}
            <SignPanel
              printedName={hostName}
              hasConsent={hasConsent}
              statement="By signing, you agree to the Host Services Agreement shown here, including the fees in Exhibit A. JoeyCo's signature is added when you sign."
              onSign={async (typed) => {
                if (missing.length) {
                  setShowMissing(true);
                  return "Fill in the details above first.";
                }
                await flush();
                const res = await signHostServices(id, fields, typed);
                if (!res.ok) return res.error;
                router.refresh();
                return null;
              }}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 px-4 py-6 sm:px-6">
        <p className="mb-4 text-xs text-muted-foreground">Preview. Highlighted text is what you&apos;ve filled in.</p>
        <AgreementDocument blocks={preview} signatures={[]} names={names} className="mx-auto max-w-2xl" />
      </div>
    </div>
  );
}

function FieldInput({
  def,
  value,
  missing,
  onChange,
}: {
  def: FieldDef;
  value: FieldValue | undefined;
  missing: boolean;
  onChange: (v: FieldValue) => void;
}) {
  const label = def.required ? def.label : `${def.label} (optional)`;
  switch (def.type) {
    case "choice":
      return (
        <ChoiceChips
          legend={label}
          hint={def.help}
          multiple={false}
          options={def.options ?? []}
          value={typeof value === "string" ? [value] : []}
          onChange={(v) => onChange(v[0] ?? null)}
          missing={missing}
        />
      );
    case "flag":
      return (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-foreground" />
          <span>
            {def.label}
            {def.help && <span className="block text-xs text-muted-foreground">{def.help}</span>}
          </span>
        </label>
      );
    case "schedule":
      return <ScheduleInput label={def.label} hint={def.help} value={Array.isArray(value) ? value : null} onChange={onChange} />;
    case "money":
      return <MoneyInput label={label} hint={def.help} cents={typeof value === "number" ? value : null} missing={missing} onChange={onChange} />;
    case "longtext":
      return (
        <Field label={label} hint={def.help} missing={missing}>
          {(fid, d) => (
            <TextArea id={fid} aria-describedby={d} rows={4} invalid={missing} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
          )}
        </Field>
      );
    default:
      return (
        <Field label={label} hint={def.help} missing={missing}>
          {(fid, d) => (
            <TextInput
              id={fid}
              aria-describedby={d}
              invalid={missing}
              type={def.type === "date" ? "date" : def.type === "number" ? "number" : "text"}
              min={def.type === "number" ? 0 : undefined}
              value={value === null || value === undefined ? "" : String(value)}
              onChange={(e) => {
                const v = e.target.value;
                if (def.type === "number") onChange(v === "" ? null : Number(v));
                else onChange(v === "" ? null : v);
              }}
            />
          )}
        </Field>
      );
  }
}

function MoneyInput({
  label,
  hint,
  cents,
  missing,
  onChange,
}: {
  label: string;
  hint?: string;
  cents: number | null;
  missing: boolean;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(cents === null ? "" : (cents / 100).toFixed(2));
  return (
    <Field label={label} hint={hint} missing={missing}>
      {(fid, d) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <TextInput
            id={fid}
            aria-describedby={d}
            inputMode="decimal"
            invalid={missing}
            className="pl-6"
            value={text}
            onChange={(e) => {
              const t = e.target.value.replace(/[^0-9.]/g, "");
              setText(t);
              const n = Number.parseFloat(t);
              onChange(Number.isFinite(n) ? Math.round(n * 100) : null);
            }}
          />
        </div>
      )}
    </Field>
  );
}

function ScheduleInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: ScheduleRow[] | null;
  onChange: (v: ScheduleRow[]) => void;
}) {
  const rows = value ?? emptySchedule();
  const cols: [keyof ScheduleRow, string][] = [
    ["begin", "Begin"],
    ["end", "End"],
    ["resume", "Resume"],
    ["finish", "End"],
    ["hours", "Hours"],
  ];
  const update = (i: number, k: keyof ScheduleRow, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label} (optional)</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-2 text-left font-normal">Day</th>
              {cols.map(([k, l]) => (
                <th key={k} className="px-1 py-1 text-left font-normal">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ownPace = i === rows.length - 1;
              return (
                <tr key={r.day}>
                  <td className="py-0.5 pr-2">{ownPace ? "At own pace" : r.day.slice(0, 3)}</td>
                  {cols.map(([k]) =>
                    ownPace && k !== "hours" ? (
                      <td key={k} />
                    ) : (
                      <td key={k} className="px-0.5 py-0.5">
                        <input
                          aria-label={`${r.day} ${k}`}
                          value={r[k]}
                          onChange={(e) => update(i, k, e.target.value)}
                          className="h-7 w-16 rounded border border-input bg-transparent px-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}
