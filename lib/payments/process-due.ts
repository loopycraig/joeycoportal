import type { SupabaseClient } from "@supabase/supabase-js";
import { getProcessor } from "./processor";
import { todayIn } from "@/lib/money";

type DuePayment = {
  id: string;
  run_id: string;
  party_id: string;
  direction: "payout" | "charge";
  amount_cents: number;
  due_date: string;
};

/**
 * Sends every pending payment that's due and belongs to an approved run,
 * then marks runs as processed once none of their payments are outstanding.
 */
export async function processDuePayments(admin: SupabaseClient) {
  const processor = getProcessor();

  const { data: settings } = await admin.from("billing_settings").select("timezone").single();
  const today = todayIn(settings?.timezone ?? "America/Denver");

  const { data: due, error } = await admin
    .from("payments")
    .select("id, run_id, party_id, direction, amount_cents, due_date, payment_runs!inner(status)")
    .eq("status", "pending")
    .eq("payment_runs.status", "approved")
    .lte("due_date", today);
  if (error) throw error;

  const results = { sent: 0, failed: 0 };

  for (const p of (due ?? []) as unknown as DuePayment[]) {
    // Claim it first so two overlapping cron runs can't both send it
    const { data: claimed } = await admin
      .from("payments")
      .update({ status: "processing", processor: processor.name })
      .eq("id", p.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    const result = await processor
      .send({
        paymentId: p.id,
        partyId: p.party_id,
        direction: p.direction,
        amountCents: p.amount_cents,
        dueDate: p.due_date,
      })
      .catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));

    await admin
      .from("payments")
      .update(
        result.ok
          ? { status: "succeeded", processor_ref: result.reference, processed_at: new Date().toISOString() }
          : { status: "failed", failure_reason: result.reason },
      )
      .eq("id", p.id);

    if (result.ok) results.sent++;
    else results.failed++;
  }

  // Close out approved runs with nothing left pending or in flight
  const { data: runs } = await admin.from("payment_runs").select("id").eq("status", "approved");
  for (const run of runs ?? []) {
    const { count } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .in("status", ["pending", "processing", "failed"]);
    if (count === 0) {
      await admin
        .from("payment_runs")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", run.id);
    }
  }

  return results;
}
