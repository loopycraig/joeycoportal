import type { AgreementKind, Template } from "@/lib/agreements/types";
import { OFFER_LETTER } from "@/lib/agreements/templates/offer-letter";
import { HOUSING_LICENSE } from "@/lib/agreements/templates/housing-license";
import { HOST_SERVICES } from "@/lib/agreements/templates/host-services";
import { PAY_AMENDMENT } from "@/lib/agreements/templates/pay-amendment";
import { RENT_AMENDMENT } from "@/lib/agreements/templates/rent-amendment";
import { PAY_SCHEDULE_NOTICE } from "@/lib/agreements/templates/pay-schedule-notice";
import { TERMINATION_NOTICE } from "@/lib/agreements/templates/termination-notice";

export const TEMPLATES: Record<AgreementKind, Template> = {
  offer_letter: OFFER_LETTER,
  housing_license: HOUSING_LICENSE,
  host_services: HOST_SERVICES,
  pay_amendment: PAY_AMENDMENT,
  rent_amendment: RENT_AMENDMENT,
  pay_schedule_notice: PAY_SCHEDULE_NOTICE,
  termination_notice: TERMINATION_NOTICE,
};

/** What a Host can start for a Joey from New agreement. Amendments need the signed original first. */
export const JOEY_AGREEMENT_KINDS = ["offer_letter", "housing_license", "pay_amendment", "rent_amendment"] as const;

/** Amendments, and the signed agreement each one amends. */
export const AMENDS: Partial<Record<AgreementKind, AgreementKind>> = {
  pay_amendment: "offer_letter",
  rent_amendment: "housing_license",
};

/** Shown before anyone's first electronic signature. Versioned; stored with each consent. */
export const ESIGN_CONSENT = {
  version: "esign-2026-11",
  text: [
    "You agree to receive, review and sign agreements and related notices electronically in the JoeyCo portal, and that your typed name is your legal signature, with the same effect as signing on paper.",
    "Each signed agreement stays available to download from your Agreements page. You can ask for a paper copy at no cost, or withdraw this consent for future agreements, by emailing JoeyCo. Withdrawing doesn't affect agreements you've already signed.",
    "To sign electronically you need a current web browser and access to the email address on your account.",
  ],
} as const;
