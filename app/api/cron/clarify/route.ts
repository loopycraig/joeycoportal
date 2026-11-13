import { createAdminClient } from "@/lib/supabase/admin";
import { pollStages, pushPending } from "@/lib/clarify/sync";

// Safety net for the Clarify sync: retries failed pushes and catches up on stage changes.
// Joeys also get a fresh stage whenever they open their journey, so this can run infrequently.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const pushed = await pushPending(admin);
    const stages = await pollStages(admin);
    return Response.json({ pushed, stages });
  } catch (e) {
    console.error("[clarify] cron failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
