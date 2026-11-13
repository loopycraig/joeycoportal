// Turns a template plus field values into the document a signer sees. Runs on server and client
// (the editor's live preview uses it too); hashing is server-only in lib/agreements/hash.ts.
//
// Markup in template text:
//   **bold**  __underline__
//   {{key}}         a field's value, or a blank line if it's empty
//   {{key?cond}}    the same, but only when cond holds (otherwise a blank line)
//   [[cond]]        a checkbox: ☒ when cond holds, ☐ otherwise
// cond is "key" (truthy), "key=value" or "key!=value".

import type { Block, FieldDef, Fields, FieldValue, RenderedBlock, Run, ScheduleRow, Template } from "@/lib/agreements/types";

const BLANK = "______________";

export function holds(cond: string, fields: Fields): boolean {
  const ne = cond.split("!=");
  if (ne.length === 2) {
    const v = fields[ne[0]];
    return v !== null && v !== undefined && v !== "" && String(v) !== ne[1];
  }
  const eq = cond.split("=");
  if (eq.length === 2) return String(fields[eq[0]] ?? "") === eq[1];
  const v = fields[cond];
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

/** Whether a field applies, given the others (its `when`). */
export function isShown(def: FieldDef, fields: Fields) {
  return !def.when || holds(def.when, fields);
}

export function isEmpty(v: FieldValue | undefined) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** A field's value as it reads in the document, or null when it's empty. */
export function formatValue(def: FieldDef | undefined, v: FieldValue | undefined): string | null {
  if (isEmpty(v)) return null;
  if (!def) return String(v);
  switch (def.type) {
    case "money":
      return typeof v === "number" ? money(v) : null;
    case "date":
      return longDate(String(v));
    case "choice":
      return def.options?.find((o) => o.value === v)?.label ?? String(v);
    case "flag":
      return v ? (def.flagText ?? null) : null;
    case "schedule":
      return null;
    default:
      return String(v).trim();
  }
}

const TOKEN = /(\*\*|__|\{\{[^}]+\}\}|\[\[[^\]]+\]\])/;

function toRuns(text: string, fields: Fields, defs: Map<string, FieldDef>): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let under = false;
  const push = (r: Run) => {
    if (bold) r.b = true;
    if (under) r.u = true;
    runs.push(r);
  };
  for (const part of text.split(TOKEN)) {
    if (!part) continue;
    if (part === "**") bold = !bold;
    else if (part === "__") under = !under;
    else if (part.startsWith("[[")) push({ s: holds(part.slice(2, -2), fields) ? "☒" : "☐", box: true });
    else if (part.startsWith("{{")) {
      const [key, cond] = part.slice(2, -2).split("?");
      const def = defs.get(key);
      const value = !cond || holds(cond, fields) ? formatValue(def, fields[key]) : null;
      // Flags with no text when off (e.g. "in addition to federal holidays") just disappear.
      if (value === null && def?.type === "flag") continue;
      push(value === null ? { s: BLANK, empty: true } : { s: value, f: true });
    } else push({ s: part });
  }
  return runs;
}

export const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "Complete At Own Pace (non-scheduled)",
];

export function emptySchedule(): ScheduleRow[] {
  return SCHEDULE_DAYS.map((day) => ({ day, begin: "", end: "", resume: "", finish: "", hours: "" }));
}

function scheduleTable(v: FieldValue | undefined): RenderedBlock {
  const rows = Array.isArray(v) && v.length ? v : emptySchedule();
  const cell = (s: string) => s.trim() || "—";
  return {
    t: "table",
    head: ["", "Begin", "End", "Resume", "End", "Hours"],
    rows: rows.map((r, i) =>
      i === SCHEDULE_DAYS.length - 1
        ? [r.day, "", "", "", "", cell(r.hours)]
        : [r.day, cell(r.begin), cell(r.end), cell(r.resume), cell(r.finish), cell(r.hours)],
    ),
  };
}

export function renderAgreement(template: Template, fields: Fields): RenderedBlock[] {
  const defs = new Map(template.fields.map((f) => [f.key, f]));
  return template.body.map((b: Block): RenderedBlock => {
    switch (b.t) {
      case "title":
      case "sub":
        return { t: b.t, runs: toRuns(b.text, fields, defs) };
      case "p":
      case "li":
        return { t: b.t, runs: toRuns(b.text, fields, defs), ...(b.n ? { n: b.n } : {}), ...(b.lvl ? { lvl: b.lvl } : {}) };
      case "schedule":
        return scheduleTable(fields[b.field]);
      case "box": {
        const v = formatValue(defs.get(b.field), fields[b.field]);
        return { t: "box", runs: [v === null ? { s: "None.", empty: true } : { s: v, f: true }] };
      }
      case "signatures":
        return b;
      case "break":
        return b;
    }
  });
}

/** Required fields that are shown and empty, as their labels. */
export function missingFields(template: Template, fields: Fields): FieldDef[] {
  return template.fields.filter((f) => f.required && isShown(f, fields) && isEmpty(fields[f.key]));
}

/** Drops values for fields that don't apply (e.g. a fixed-term end date on a month-to-month license). */
export function cleanFields(template: Template, fields: Fields): Fields {
  const out: Fields = {};
  for (const f of template.fields) {
    if (!isShown(f, fields) || isEmpty(fields[f.key])) continue;
    out[f.key] = fields[f.key];
  }
  return out;
}
