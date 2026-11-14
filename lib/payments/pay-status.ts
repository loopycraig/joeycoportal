// Pay period statuses and how they read. Safe for client and server.

export type PayStatus = "paid" | "overdue" | "due" | "needs_approval" | "changes_requested";

/** How each status reads, for each side. Shared by Payments and Home. */
export const PAY_STATUS: Record<PayStatus, { dot: string; host: string; joey: string }> = {
  paid: { dot: "bg-emerald-500", host: "Paid", joey: "Paid" },
  overdue: { dot: "bg-red-500", host: "Not paid, overdue", joey: "Not paid yet, past due" },
  due: { dot: "bg-amber-400", host: "Not paid yet", joey: "Not paid yet" },
  needs_approval: { dot: "bg-amber-400", host: "Needs your approval", joey: "Waiting for your Host to approve" },
  changes_requested: { dot: "bg-red-500", host: "Waiting on your Joey", joey: "Your Host asked for changes" },
};
