import type { FieldDef, Template } from "@/lib/agreements/types";
import { BODY } from "@/lib/agreements/templates/housing-license.text";

const yes = { value: "yes", label: "Furnished" };
const no = { value: "no", label: "Not furnished" };

const RULES: [key: string, label: string][] = [
  ["smoking", "Smoking, alcohol and drugs"],
  ["parking", "Parking"],
  ["guests", "Overnight guests"],
  ["noise", "Noise and quiet hours"],
  ["pets", "Pets"],
  ["other", "Other house rules"],
];

const UTILITIES: [key: string, label: string][] = [
  ["gas", "Gas, oil or propane"],
  ["water", "Water and sewer"],
  ["electric", "Electricity"],
  ["trash", "Garbage and trash removal"],
  ["cable", "Cable TV"],
  ["internet", "Internet"],
  ["other", "Other utility"],
];

const ruleFields: FieldDef[] = RULES.flatMap(([k, label]) => [
  { key: `rule_${k}`, label, type: "flag", group: "House rules" },
  {
    key: `rule_${k}_detail`,
    label: `${label}: the rule`,
    type: "text",
    group: "House rules",
    required: true,
    when: `rule_${k}`,
  },
]);

const utilityFields: FieldDef[] = UTILITIES.flatMap(([k, label]): FieldDef[] => [
  { key: `util_${k}`, label, type: "flag", group: "Utilities and services" },
  ...(k === "other"
    ? [{ key: "util_other_name", label: "Which utility", type: "text", group: "Utilities and services", required: true, when: "util_other" } as FieldDef]
    : []),
  {
    key: `util_${k}_mode`,
    label: `${label}: how it's paid`,
    type: "choice",
    group: "Utilities and services",
    required: true,
    when: `util_${k}`,
    options: [
      { value: "shared", label: "Shared equally" },
      { value: "included", label: "Included in rent" },
      { value: "custom", label: "Other arrangement" },
    ],
  },
  {
    key: `util_${k}_custom`,
    label: `${label}: the arrangement`,
    type: "text",
    group: "Utilities and services",
    required: true,
    when: `util_${k}_mode=custom`,
  },
]);

export const HOUSING_LICENSE: Template = {
  kind: "housing_license",
  version: "housing-license-ca-2026-11",
  title: "Joey Housing License Agreement",
  parties: ["joey", "host"],
  body: BODY,
  fields: [
    { key: "made_date", label: "Agreement date", type: "date", group: "Parties", required: true, prefill: "today" },
    { key: "joey_name", label: "Joey's full name", type: "text", group: "Parties", required: true, prefill: "joey_name" },
    { key: "host_name", label: "Your full name", type: "text", group: "Parties", required: true, prefill: "host_name" },

    { key: "premises_address", label: "Address", type: "text", group: "Premises", required: true, prefill: "host_address" },
    { key: "bedrooms", label: "Bedrooms", type: "text", group: "Premises", required: true, help: "For example, 1 private bedroom" },
    { key: "bathrooms", label: "Bathrooms", type: "text", group: "Premises", required: true, help: "For example, 1 shared bathroom" },
    { key: "common_areas", label: "Common areas", type: "text", group: "Premises", required: true },
    { key: "private_areas", label: "Private areas", type: "text", group: "Premises", required: true },
    { key: "furnished", label: "Furnishing", type: "choice", group: "Premises", required: true, options: [yes, no] },
    { key: "furnished_items", label: "Furnished with", type: "longtext", group: "Premises", required: true, when: "furnished=yes" },

    {
      key: "term_mode",
      label: "Term",
      type: "choice",
      group: "Term",
      required: true,
      options: [
        { value: "fixed", label: "Fixed term" },
        { value: "monthly", label: "Month-to-month" },
      ],
    },
    { key: "term_start", label: "Starts", type: "date", group: "Term", required: true, prefill: "match_start" },
    { key: "term_end", label: "Ends", type: "date", group: "Term", required: true, when: "term_mode=fixed" },

    {
      key: "rent_mode",
      label: "Rent",
      type: "choice",
      group: "Rent and payment",
      required: true,
      options: [
        { value: "amount", label: "A monthly amount" },
        { value: "other", label: "Other arrangement" },
      ],
    },
    {
      key: "rent_cents",
      label: "Monthly rent",
      type: "money",
      group: "Rent and payment",
      required: true,
      when: "rent_mode=amount",
      prefill: "monthly_rent",
      help: "Becomes the match's rent for payroll once both agreements are signed.",
    },
    {
      key: "rent_due_day",
      label: "Due on day of the month",
      type: "number",
      group: "Rent and payment",
      required: true,
      when: "rent_mode=amount",
      help: "For example, 1 for the 1st.",
    },
    { key: "rent_other", label: "The rent arrangement", type: "text", group: "Rent and payment", required: true, when: "rent_mode=other" },
    {
      key: "payment_method",
      label: "How rent is paid",
      type: "text",
      group: "Rent and payment",
      required: true,
      help: "For example, deducted from pay through JoeyCo, or Zelle.",
    },
    { key: "late_days", label: "Late fee applies after this many days", type: "number", group: "Rent and payment", required: true },
    {
      key: "first_rent",
      label: "First month's rent is paid on",
      type: "choice",
      group: "Rent and payment",
      required: true,
      options: [
        { value: "execution", label: "Signing this agreement" },
        { value: "term_start", label: "The first day of the term" },
      ],
    },

    {
      key: "deposit_mode",
      label: "Security deposit",
      type: "choice",
      group: "Deposit and move-in",
      required: true,
      options: [
        { value: "none", label: "Not required" },
        { value: "one_month", label: "One month's rent" },
        { value: "other", label: "Other amount" },
      ],
    },
    { key: "deposit_other", label: "Deposit amount", type: "text", group: "Deposit and move-in", required: true, when: "deposit_mode=other" },
    {
      key: "move_in_mode",
      label: "Move-in",
      type: "choice",
      group: "Deposit and move-in",
      required: true,
      options: [
        { value: "start", label: "On the start date" },
        { value: "early", label: "Before the start date" },
      ],
    },
    { key: "early_move_in_date", label: "Early move-in date", type: "date", group: "Deposit and move-in", required: true, when: "move_in_mode=early" },
    { key: "early_move_in_cents", label: "Early move-in charge", type: "money", group: "Deposit and move-in", required: true, when: "move_in_mode=early" },

    ...ruleFields,

    { key: "cleaning_areas", label: "Areas the Joey cleans", type: "text", group: "Cleaning and supplies", required: true },
    {
      key: "cleaning_mode",
      label: "Cleaning schedule",
      type: "choice",
      group: "Cleaning and supplies",
      required: true,
      options: [
        { value: "own", label: "On their own, no set schedule" },
        { value: "schedule", label: "A set schedule" },
      ],
    },
    { key: "cleaning_schedule", label: "The schedule", type: "longtext", group: "Cleaning and supplies", required: true, when: "cleaning_mode=schedule" },
    {
      key: "supplies_mode",
      label: "Household supplies",
      type: "choice",
      group: "Cleaning and supplies",
      required: true,
      options: [
        { value: "host", label: "The Host buys and restocks" },
        { value: "ledger", label: "The Joey buys them and deducts from rent (with a ledger)" },
        { value: "other", label: "Other arrangement" },
      ],
    },
    { key: "supplies_other", label: "The arrangement", type: "text", group: "Cleaning and supplies", required: true, when: "supplies_mode=other" },

    ...utilityFields,

    { key: "additional_terms", label: "Additional terms and conditions", type: "longtext", group: "Additional terms" },
  ],
};
