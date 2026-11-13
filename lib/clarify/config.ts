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
 * Acknowledgement signatures (background check disclosures and Code of Conduct), on the
 * c_joey record (null means "not sent"). JOEY.codeOfConductSigned is sent as well.
 * Clarify custom fields have no date-time type, so the signed-at fields hold the Pacific
 * calendar date; the exact timestamp stays in joey_applications.*_signed_at.
 */
export const DISCLOSURE_FIELDS: Record<"bgSignedAt" | "caSignedAt" | "caCopyRequested" | "conductSignedAt", string | null> = {
  bgSignedAt: "background_check_disclosure_signed_at", // date
  caSignedAt: "ca_icr_disclosure_signed_at", // date
  caCopyRequested: "ca_icr_report_copy_requested", // boolean
  conductSignedAt: "code_of_conduct_signed_at", // date
};

/**
 * The References object. Each portal reference becomes one record, linked to the Joey's
 * c_joey record and to a Person record for the reference. Names checked against Clarify's schema.
 */
export const REFERENCE = {
  object: "c_reference",
  joeyLink: "joey_id", // relationship to c_joey
  personLink: "person_id", // relationship to the reference's Person record

  name: "name",
  type: "type", // single select: Professional, Institutional, Landlord, Housemate, Personal
  email: "email",
  phone: "phone",
  bio: "bio", // "Manager at Bruin Café. Known for 2 years."
  // stage, notes and interview notes are left for the team
} as const;

/** Values written on the first push. Later pushes never touch the stage. */
export const INITIAL_VALUES = {
  stage: "Assignment",
  applicationStatus: "Complete",
} as const;
