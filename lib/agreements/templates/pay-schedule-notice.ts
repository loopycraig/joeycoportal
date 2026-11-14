// Written notice to the Joey that their pay schedule is changing. Issued by the portal when the
// Host changes the schedule; the Joey acknowledges it, nobody signs it.
// DRAFT WORDING written for the portal, not yet reviewed by legal. Bump `version` when it changes.

import type { Template } from "@/lib/agreements/types";

export const PAY_SCHEDULE_NOTICE: Template = {
  kind: "pay_schedule_notice",
  version: "pay-schedule-notice-2026-11-draft",
  title: "Notice of Change to Pay Schedule",
  parties: [],
  fields: [
    { key: "notice_date", label: "Notice date", type: "date", group: "Notice", required: true },
    { key: "joey_name", label: "Joey", type: "text", group: "Notice", required: true },
    { key: "host_name", label: "Host", type: "text", group: "Notice", required: true },
    { key: "old_schedule", label: "Current schedule", type: "text", group: "Notice", required: true },
    { key: "new_schedule", label: "New schedule", type: "text", group: "Notice", required: true },
    { key: "effective_date", label: "Starts", type: "date", group: "Notice", required: true },
    { key: "payday_rule", label: "Paydays", type: "text", group: "Notice", required: true },
  ],
  body: [
    { t: "title", text: "NOTICE OF CHANGE TO PAY SCHEDULE" },
    { t: "p", text: "{{notice_date}}" },
    { t: "p", text: "To {{joey_name}}, from {{host_name}}, your employer:" },
    {
      t: "p",
      text: "Starting with work on {{effective_date}}, you will be paid **{{new_schedule}}** instead of {{old_schedule}}. {{payday_rule}}",
    },
    {
      t: "p",
      text: "Hours worked before {{effective_date}} are paid on the current schedule. Your hourly rate, paid time off and the other terms of your Employment Offer Letter do not change. Section 2 of the Offer Letter allows your pay interval to change as permitted by law.",
    },
    {
      t: "p",
      text: "Please acknowledge that you received this notice. If you have questions, talk to your Host or contact JoeyCo.",
    },
  ],
};
