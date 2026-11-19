// Shared by server and client code. Mirrors public.application_missing() in SQL,
// which stays the authority on submit.

export type Application = {
  joey_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  work_authorized: string | null;
  /** Required when work_authorized is "Other". */
  work_auth_explanation: string | null;
  school_degree: string | null;
  host_preference: string | null;
  preferred_cities: string[];
  /** Older applications only; new ones give move_in_date. */
  move_in_timing: string | null;
  /** The earliest date they could move in. */
  move_in_date: string | null;
  services: string[];
  why_joey: string | null;
  heard_about: string | null;
  conduct_signature: string | null;
  conduct_version: string | null;
  conduct_signed_at: string | null;
  news_opt_in: boolean | null;
  // Background check disclosures (lib/joey/disclosures.ts). *_signed_at is stamped by the database.
  bg_disclosure_signature: string | null;
  bg_disclosure_version: string | null;
  bg_disclosure_signed_at: string | null;
  ca_disclosure_signature: string | null;
  ca_disclosure_version: string | null;
  ca_disclosure_signed_at: string | null;
  ca_report_copy_requested: boolean | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
  stage_key: string;
  stage_changed_at: string;
};

export type Reference = {
  id: string;
  full_name: string;
  /** One of REFERENCE_TYPES. Null on references added before types were asked for. */
  reference_type: ReferenceType | null;
  relationship: string;
  email: string;
  phone: string;
  known_for: string;
};

export type ReferenceInput = Omit<Reference, "id">;

/** Must match the options on Clarify's c_reference.type field exactly. */
export const REFERENCE_TYPES = ["Institutional", "Professional", "Landlord", "Housemate", "Personal"] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

/** What Joeys see for each type. The values stay Clarify's. */
export const REFERENCE_TYPE_LABELS: Record<ReferenceType, string> = {
  Institutional: "School or community",
  Professional: "Work",
  Landlord: "Landlord",
  Housemate: "Housemate",
  Personal: "Personal",
};

/** Shown under the picker so Joeys can tell the types apart. */
export const REFERENCE_TYPE_HINT =
  "School or community: a professor, advisor, coach, or mentor. Work: a manager or coworker. Landlord or Housemate: someone you've lived with. Personal: anyone else who knows you well, other than family.";

/**
 * The references every application needs, one of each (Joey Journey one-pager:
 * "school or community, work, past landlord or housemate"). Keys match application_missing().
 */
export const REQUIRED_REFERENCE_KINDS: { key: string; label: string; types: ReferenceType[] }[] = [
  { key: "reference_school", label: "a school or community reference", types: ["Institutional"] },
  { key: "reference_work", label: "a work reference", types: ["Professional"] },
  { key: "reference_home", label: "a landlord or housemate reference", types: ["Landlord", "Housemate"] },
];

/** The required kinds this list of references doesn't cover yet. */
export function missingReferenceKinds(types: (ReferenceType | null)[]) {
  return REQUIRED_REFERENCE_KINDS.filter((k) => !types.some((t) => t && k.types.includes(t)));
}

export const REFERENCE_SELECT = "id, full_name, reference_type, relationship, email, phone, known_for";

/** The columns a Joey can write while their application is a draft. */
export const EDITABLE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "date_of_birth",
  "work_authorized",
  "work_auth_explanation",
  "school_degree",
  "host_preference",
  "preferred_cities",
  "move_in_date",
  "services",
  "why_joey",
  "heard_about",
  "conduct_signature",
  "conduct_version",
  "news_opt_in",
  "bg_disclosure_signature",
  "bg_disclosure_version",
  "ca_disclosure_signature",
  "ca_disclosure_version",
  "ca_report_copy_requested",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ApplicationDraft = Pick<Application, EditableField>;

export const APPLICATION_SELECT =
  "joey_id, first_name, last_name, phone, date_of_birth, work_authorized, work_auth_explanation, school_degree, host_preference, preferred_cities, move_in_timing, move_in_date, services, why_joey, heard_about, conduct_signature, conduct_version, conduct_signed_at, news_opt_in, bg_disclosure_signature, bg_disclosure_version, bg_disclosure_signed_at, ca_disclosure_signature, ca_disclosure_version, ca_disclosure_signed_at, ca_report_copy_requested, status, submitted_at, stage_key, stage_changed_at";

// ─────────────────────────────────────────────
// Answer choices
// Single-choice values must match the allowed values of the c_joey select fields in Clarify
// exactly (work_authorization, move_in_timeline, application_source, host_preference),
// or Clarify rejects them.
// ─────────────────────────────────────────────

