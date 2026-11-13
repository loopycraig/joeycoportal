// Background check disclosures a Joey reads and signs in their application.
// The text is copied word for word from JoeyCo's legal documents. Don't edit it here
// without a new version from legal; bump `version` whenever the text changes, since
// the version is stored with each signature.

export type DisclosureId = "bg" | "ca";

type Block = { kind: "p"; text: string } | { kind: "item"; n: number; heading: string; text: string };

export type Disclosure = {
  id: DisclosureId;
  /** Short name for the form and summary. */
  name: string;
  /** The document's own title. */
  title: string[];
  version: string;
  body: Block[];
  authorization: string;
  /** The California disclosure lets the Joey ask for a free copy of the report. */
  copyOption?: string;
};

export const DISCLOSURES: Disclosure[] = [
  {
    id: "bg",
    name: "Background check disclosure and authorization",
    title: ["Disclosure Regarding Background Investigation"],
    version: "federal-2026-11",
    body: [
      {
        kind: "p",
        text: "JoeyCo, Inc. (“JoeyCo”) may obtain a consumer report about you for employment purposes. A consumer report is a report containing information about your character, general reputation, personal characteristics, and mode of living, and may include information about your criminal history and your driving record.",
      },
      {
        kind: "p",
        text: "JoeyCo may obtain a consumer report about you when you apply to participate in the JoeyCo program and at any time during your participation in the program.",
      },
      {
        kind: "p",
        text: "The report will be prepared by Private Eyes Screening Group, 9080 Double Diamond Parkway Unit C, Reno, NV 89521 or Checkr, Inc., 1 Montgomery Street, Suite 2400, San Francisco, CA 94104, https://checkr.com/.",
      },
    ],
    authorization:
      "I have read and understand the disclosure above. I authorize JoeyCo to obtain a consumer report about me for employment purposes, as described in that disclosure.",
  },
  {
    id: "ca",
    name: "California investigative consumer report disclosure and authorization",
    title: ["California Disclosure and Authorization", "Regarding Investigative Consumer Report"],
    version: "ca-icra-2026-11",
    body: [
      {
        kind: "p",
        text: "JoeyCo, Inc. (“JoeyCo”) may obtain an investigative consumer report about you. This disclosure is given to you under the California Investigative Consumer Reporting Agencies Act, Civil Code section 1786 and following.",
      },
      {
        kind: "item",
        n: 1,
        heading: "Purpose of the report.",
        text: "JoeyCo may obtain the report to evaluate you for participation in the JoeyCo program, including placement with a Host, and at any time during your participation in the program. JoeyCo will treat the report as obtained for employment purposes.",
      },
      {
        kind: "item",
        n: 2,
        heading: "Scope of the investigation.",
        text: "The report may contain information about your character, general reputation, personal characteristics, and mode of living. The specific information that may be requested includes: criminal conviction records in the counties, states and federal districts where you have lived or worked; identity and address history; motor vehicle records where driving is within the scope of the services you may provide; and verification of the employment, education and references you provide. The report will not include credit information.",
      },
      {
        kind: "item",
        n: 3,
        heading: "The agency preparing the report.",
        text: "The report will be prepared by Private Eyes Screening Group, 9080 Double Diamond Parkway Unit C, Reno, NV 89521 or Checkr, Inc. (“Checkr”), 1 Montgomery Street, Suite 2400, San Francisco, CA 94104. Checkr’s privacy practices with respect to the preparation and processing of investigative consumer reports are described at https://checkr.com/legal/privacy-policy.",
      },
      {
        kind: "item",
        n: 4,
        heading: "Your right to see your file.",
        text: "You have the right under Civil Code section 1786.22 to inspect the files Private Eyes Screening Group and/or Checkr maintains about you during normal business hours and on reasonable notice. You may do so in person, if you give proper identification and pay the costs of duplicating the file; by telephone, if you have made a written request and paid any applicable charges, with the telephone charges prepaid by or charged to you; or by asking for a copy to be sent to a specified addressee. Private Eyes Screening Group and/or Checkr must provide trained personnel to explain the file to you, and you may be accompanied by one other person of your choosing, who must give proper identification. That person may be required to provide reasonable written authorization from you permitting them to accompany you or to receive the information on your behalf.",
      },
      {
        kind: "item",
        n: 5,
        heading: "Your right to a free copy.",
        text: "You may receive a copy of any investigative consumer report obtained about you, at no charge, by checking the box below. If you check the box, a copy will be sent to you at the time the report is provided to JoeyCo, and in any event within three business days of the date the report is provided to JoeyCo.",
      },
    ],
    copyOption: "I want a free copy of any investigative consumer report obtained about me.",
    authorization:
      "I have read and understand this disclosure. I authorize JoeyCo to obtain an investigative consumer report about me as described above.",
  },
];
