"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_CITIES, isSupportedCity, normalizeCity } from "@/lib/joey/application";

type Option = { kind: "supported"; city: string } | { kind: "custom"; city: string };

/**
 * Search our supported cities, or type any other city. Picks show as chips; cities we're
 * not active in yet are marked, with a note encouraging the Joey to apply anyway.
 */
export function CityPicker({
  legend,
  hint,
  value,
  onChange,
  missing,
  missingText,
}: {
  legend: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  missing?: boolean;
  missingText?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const chosen = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);

  const options: Option[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = SUPPORTED_CITIES.filter((c) => !chosen.has(c.toLowerCase()));
    if (!q) return available.map((city) => ({ kind: "supported", city }));
    const starts = available.filter((c) => c.toLowerCase().startsWith(q));
    const contains = available.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    const matches: Option[] = [...starts, ...contains].map((city) => ({ kind: "supported", city }));
    // Anything that isn't exactly one of ours can be added as typed.
    const typed = normalizeCity(query);
    if (!isSupportedCity(typed) && !chosen.has(typed.toLowerCase())) matches.push({ kind: "custom", city: typed });
    return matches;
  }, [query, chosen]);

  const add = (city: string) => {
    const c = normalizeCity(city);
    if (c && !chosen.has(c.toLowerCase())) onChange([...value, c]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (city: string) => onChange(value.filter((v) => v !== city));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (open && o) add(o.city);
      else if (query.trim()) add(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const notYet = value.filter((c) => !isSupportedCity(c));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-0.5" aria-label="Cities you chose">
          {value.map((c) => {
            const ours = isSupportedCity(c);
            return (
              <li
                key={c}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-sm",
                  ours ? "border-foreground/80 bg-foreground text-background" : "border-dashed border-input",
                )}
              >
                {ours && <Check className="size-3.5" aria-hidden />}
                {c}
                {!ours && <span className="text-xs text-muted-foreground">· not active yet</span>}
                <button
                  type="button"
                  onClick={() => remove(c)}
                  aria-label={`Remove ${c}`}
                  className={cn(
                    "grid size-5 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    ours ? "hover:bg-background/20" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={value.length ? "Add another city" : "Search cities"}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={missing || undefined}
          autoComplete="off"
          placeholder={value.length ? "Add another city" : "Search cities, or type any city"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-sm",
            missing && "border-destructive",
          )}
        />
        {open && options.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md sm:max-w-sm"
          >
            {options.map((o, i) => (
              <li
                key={`${o.kind}-${o.city}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click, so the input's blur doesn't close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o.city);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm",
                  i === active && "bg-accent/60",
                )}
              >
                {o.kind === "supported" ? (
                  <span>{o.city}</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Plus className="size-3.5 text-muted-foreground" aria-hidden />
                    Add &ldquo;{o.city}&rdquo;
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {o.kind === "supported" ? "Active" : "Not active yet"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {notYet.length > 0 && (
        <p className="max-w-prose rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          We&apos;re not active in {listOf(notYet)} yet, but please submit your application anyway. We&apos;re growing,
          and where applicants want to live helps us decide where to go next.
        </p>
      )}
      {missing && <p className="text-xs text-destructive">{missingText ?? "Required"}</p>}
    </fieldset>
  );
}

function listOf(xs: string[]) {
  if (xs.length <= 2) return xs.join(" or ");
  return `${xs.slice(0, -1).join(", ")}, or ${xs[xs.length - 1]}`;
}
