"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/application/fields";
import { addReference, removeReference, updateReference } from "@/lib/joey/actions";
import {
  MAX_REFERENCES,
  REFERENCE_TYPE_HINT,
  REFERENCE_TYPE_LABELS,
  REFERENCE_TYPES,
  missingReferenceKinds,
  validateReference,
  type Reference,
  type ReferenceInput,
} from "@/lib/joey/application";

const EMPTY: ReferenceInput = { full_name: "", reference_type: null, relationship: "", email: "", phone: "", known_for: "" };

export function ReferencesEditor({
  initial,
  editable,
  onChange,
  showMissing,
}: {
  initial: Reference[];
  editable: boolean;
  onChange?: (refs: Reference[]) => void;
  showMissing?: boolean;
}) {
  const [refs, setRefs] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const stillNeeded = missingReferenceKinds(refs.map((r) => r.reference_type));

  const setAndReport = (next: Reference[]) => {
    setRefs(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-3">
      {refs.length === 0 && editing !== "new" && (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {editable
            ? `No references yet. Add up to ${MAX_REFERENCES}. Family members don't count.`
            : "No references listed."}
        </p>
      )}

      <ul className="divide-y rounded-md border empty:hidden">
        {refs.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="p-4">
              <ReferenceForm
                initial={r}
                submitLabel="Save reference"
                onCancel={() => setEditing(null)}
                onSubmit={async (input) => {
                  const res = await updateReference(r.id, input);
                  if (!res.ok) return res.error;
                  setAndReport(refs.map((x) => (x.id === r.id ? res.reference : x)));
                  setEditing(null);
                  return null;
                }}
              />
            </li>
          ) : (
            <ReferenceRow
              key={r.id}
              reference={r}
              editable={editable && editing === null}
              onEdit={() => setEditing(r.id)}
              onRemove={async () => {
                const res = await removeReference(r.id);
                if (!res.ok) return res.error;
                setAndReport(refs.filter((x) => x.id !== r.id));
                return null;
              }}
            />
          ),
        )}
      </ul>

      {editing === "new" && (
        <div className="rounded-md border p-4">
          <ReferenceForm
            initial={EMPTY}
            submitLabel="Add reference"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              const res = await addReference(input);
              if (!res.ok) return res.error;
              setAndReport([...refs, res.reference]);
              setEditing(null);
              return null;
            }}
          />
        </div>
      )}

      {editable && editing === null && refs.length < MAX_REFERENCES && (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          Add a reference
        </Button>
      )}

      {editable && (refs.length > 0 || showMissing) && stillNeeded.length > 0 && (
        <p className={showMissing ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          Still needed to submit: {listOf(stillNeeded.map((k) => k.label))}.
        </p>
      )}
    </div>
  );
}

function ReferenceRow({
  reference: r,
  editable,
  onEdit,
  onRemove,
}: {
  reference: Reference;
  editable: boolean;
  onEdit: () => void;
  onRemove: () => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {r.full_name}
          {r.reference_type && <span className="font-normal text-muted-foreground"> · {REFERENCE_TYPE_LABELS[r.reference_type]}</span>}
        </p>
        <p className="text-muted-foreground">
          {r.relationship}, known for {r.known_for}
        </p>
        <p className="truncate text-muted-foreground">
          {r.email}
          <span aria-hidden className="px-1.5">
            /
          </span>
          {r.phone}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      {editable && (
        <div className="flex shrink-0 gap-1">
          {confirming ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const err = await onRemove();
                  setBusy(false);
                  if (err) {
                    setError(err);
                    setConfirming(false);
                  }
                }}
              >
                Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ReferenceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ReferenceInput;
  submitLabel: string;
  onSubmit: (r: ReferenceInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [r, setR] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ReferenceInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setR({ ...r, [k]: e.target.value });

  const submit = async () => {
    const invalid = validateReference(r);
    if (invalid) return setError(invalid);
    setBusy(true);
    const err = await onSubmit(r);
    setBusy(false);
    setError(err);
  };

  return (
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          {(id) => <TextInput id={id} value={r.full_name} onChange={set("full_name")} autoComplete="off" />}
        </Field>
        <Field label="Type of reference" hint={REFERENCE_TYPE_HINT}>
          {(id, d) => (
            <SelectInput id={id} describedBy={d} options={[...REFERENCE_TYPES]} labels={REFERENCE_TYPE_LABELS} value={r.reference_type}
              onChange={(v) => setR({ ...r, reference_type: v as ReferenceInput["reference_type"] })} />
          )}
        </Field>
        <Field label="How you know them" hint="For example, manager at a summer job">
          {(id, d) => <TextInput id={id} aria-describedby={d} value={r.relationship} onChange={set("relationship")} />}
        </Field>
        <Field label="Email">
          {(id) => <TextInput id={id} type="email" value={r.email} onChange={set("email")} autoComplete="off" />}
        </Field>
        <Field label="Phone">
          {(id) => <TextInput id={id} type="tel" value={r.phone} onChange={set("phone")} autoComplete="off" />}
        </Field>
        <Field label="How long you've known them" hint="For example, 2 years">
          {(id, d) => <TextInput id={id} aria-describedby={d} value={r.known_for} onChange={set("known_for")} />}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function listOf(xs: string[]) {
  if (xs.length <= 2) return xs.join(" and ");
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}
