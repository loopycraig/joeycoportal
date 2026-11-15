import { createAdminClient } from "@/lib/supabase/admin";
import { syncDeal } from "@/lib/clarify/deal-sync";

// Called by a Clarify workflow when a deal's stage changes. At Contracting (or Matched) the portal
// creates the match, with placeholder accounts for anyone not signed up yet. The body only identifies
// the deal; everything else is read back from Clarify, so a forged request can't invent a match.
//
// POST /api/clarify/deal
// Authorization: Bearer <CLARIFY_WEBHOOK_SECRET>
// { "record_id": "<deal record id>" }
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
    const result = await syncDeal(createAdminClient(), recordId);
    return Response.json({ result });
  } catch (e) {
    console.error("[clarify] inbound deal failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
