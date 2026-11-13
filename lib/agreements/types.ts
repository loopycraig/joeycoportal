// Shared by the agreement templates, the renderer, server actions and UI.

export type AgreementKind = "offer_letter" | "housing_license" | "host_services";
export type AgreementStatus = "draft" | "sent" | "changes_requested" | "awaiting_countersign" | "executed" | "void";
export type Party = "joey" | "host" | "joeyco";

/** Template text. Markup inside `text` is described in lib/agreements/render.ts. */
export type Block =
  | { t: "title" | "sub"; text: string }
  | { t: "p" | "li"; text: string; n?: string; lvl?: number }
  | { t: "schedule"; field: string }
  | { t: "box"; field: string }
  | { t: "signatures"; parties: Party[]; addendum?: boolean }
  | { t: "break" };

/** A piece of rendered text. `f` marks a filled-in value, `empty` an unfilled one, `box` a ☐/☒. */
export type Run = { s: string; b?: true; u?: true; f?: true; empty?: true; box?: true };

/** The frozen document a signer sees. Stored with each version and hashed. */
export type RenderedBlock =
  | { t: "title" | "sub" | "box"; runs: Run[] }
  | { t: "p" | "li"; runs: Run[]; n?: string; lvl?: number }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "signatures"; parties: Party[]; addendum?: boolean }
  | { t: "break" };

export type ScheduleRow = { day: string; begin: string; end: string; resume: string; finish: string; hours: string };

export type FieldValue = string | number | boolean | ScheduleRow[] | null;
export type Fields = Record<string, FieldValue>;

export type Prefill = "today" | "host_name" | "joey_name" | "host_address" | "hourly_rate" | "monthly_rent" | "match_start";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "money" | "number" | "choice" | "flag" | "schedule";
  /** Editor section heading. */
  group: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** Required when shown. */
  required?: boolean;
  /** Only shown (and required) when this condition holds, e.g. "rent_mode=amount". */
  when?: string;
  /** For flags whose value appears in the text: what to print when on. */
  flagText?: string;
  prefill?: Prefill;
};

export type Template = {
  kind: AgreementKind;
  /** Stored with every version. Bump when the wording or fields change. */
  version: string;
  title: string;
  /** Who signs, in order. */
  parties: Party[];
  fields: FieldDef[];
  body: Block[];
};
