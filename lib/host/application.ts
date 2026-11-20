// The Host application: the "Is Hosting a Joey right for me?" Tally form, asked one question at a
// time in the portal. Shared by server and client code. Mirrors public.host_application_missing()
// in SQL, which stays the authority on submit.
//
// Stored values match the c_host fields in Clarify exactly (type_of_help_needed, childcare_needs,
// weekly_hours_needed, amenities), or Clarify rejects them.

export type HostApplication = {
  host_id: string;
  full_name: string | null;
  zip_code: string | null;
  phone: string | null;
  help_types: string[];
  childcare_need: string | null;
  medical_needs: string | null;
  help_details: string | null;
  weekly_hours: string | null;
  amenities: string[];
  status: "draft" | "submitted";
  submitted_at: string | null;
  stage_key: string;
  stage_changed_at: string;
};

/** The columns a Host can write while their application is a draft. */
export const HOST_EDITABLE_FIELDS = [
  "full_name",
  "zip_code",
  "phone",
  "help_types",
  "childcare_need",
  "medical_needs",
  "help_details",
  "weekly_hours",
  "amenities",
] as const;

export type HostEditableField = (typeof HOST_EDITABLE_FIELDS)[number];
export type HostApplicationDraft = Pick<HostApplication, HostEditableField>;

export const HOST_APPLICATION_SELECT = `host_id, ${HOST_EDITABLE_FIELDS.join(", ")}, status, submitted_at, stage_key, stage_changed_at`;

// ─────────────────────────────────────────────
// Answer choices (from the Tally form)
// ─────────────────────────────────────────────

export const CHILDCARE = "Childcare";
export const MEDICAL = "Medical care/assistance";
export const OTHER = "Other";

/** c_host.type_of_help_needed */
export const HELP_OPTIONS = ["Household tasks", "Driving", "Running errands", "Pet care", CHILDCARE, MEDICAL, OTHER];

/** c_host.childcare_needs. The first reads differently on the form, as it did in Tally. */
export const CHILDCARE_OPTIONS = ["Pickups, drop-offs, date nights", "Part-time", "Full-time"];
export const CHILDCARE_LABELS: Record<string, string> = {
  "Pickups, drop-offs, date nights": "Filling in the gaps (pickups, drop-offs, date nights)",
};

/** c_host.weekly_hours_needed */
export const LESS_THAN_5 = "Less than 5 hours";
export const HOURS_OPTIONS = [LESS_THAN_5, "5–10 hours", "10–15 hours", "15+ hours"];

/** c_host.amenities. A Joey needs all four. */
export const AMENITY_OPTIONS = ["Private bedroom", "Bathroom access", "Kitchen access", "WiFi"];

export const SCOPE_OF_SERVICE_URL = "https://www.withjoey.com/scope-of-service";
export const CALENDLY_URL = "https://calendly.com/withjoeyco";
export const HOST_CONTACT_PHONE = "(415) 349-3999";

// ─────────────────────────────────────────────
// Steps: one screen each
// ─────────────────────────────────────────────

export type HostStepId = "you" | "help" | "details" | "hours" | "home" | "review";

export const HOST_STEPS: { id: HostStepId; title: string; keys: string[] }[] = [
  { id: "you", title: "About you", keys: ["full_name", "phone", "zip_code"] },
  { id: "help", title: "Help you need", keys: ["help_types"] },
  { id: "details", title: "A bit more", keys: ["childcare_need", "medical_needs", "help_details"] },
  { id: "hours", title: "Hours", keys: ["weekly_hours"] },
  { id: "home", title: "Your home", keys: [] },
  { id: "review", title: "Review", keys: [] },
];

/** The steps this Host sees: "A bit more" only when they chose childcare, medical help, or other. */
export function hostStepsFor(helpTypes: string[]) {
  const needsDetails = [CHILDCARE, MEDICAL, OTHER].some((h) => helpTypes.includes(h));
  return HOST_STEPS.filter((s) => s.id !== "details" || needsDetails);
}

export const HOST_MISSING_LABELS: Record<string, string> = {
  full_name: "Please add your name.",
  zip_code: "Please add your 5-digit zip code.",
  phone: "Please add a phone number, including the area code.",
  help_types: "Please choose at least one.",
  childcare_need: "Please choose how much childcare you need.",
  medical_needs: "Please tell us what kind of medical help you're looking for.",
  help_details: "Please tell us a little about the help you need.",
  weekly_hours: "Please choose one.",
};

const blank = (v: string | null | undefined) => !v || v.trim() === "";

/** Same keys and order as public.host_application_missing(). */
export function hostMissingFields(a: HostApplicationDraft): string[] {
  const out: string[] = [];
  if (blank(a.full_name)) out.push("full_name");
  if (!/^\d{5}$/.test(a.zip_code ?? "")) out.push("zip_code");
  if ((a.phone ?? "").replace(/\D/g, "").length < 10) out.push("phone");
  if (a.help_types.length === 0) out.push("help_types");
  if (a.help_types.includes(CHILDCARE) && blank(a.childcare_need)) out.push("childcare_need");
  if (a.help_types.includes(MEDICAL) && blank(a.medical_needs)) out.push("medical_needs");
  if (a.help_types.includes(OTHER) && blank(a.help_details)) out.push("help_details");
  if (blank(a.weekly_hours)) out.push("weekly_hours");
  return out;
}

/** Whether the home has everything a Joey needs. */
export function homeIsReady(amenities: string[]) {
  return AMENITY_OPTIONS.every((a) => amenities.includes(a));
}

/** Where Hosts write when they need to change a submitted answer. Same inbox as the Joeys'. */
export { CONTACT_EMAIL } from "@/lib/joey/application";
