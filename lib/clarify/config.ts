// Where portal data lands in Clarify. Matches api/joey-apply-tally.js, so portal and
// Tally applicants look the same to the team.

/** Fields on the Person record */
export const PERSON = {
  dateOfBirth: "date_of_birth",
  newsOptIn: "news_updates_opt_in",
} as const;

/** The custom Joey object, linked to the Person through joey_id */
export const JOEY = {
  object: "c_joey",
  personLink: "joey_id", // relationship field to the person

  name: "name",
  stage: "vetting_stage", // single select; Clarify owns this after the first push
  applicationStatus: "application_status",
  schoolDegree: "school_degree",
  motivation: "motivation",
  hostPreference: "host_preference",
  workAuthorization: "work_authorization",
  moveInTimeline: "move_in_timeline",
  applicationSource: "application_source",
  codeOfConductSigned: "code_of_conduct_signed",
  preferredTasks: "preferred_tasks", // multi-select
  preferredCities: "preferred_cities", // multi-select
} as const;

/**
 * Background check disclosure signatures, on the c_joey record. The push is commented out in
 * sync.ts for now; to turn it on, uncomment it there and set the field API names here
 * (null means "not sent", so a missing Clarify field can't fail the push).
 * TODO: create these fields on c_joey in Clarify and fill in their API names. Suggested:
 *   bgSignedAt      → "background_check_disclosure_signed_at"  (date/time)
 *   caSignedAt      → "ca_icr_disclosure_signed_at"            (date/time)
 *   caCopyRequested → "ca_icr_report_copy_requested"           (checkbox)
 */
export const DISCLOSURE_FIELDS: Record<"bgSignedAt" | "caSignedAt" | "caCopyRequested", string | null> = {
  bgSignedAt: null,
  caSignedAt: null,
  caCopyRequested: null,
};

/**
 * The References object. Each portal reference becomes one record, linked to the Joey's
 * c_joey record and to a Person record for the reference.
 * TODO: confirm the object and field API names in Clarify (Settings → Objects → References).
 */
export const REFERENCE = {
  object: "c_reference",
  joeyLink: "joey", // relationship to c_joey
  personLink: "person", // relationship to the reference's Person record

  name: "name",
  email: "email",
  phone: "phone",
  bio: "bio_of_the_reference", // "Manager at Bruin Café. Known for 2 years."
  // stage, type, notes and interview notes are left for the team
} as const;

/** Values written on the first push. Later pushes never touch the stage. */
export const INITIAL_VALUES = {
  stage: "Assignment",
  applicationStatus: "Complete",
} as const;
