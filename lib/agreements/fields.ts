// Cleaning field values sent from the editor, plus labels and list sections. Shared by server and client.

import { emptySchedule } from "@/lib/agreements/render";
import type { AgreementKind, AgreementStatus, FieldDef, Fields, FieldValue, ScheduleRow, Template } from "@/lib/agreements/types";

const MAX_TEXT = 500;
const MAX_LONG = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanOne(def: FieldDef, v: unknown): FieldValue {
  if (v === null || v === undefined) return null;
  switch (def.type) {
    case "text":
      return typeof v === "string" ? v.slice(0, MAX_TEXT) : null;
    case "longtext":
      return typeof v === "string" ? v.slice(0, MAX_LONG) : null;
    case "date":
      return typeof v === "string" && DATE.test(v) ? v : null;
    case "money":
      return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
    case "number":
      return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
    case "choice":
      return typeof v === "string" && def.options?.some((o) => o.value === v) ? v : null;
    case "flag":
      return v === true;
    case "schedule": {
      if (!Array.isArray(v)) return null;
      const base = emptySchedule();
      return base.map((row, i): ScheduleRow => {
        const r = (v[i] ?? {}) as Partial<ScheduleRow>;
        const s = (x: unknown) => (typeof x === "string" ? x.slice(0, 20) : "");
        return { day: row.day, begin: s(r.begin), end: s(r.end), resume: s(r.resume), finish: s(r.finish), hours: s(r.hours) };
      });
    }
  }
}

/** Keeps only the template's fields, each coerced to its type. */
export function sanitizeFields(template: Template, input: Record<string, unknown>): Fields {
  const out: Fields = {};
  for (const def of template.fields) {
    if (!(def.key in input)) continue;
    out[def.key] = cleanOne(def, input[def.key]);
  }
  return out;
}

export const KIND_LABEL: Record<AgreementKind, string> = {
  offer_letter: "Employment Offer Letter",
  housing_license: "Housing License Agreement",
  host_services: "Host Services Agreement",
};

export type Viewer = "host" | "joey";

/** Status in words, from the viewer's side. */
export function statusLabel(status: AgreementStatus, viewer: Viewer, kind: AgreementKind): string {
  if (kind === "host_services") return status === "executed" ? "Signed" : status === "void" ? "Withdrawn" : "Needs your signature";
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return viewer === "joey" ? "Ready for your review" : "With the Joey to review";
    case "changes_requested":
      return viewer === "joey" ? "You asked for changes" : "Changes requested";
    case "awaiting_countersign":
      return viewer === "host" ? "Ready for your signature" : "Waiting for the Host to sign";
    case "executed":
      return "Signed by everyone";
    case "void":
      return "Withdrawn";
  }
}

/** Whether it's the viewer's turn. */
export function needsAction(status: AgreementStatus, viewer: Viewer, kind: AgreementKind): boolean {
  if (kind === "host_services") return status === "draft";
  if (viewer === "joey") return status === "sent";
  return status === "draft" || status === "changes_requested" || status === "awaiting_countersign";
}

export type Section = "pending" | "active" | "expired";

/** Pending until signed by everyone; then active until the match ends, the term runs out, or it's replaced. */
export function sectionOf(
  a: { status: AgreementStatus; ends_on: string | null; match_ended: boolean; superseded: boolean },
  today: string,
): Section {
  if (a.status === "void") return "expired";
  if (a.status !== "executed") return "pending";
  if (a.match_ended || a.superseded || (a.ends_on !== null && a.ends_on < today)) return "expired";
  return "active";
}

/** Today's date in California, as YYYY-MM-DD. */
export function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}
