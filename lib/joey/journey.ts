// The last three journey steps come from the portal, not Clarify: once a Host and Joey have a
// match here (Clarify deal at Contracting), signing the Housing License and Employment Offer moves
// the Joey from "Signing Agreements and Forms" to "Preparing for Move-In", and the move-in date
// moves them to "Moving In".
//
// Pairs who signed outside the portal have no agreements here. Unless their deal is still at
// Contracting, they're treated as moved in, so nobody already living with their Host is told to sign.
//
// Server only: reads with the signed-in Joey's session.

import type { createClient } from "@/lib/supabase/server";
import { todayPacific } from "@/lib/joey/application";
import type { StageEvent } from "@/lib/joey/queries";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Stages worked out here, in order. All are rows in application_stages. */
export const PORTAL_STAGES = ["signing", "move_in_prep", "matched"] as const;
export type PortalStage = (typeof PORTAL_STAGES)[number];

/** Both have to be signed by everyone before the Joey is preparing to move in. */
const MOVE_IN_AGREEMENTS = ["offer_letter", "housing_license"] as const;

type AgreementRow = {
  id: string;
  kind: (typeof MOVE_IN_AGREEMENTS)[number];
  status: string;
  current_version: number;
  executed_at: string | null;
};

/**
 * Where the Joey is after a portal match exists, with the dates each step was reached.
 * Null when they have no active match (Clarify's stage stands).
 */
export async function portalJourney(
  supabase: Supabase,
  joeyId: string,
): Promise<{ key: PortalStage; events: StageEvent[] } | null> {
  const { data: match, error } = await supabase
    .from("matches")
    .select("id, started_at, clarify_deal_stage")
    .eq("joey_id", joeyId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!match) return null;

  const events: StageEvent[] = [{ stage_key: "signing", occurred_at: match.started_at }];

  const { data: rows, error: agErr } = await supabase
    .from("agreements")
    .select("id, kind, status, current_version, executed_at")
    .eq("match_id", match.id)
    .in("kind", [...MOVE_IN_AGREEMENTS])
    .neq("status", "void");
  if (agErr) throw agErr;
  const agreements = (rows ?? []) as AgreementRow[];
  if (agreements.length === 0 && match.clarify_deal_stage !== "Contracting") {
    return { key: "matched", events: [{ stage_key: "matched", occurred_at: match.started_at }] };
  }

  const signed = MOVE_IN_AGREEMENTS.every((kind) => agreements.some((a) => a.kind === kind && a.status === "executed"));
  if (!signed) return { key: "signing", events };

  const signedAt = agreements
    .map((a) => a.executed_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  if (signedAt) events.push({ stage_key: "move_in_prep", occurred_at: signedAt });

  const moveIn = await moveInDate(supabase, agreements);
  if (!moveIn || moveIn > todayPacific()) return { key: "move_in_prep", events };

  events.push({ stage_key: "matched", occurred_at: `${moveIn}T12:00:00` });
  return { key: "matched", events };
}

/** The move-in date the Housing License sets (early move-in if agreed), else the job's start date. */
async function moveInDate(supabase: Supabase, agreements: AgreementRow[]): Promise<string | null> {
  const license = agreements.find((a) => a.kind === "housing_license" && a.status === "executed");
  const offer = agreements.find((a) => a.kind === "offer_letter" && a.status === "executed");
  const fieldsOf = async (a: AgreementRow | undefined) => {
    if (!a) return {} as Record<string, unknown>;
    const { data } = await supabase
      .from("agreement_versions")
      .select("fields")
      .eq("agreement_id", a.id)
      .eq("version", a.current_version)
      .maybeSingle();
    return (data?.fields ?? {}) as Record<string, unknown>;
  };
  const [lf, of] = await Promise.all([fieldsOf(license), fieldsOf(offer)]);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  if (lf.move_in_mode === "early" && date(lf.early_move_in_date)) return date(lf.early_move_in_date);
  return date(lf.term_start) ?? date(of.start_date);
}
