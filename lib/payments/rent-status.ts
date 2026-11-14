// Rent payment types and how each status reads. Safe for client and server.

import type { PillTone } from "@/components/status-pill";

/** received; late (past the license's late-fee grace); overdue (past due); due (within a week); upcoming. */
export type RentStatus = "received" | "late" | "overdue" | "due" | "upcoming";

export type RentPayment = {
  key: string;
  matchId: string;
  /** The Joey (for a Host) or the Host (for a Joey). */
  otherName: string;
  /** First of the month, YYYY-MM-01. */
  month: string;
  dueOn: string;
  amountCents: number;
  receivedOn: string | null;
  /** When the license's 5% late fee starts to apply, and how much it is. Null with no signed license. */
  lateFrom: string | null;
  lateFeeCents: number | null;
  /** How the license says rent is paid. */
  paymentMethod: string | null;
  status: RentStatus;
};

/** How each status reads, for each side. Shared by Payments and Home. */
export const RENT_STATUS: Record<RentStatus, { tone: PillTone; host: string; joey: string }> = {
  received: { tone: "done", host: "Received", joey: "Paid" },
  late: { tone: "stopped", host: "Late, not received", joey: "Late, not paid yet" },
  overdue: { tone: "stopped", host: "Not received, past due", joey: "Not paid yet, past due" },
  due: { tone: "waiting", host: "Not received yet", joey: "Due soon" },
  upcoming: { tone: "neutral", host: "Upcoming", joey: "Upcoming" },
};

export const monthName = (month: string) =>
  new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
