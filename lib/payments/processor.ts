
export type PaymentRequest = {
  paymentId: string;
  partyId: string;
  direction: "payout" | "charge";
  amountCents: number;
  dueDate: string;
};

export type PaymentResult =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

export interface PaymentProcessor {
  name: string;
  /** Send money to (payout) or collect money from (charge) one person. Must be idempotent on paymentId. */
  send(request: PaymentRequest): Promise<PaymentResult>;
}

/**
 * Stub: moves no money, just logs and reports success.
 * Replace with a real processor (e.g. Stripe Connect transfers for payouts and
 * PaymentIntents for charges) and return it from getProcessor().
 */
const stubProcessor: PaymentProcessor = {
  name: "stub",
  async send(request) {
    console.info(
      `[payments:stub] ${request.direction} ${request.amountCents}¢ for ${request.partyId} (payment ${request.paymentId})`,
    );
    return { ok: true, reference: `stub_${request.paymentId}` };
  },
};

export function getProcessor(): PaymentProcessor {
  return stubProcessor;
}