/** Single choice, sent to c_joey.host_preference. */
export const HOST_PREFERENCE_OPTIONS = ["Older adults", "Families with children", "Both"];

/** Sent to c_joey.work_authorization. "Other" asks for an explanation. */
export const WORK_AUTH_OPTIONS = ["Yes", "No", "Not sure", "Other"];

/**
 * Cities on Clarify's Preferred Cities field. Must match its options exactly, since only these
 * are sent there. Joeys can also type any other city; it's saved with their application.
 */
export const SUPPORTED_CITIES = [
  "Alameda", "Anaheim", "Berkeley", "Beverly Hills", "Burbank", "Burlingame", "Camarillo",
  "Carlsbad", "Carpinteria", "Castro Valley", "Chula Vista", "Concord", "Corona", "Coronado",
  "Costa Mesa", "Culver City", "Daly City", "Dublin", "Echo Park", "El Cajon", "El Segundo",
  "Encino", "Encinitas", "Escondido", "Fairfax", "Fontana", "Fremont", "Fullerton", "Garden Grove",
  "Glendale", "Goleta", "Hawthorne", "Hayward", "Hermosa Beach", "Huntington Beach", "Inglewood",
  "Irvine", "La Jolla", "Laguna Beach", "Lake Forest", "Livermore", "Long Beach", "Los Angeles",
  "Los Feliz", "Manhattan Beach", "Mill Valley", "Mission Viejo", "Moreno Valley", "Mountain View",
  "Napa", "National City", "Newport Beach", "Novato", "Oakland", "Oceanside", "Ontario", "Orange",
  "Oxnard", "Palm Springs", "Palo Alto", "Pasadena", "Petaluma", "Pleasanton", "Rancho Cucamonga",
  "Redlands", "Redondo Beach", "Redwood City", "Richmond", "Riverside", "San Bernardino",
  "San Diego", "San Francisco", "San Jose", "San Leandro", "San Mateo", "San Rafael", "Santa Ana",
  "Santa Barbara", "Santa Clara", "Santa Monica", "Santa Rosa", "Sherman Oaks", "Silver Lake",
  "Simi Valley", "South San Francisco", "Studio City", "Sunnyvale", "Temecula", "Thousand Oaks",
  "Torrance", "Tustin", "Ventura", "Walnut Creek", "West Hollywood",
];

const supportedByKey = new Map(SUPPORTED_CITIES.map((c) => [cityKey(c), c]));

