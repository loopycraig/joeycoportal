// Amendment to the Joey Housing License Agreement: a new monthly rent from a set date.
// DRAFT WORDING written for the portal, not yet reviewed by legal. Have counsel review it
// (including any notice period required for rent increases), and bump `version` when it changes.

import type { Template } from "@/lib/agreements/types";

export const RENT_AMENDMENT: Template = {
  kind: "rent_amendment",
  version: "rent-amendment-2026-11-draft",
  title: "Amendment to Housing License Agreement: Rent",
  parties: ["joey", "host"],
  fields: [
    { key: "amend_date", label: "Amendment date", type: "date", group: "The change", required: true, prefill: "today" },
    { key: "joey_name", label: "Joey's full name", type: "text", group: "The change", required: true, prefill: "joey_name" },
    { key: "host_name", label: "Your full name", type: "text", group: "The change", required: true, prefill: "host_name" },
    {
      key: "license_date",
      label: "Date of the housing license being amended",
      type: "date",
      group: "The change",
      required: true,
      prefill: "license_date",
    },
    { key: "old_rent_cents", label: "Current monthly rent", type: "money", group: "Rent", required: true, prefill: "monthly_rent" },
    {
      key: "new_rent_cents",
      label: "New monthly rent",
      type: "money",
      group: "Rent",
      required: true,
      help: "Becomes the match's rent from the start date once you've both signed.",
    },
    {
      key: "effective_date",
      label: "New rent starts on",
      type: "date",
      group: "Rent",
      required: true,
      help: "Today or later. Check how much notice a rent increase needs before choosing the date.",
    },
  ],
  body: [
    { t: "title", text: "AMENDMENT TO JOEY HOUSING LICENSE AGREEMENT" },
    { t: "sub", text: "Rent" },
    {
      t: "p",
      text: "This amendment is made on {{amend_date}} between {{host_name}} (the “__Host__”) and {{joey_name}} (the “__Joey__”). It amends the Joey Housing License Agreement between them dated {{license_date}} (the “__License__”).",
    },
    {
      t: "p",
      n: "1.",
      text: "**Rent.** Beginning {{effective_date}}, the monthly rent under the License is {{new_rent_cents}}, in place of {{old_rent_cents}}. Rent for a month that the change falls in is prorated by day between the two amounts.",
    },
    {
      t: "p",
      n: "2.",
      text: "**Everything Else Stays the Same.** All other terms of the License continue unchanged, including that the housing is provided for the convenience of the employer and does not create a tenancy. If this amendment and the License conflict, this amendment controls.",
    },
    {
      t: "p",
      n: "3.",
      text: "**Signatures.** This amendment takes effect when both the Joey and the Host have signed it. It may be signed electronically and in counterparts.",
    },
    { t: "signatures", parties: ["host", "joey"] },
  ],
};
