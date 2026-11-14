import { createAdminClient } from "@/lib/supabase/admin";
import { processDuePayments } from "@/lib/payments/process-due";

// Runs daily (see vercel.json). Vercel sends CRON_SECRET as a Bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Create any monthly fee runs that are due (approved as they're created, so step 3 sends them)
  const { data: created, error } = await admin.rpc("generate_due_payment_runs");
  if (error) {
    console.error("[payments] generate failed", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // 2. Matches past their last day of work or move-out date (PTO payout, then closing the match)
  const { data: closed, error: endError } = await admin.rpc("finalize_match_ends");
  if (endError) console.error("[payments] finalizing match ends failed", endError);

  // 3. Send payments from runs JoeyCo has approved
  const processed = await processDuePayments(admin);

  return Response.json({ createdRuns: created ?? [], closedMatches: closed ?? 0, ...processed });
}