function cityKey(city: string) {
  return city.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Tidies a typed city, using our spelling when it's one of the supported cities. */
export function normalizeCity(city: string) {
  const tidy = city.trim().replace(/\s+/g, " ");
  return supportedByKey.get(cityKey(tidy)) ?? tidy;
}

export function isSupportedCity(city: string) {
  return supportedByKey.has(cityKey(city));
}

/** Clarify's c_joey.move_in_timeline options. The portal asks for a date and works out the bucket. */
export const MOVE_IN_OPTIONS = ["As soon as possible", "Within 6 months", "Within 1 year", "Other"] as const;

/** Today's date in California, as YYYY-MM-DD. */
export function todayPacific(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** The Move-in timeline bucket for an earliest move-in date, counted from today. */
export function moveInTimeline(date: string, today = todayPacific()): (typeof MOVE_IN_OPTIONS)[number] {
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  if (days <= 31) return "As soon as possible";
  if (days <= 183) return "Within 6 months";
  if (days <= 366) return "Within 1 year";
  return "Other";
}

/** Matches the Tally form */
export const SERVICE_OPTIONS = [
  "Light Housekeeping",
  "Home Upkeep",
  "Groceries, Meal Prep & Dishes",
  "Pet Care",
  "Transportation - Driving",
  "Errands & Returns",
  "Digital/Tech Support",
  "Personal Assistant & Calendar Management",
  "Babysitting",
  "Hobbies & Interest Participation",
];

/** Sent to c_joey.application_source. */
export const HEARD_ABOUT_OPTIONS = [
  "JoeyCo Website",
  "Instagram",
  "Handshake",
  "Indeed",
  "Craigslist",
  "Other Job Board",
  "JoeyCo Community",
  "Direct Email",
  "Other",
];

export const MIN_REFERENCES = REQUIRED_REFERENCE_KINDS.length;
export const MAX_REFERENCES = 5;

// ─────────────────────────────────────────────
// Sections (drive the form, the checklist, and error messages)
// ─────────────────────────────────────────────

export type SectionId = "about" | "preferences" | "story" | "references" | "acknowledgements";

export const SECTIONS: { id: SectionId; title: string; checklistLabel: string; keys: string[] }[] = [
  {
    id: "about",
    title: "About you",
    checklistLabel: "Tell us about yourself",
    keys: ["first_name", "last_name", "phone", "date_of_birth", "under_18", "work_authorized", "work_auth_explanation", "school_degree"],
  },
  {
    id: "preferences",
    title: "Match preferences",
    checklistLabel: "Choose your cities, timing, and the help you'd offer",
    keys: ["preferred_cities", "move_in_date", "host_preference", "services"],
  },
  {
    id: "story",
    title: "Your story",
    checklistLabel: "Share why you want to be a Joey",
    keys: ["why_joey", "heard_about"],
  },
  {
    id: "references",
    title: "References",
    checklistLabel: "Add a reference from your school or community, work, and someone you've lived with",
    keys: REQUIRED_REFERENCE_KINDS.map((k) => k.key),
  },
  {
    id: "acknowledgements",
    title: "Acknowledgements",
    checklistLabel: "Read and sign the background check disclosures and the Code of Conduct",
    keys: ["bg_disclosure_signature", "ca_disclosure_signature", "conduct_signature"],
  },
];

export const MISSING_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  under_18: "You need to be 18 or older to apply",
  work_authorized: "Work authorization",
  work_auth_explanation: "An explanation of your work authorization",
  school_degree: "School, degree, year",
  host_preference: "Hosts you'd be comfortable working with",
  preferred_cities: "At least one city",
  move_in_date: "Earliest move-in date",
  services: "At least one kind of help",
  why_joey: "Why you want to be a Joey",
  heard_about: "How you heard about us",
  conduct_signature: "Your signature on the Code of Conduct",
  bg_disclosure_signature: "Your signature on the background check disclosure",
  ca_disclosure_signature: "Your signature on the California disclosure",
  ...Object.fromEntries(REQUIRED_REFERENCE_KINDS.map((k) => [k.key, k.label.charAt(0).toUpperCase() + k.label.slice(1)])),
};

const blank = (v: string | null | undefined) => !v || v.trim() === "";

export function isAdult(dob: string, today = new Date()): boolean {
  const [y, m, d] = dob.split("-").map(Number);
  const eighteenth = new Date(Date.UTC(y + 18, m - 1, d));
  return eighteenth.getTime() <= Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

/** Same keys and order as public.application_missing(), plus the two disclosure signatures
 *  (see supabase/migrations/20261112_background_check_disclosures.sql). */
export function missingFields(a: ApplicationDraft, referenceTypes: (ReferenceType | null)[]): string[] {
  const out: string[] = [];
  if (blank(a.first_name)) out.push("first_name");
  if (blank(a.last_name)) out.push("last_name");
  if ((a.phone ?? "").replace(/\D/g, "").length < 10) out.push("phone");
  if (!a.date_of_birth) out.push("date_of_birth");
  else if (!isAdult(a.date_of_birth)) out.push("under_18");
  if (blank(a.work_authorized)) out.push("work_authorized");
  if (a.work_authorized === "Other" && blank(a.work_auth_explanation)) out.push("work_auth_explanation");
  if (blank(a.school_degree)) out.push("school_degree");
  if (blank(a.host_preference)) out.push("host_preference");
  if (a.preferred_cities.length === 0) out.push("preferred_cities");
  if (!a.move_in_date) out.push("move_in_date");
  if (a.services.length === 0) out.push("services");
  if (blank(a.why_joey)) out.push("why_joey");
  if (blank(a.heard_about)) out.push("heard_about");
  if (blank(a.conduct_signature)) out.push("conduct_signature");
  for (const k of missingReferenceKinds(referenceTypes)) out.push(k.key);
  if (blank(a.bg_disclosure_signature)) out.push("bg_disclosure_signature");
  if (blank(a.ca_disclosure_signature)) out.push("ca_disclosure_signature");
  return out;
}

export function sectionProgress(missing: string[]) {
  return SECTIONS.map((s) => ({ ...s, complete: !s.keys.some((k) => missing.includes(k)) }));
}

export function validateReference(r: ReferenceInput): string | null {
  if (blank(r.full_name)) return "Add their name.";
  if (!r.reference_type || !REFERENCE_TYPES.includes(r.reference_type)) return "Choose the type of reference.";
  if (blank(r.relationship)) return "Add how you know them.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) return "Add a valid email address.";
  if (r.phone.replace(/\D/g, "").length < 10) return "Add a phone number with area code.";
  if (blank(r.known_for)) return "Add how long you've known them.";
  return null;
}

/** Where Joeys write when they need to change a submitted answer. TODO: confirm the address. */
export const CONTACT_EMAIL = "hello@withjoey.com";
