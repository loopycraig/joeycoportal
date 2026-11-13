import type { Template } from "@/lib/agreements/types";
import { BODY } from "@/lib/agreements/templates/offer-letter.text";

export const OFFER_LETTER: Template = {
  kind: "offer_letter",
  version: "offer-letter-2026-11",
  title: "Employment Offer Letter",
  parties: ["joey", "host"],
  body: BODY,
  fields: [
    { key: "offer_date", label: "Offer date", type: "date", group: "The offer", required: true, prefill: "today" },
    { key: "joey_name", label: "Joey's full name", type: "text", group: "The offer", required: true, prefill: "joey_name" },
    { key: "start_date", label: "Start Date", type: "date", group: "The offer", required: true, prefill: "match_start" },
    {
      key: "accept_by",
      label: "Accept by",
      type: "date",
      group: "The offer",
      required: true,
      help: "The date the Joey should sign by.",
    },
    {
      key: "hourly_rate_cents",
      label: "Hourly rate",
      type: "money",
      group: "Pay and hours",
      required: true,
      prefill: "hourly_rate",
      help: "Becomes the match's hourly rate for payroll once both agreements are signed.",
    },
    { key: "weekly_min_hours", label: "Weekly minimum hours", type: "number", group: "Pay and hours", required: true },
    {
      key: "lodging_address",
      label: "Lodging address",
      type: "text",
      group: "Pay and hours",
      required: true,
      prefill: "host_address",
    },
    {
      key: "schedule",
      label: "Typical weekly schedule",
      type: "schedule",
      group: "Schedule (Exhibit A)",
      help: "Times like 9am. Leave a day blank if there's no work that day.",
    },
    { key: "pto_amount", label: "Paid time off", type: "number", group: "Time off", required: true },
    {
      key: "pto_unit",
      label: "Paid time off is counted in",
      type: "choice",
      group: "Time off",
      required: true,
      options: [
        { value: "days", label: "days" },
        { value: "hours", label: "hours" },
      ],
    },
    {
      key: "federal_holidays",
      label: "Federal holidays off as well",
      type: "flag",
      group: "Time off",
      flagText: " in addition to federal holidays",
    },
    { key: "other_terms", label: "Other terms", type: "longtext", group: "Other terms" },
  ],
};
