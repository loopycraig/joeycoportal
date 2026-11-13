import { createAdminClient } from "@/lib/supabase/admin";
import { refreshStageForJoeyRecord } from "@/lib/clarify/sync";

// Called by a Clarify workflow when a Joey's vetting_stage changes, for near-instant updates.
// The body only identifies the c_joey record; the stage itself is read back from Clarify,
// so a forged request can't set a stage.
//
// POST /api/clarify/stage
// Authorization: Bearer <CLARIFY_WEBHOOK_SECRET>
// { "record_id": "<c_joey record id>" }
export async function POST(request: Request) {
  const secret = process.env.CLARIFY_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let recordId: unknown;
  try {
    const body = (await request.json()) as { record_id?: unknown; id?: unknown };
    recordId = body.record_id ?? body.id;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (typeof recordId !== "string" || recordId.length === 0) {
    return Response.json({ error: "record_id is required" }, { status: 400 });
  }

  try {
    const result = await refreshStageForJoeyRecord(createAdminClient(), recordId);
    return Response.json({ result });
  } catch (e) {
    console.error("[clarify] inbound stage failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
