import { createAdminClient } from "@/lib/supabase/admin";
import { processDuePayments } from "@/lib/payments/process-due";

// Runs daily (see vercel.json). Vercel sends CRON_SECRET as a Bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Calculate any pay periods / months that are due (created as drafts for review)
  const { data: created, error } = await admin.rpc("generate_due_payment_runs");
  if (error) {
    console.error("[payments] generate failed", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // 2. Send payments from runs JoeyCo has approved
  const processed = await processDuePayments(admin);

  return Response.json({ createdRuns: created ?? [], ...processed });
}
