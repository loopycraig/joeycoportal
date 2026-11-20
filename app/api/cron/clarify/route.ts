import { createAdminClient } from "@/lib/supabase/admin";
import { pollStages, pushPending, pushPendingSignUps } from "@/lib/clarify/sync";
import { pollDeals } from "@/lib/clarify/deal-sync";
import { pollHostStages, pushPendingHostApplications } from "@/lib/clarify/host-sync";

// Safety net for the Clarify sync: retries failed pushes, catches up on stage changes, and creates
// portal matches for deals that reached Contracting without the webhook getting through.
// Joeys and Hosts also get a fresh stage whenever they open their journey, so this can run infrequently.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const signUps = await pushPendingSignUps(admin);
    const pushed = await pushPending(admin);
    const stages = await pollStages(admin);
    const hostsPushed = await pushPendingHostApplications(admin);
    const hostStages = await pollHostStages(admin);
    const deals = await pollDeals(admin);
    return Response.json({ signUps, pushed, stages, hostsPushed, hostStages, deals });
  } catch (e) {
    console.error("[clarify] cron failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
