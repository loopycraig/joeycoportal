// Amendment to the Employment Offer Letter: a new hourly rate from a set date.
// DRAFT WORDING written for the portal, not yet reviewed by legal. Have counsel review it, and
// bump `version` whenever the wording changes (the version is stored with every sent copy).

import type { Template } from "@/lib/agreements/types";

export const PAY_AMENDMENT: Template = {
  kind: "pay_amendment",
  version: "pay-amendment-2026-11-draft",
  title: "Amendment to Employment Offer Letter: Hourly Rate",
  parties: ["joey", "host"],
  fields: [
    { key: "amend_date", label: "Amendment date", type: "date", group: "The change", required: true, prefill: "today" },
    { key: "joey_name", label: "Joey's full name", type: "text", group: "The change", required: true, prefill: "joey_name" },
    { key: "host_name", label: "Your full name", type: "text", group: "The change", required: true, prefill: "host_name" },
    {
      key: "offer_date",
      label: "Date of the offer letter being amended",
      type: "date",
      group: "The change",
      required: true,
      prefill: "offer_date",
    },
    { key: "old_rate_cents", label: "Current hourly rate", type: "money", group: "Pay", required: true, prefill: "hourly_rate" },
    {
      key: "new_rate_cents",
      label: "New hourly rate",
      type: "money",
      group: "Pay",
      required: true,
      help: "Becomes the match's hourly rate from the start date once you've both signed.",
    },
    {
      key: "effective_date",
      label: "New rate starts on",
      type: "date",
      group: "Pay",
      required: true,
      help: "Today or later, and after any pay period already entered in payroll.",
    },
  ],
  body: [
    { t: "title", text: "AMENDMENT TO EMPLOYMENT OFFER LETTER" },
    { t: "sub", text: "Hourly Rate" },
    {
      t: "p",
      text: "This amendment is made on {{amend_date}} between {{host_name}} (the “__Host__”) and {{joey_name}} (“__you__”). It amends the Employment Offer Letter between you and the Host dated {{offer_date}} (the “__Agreement__”).",
    },
    {
      t: "p",
      n: "1.",
      text: "**Hourly Rate.** Beginning {{effective_date}}, your hourly rate under Section 2 (Hours & Hourly Rate) of the Agreement is {{new_rate_cents}} per hour, in place of {{old_rate_cents}} per hour. The new rate applies to hours worked on and after that date. Hours worked before that date are paid at the earlier rate.",
    },
    {
      t: "p",
      n: "2.",
      text: "**Everything Else Stays the Same.** All other terms of the Agreement continue unchanged. If this amendment and the Agreement conflict, this amendment controls.",
    },
    {
      t: "p",
      n: "3.",
      text: "**Signatures.** This amendment takes effect when both you and the Host have signed it. It may be signed electronically and in counterparts.",
    },
    { t: "signatures", parties: ["host", "joey"] },
  ],
};
