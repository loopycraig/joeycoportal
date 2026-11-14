// Written notice that employment is ending and the housing license with it. Issued by the portal
// when the Host ends a match; the Joey acknowledges it, nobody signs it.
// DRAFT WORDING written for the portal, not yet reviewed by legal. Have counsel review it (final pay
// timing and the housing notice in particular), and bump `version` when it changes.

import type { Template } from "@/lib/agreements/types";

export const TERMINATION_NOTICE: Template = {
  kind: "termination_notice",
  version: "termination-notice-2026-11-draft",
  title: "Notice of End of Employment and Housing",
  parties: [],
  fields: [
    { key: "notice_date", label: "Notice date", type: "date", group: "Notice", required: true },
    { key: "joey_name", label: "Joey", type: "text", group: "Notice", required: true },
    { key: "host_name", label: "Host", type: "text", group: "Notice", required: true },
    { key: "address", label: "Address", type: "text", group: "Notice", required: true },
    { key: "last_day", label: "Last day of work", type: "date", group: "Notice", required: true },
    { key: "move_out", label: "Move out by", type: "date", group: "Notice", required: true },
    { key: "pto_hours", label: "Unused PTO", type: "text", group: "Notice", required: true },
    { key: "message", label: "Message", type: "longtext", group: "Notice" },
  ],
  body: [
    { t: "title", text: "NOTICE OF END OF EMPLOYMENT AND HOUSING" },
    { t: "p", text: "{{notice_date}}" },
    { t: "p", text: "To {{joey_name}}, from {{host_name}}, your employer and Host:" },
    {
      t: "p",
      n: "1.",
      text: "**Employment.** Your employment with me ends after your last day of work, **{{last_day}}**, under Section 4 (At-Will Employment) of your Employment Offer Letter.",
    },
    {
      t: "p",
      n: "2.",
      text: "**Final Pay.** Your final pay, including all hours worked through {{last_day}} and your unused paid time off ({{pto_hours}} as of this notice), is due as required by law when your employment ends. Submit any remaining hours in the JoeyCo portal right away.",
    },
    {
      t: "p",
      n: "3.",
      text: "**Housing.** This is written notice under Section 4 of your Offer Letter and Section II of your Joey Housing License Agreement that your license to occupy the housing at {{address}} ends. Please move out and return all keys by **{{move_out}}**. Rent continues as agreed until then.",
    },
    { t: "p", text: "**Note from {{host_name}}:**" },
    { t: "box", field: "message" },
    {
      t: "p",
      text: "Please acknowledge that you received this notice. If you have questions, contact JoeyCo.",
    },
  ],
};
