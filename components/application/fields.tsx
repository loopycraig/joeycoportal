"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type FieldProps = {
  label: string;
  hint?: string;
  missing?: boolean;
  missingText?: string;
  className?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
};

export function Field({ label, hint, missing, missingText, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = missing ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {missing && (
        <p id={errId} className="text-xs text-destructive">
          {missingText ?? "Required"}
        </p>
      )}
    </div>
  );
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={cn(control, "h-9", invalid && "border-destructive", className)} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean },
) {
  const { invalid, className, ...rest } = props;
  return (
    <textarea {...rest} aria-invalid={invalid || undefined} className={cn(control, "min-h-28 resize-y", invalid && "border-destructive", className)} />
  );
}

export function SelectInput({
  id,
  value,
  options,
  onChange,
  invalid,
  placeholder = "Choose one",
  describedBy,
}: {
  id: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(control, "h-9", !value && "text-muted-foreground", invalid && "border-destructive")}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o} value={o} className="text-foreground">
          {o}
        </option>
      ))}
    </select>
  );
}

/** Toggle chips. multiple=false behaves like a radio group. */
export function ChoiceChips({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple = true,
  missing,
  missingText,
}: {
  legend: string;
  hint?: string;
  options: { value: string; label: string }[] | string[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  missing?: boolean;
  missingText?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const toggle = (v: string) => {
    if (!multiple) return onChange([v]);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2 pt-0.5" role={multiple ? "group" : "radiogroup"}>
        {opts.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role={multiple ? undefined : "radio"}
              aria-pressed={multiple ? on : undefined}
              aria-checked={multiple ? undefined : on}
              onClick={() => toggle(o.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                on
                  ? "border-foreground/80 bg-foreground text-background"
                  : "border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {on && multiple && <Check className="size-3.5" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
      {missing && <p className="text-xs text-destructive">{missingText ?? "Required"}</p>}
    </fieldset>
  );
}
