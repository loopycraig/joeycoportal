import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { APPLICATION_SELECT, REFERENCE_SELECT, type Application, type Reference } from "@/lib/joey/application";
import { PORTAL_STAGES, portalJourney } from "@/lib/joey/journey";

export type Stage = {
  key: string;
  sort_order: number;
  /** The one-pager step this stage belongs to; the journey bar shows steps. */
  step: string | null;
  title: string;
  joey_message: string;
  owner: "joey" | "joeyco" | "references" | "vendor" | "host";
  owner_label: string;
  typical_duration: string | null;
  on_path: boolean;
  joey_can_edit_references: boolean;
};

export type StageEvent = { stage_key: string; occurred_at: string };

/** Whether the signed-in Joey has an active (not ended) match. Deduped per request. */
export const isMatched = cache(async (): Promise<boolean> => {
  const profile = await getProfile();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("joey_id", profile.id)
    .is("ended_at", null);
  if (error) throw error;
  return (count ?? 0) > 0;
});

/** Stages from which a Joey's Agreements page replaces their application (Clarify "Match Ready" and on). */
export const AGREEMENT_STAGES = ["approved", "matching", "background_check", ...PORTAL_STAGES] as string[];

/** Stages before move-in that a matched Joey still sees the journey for (on Home and Agreements). */
export const PRE_MOVE_IN_STAGES = ["signing", "move_in_prep"];

/** Agreements opens at Match Ready, or once matched. */
export const agreementsUnlocked = cache(async (): Promise<boolean> => {
  if (await isMatched()) return true;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("joey_applications")
    .select("status, stage_key")
    .eq("joey_id", profile.id)
    .maybeSingle();
  return data?.status === "submitted" && AGREEMENT_STAGES.includes(data.stage_key);
});

/** For pages that only make sense once a Joey has a Host (timesheet, payments, settings). */
export async function requireMatchedJoey() {
  if (!(await isMatched())) redirect("/joey/application");
}

/** For onboarding pages. Matched Joeys go to their normal home instead. */
export async function requireUnmatchedJoey(to = "/joey") {
  if (await isMatched()) redirect(to);
}

/** The Joey's application (created on first visit), references, stages, and stage history. */
export const getApplicationBundle = cache(async () => {
  const supabase = await createClient();

  const { error: ensureError } = await supabase.rpc("ensure_my_application");
  if (ensureError) throw ensureError;

  const profile = await getProfile();
  const [app, refs, stages, events, portal] = await Promise.all([
    supabase.from("joey_applications").select(APPLICATION_SELECT).single(),
    supabase
      .from("joey_references")
      .select(REFERENCE_SELECT)
      .order("created_at"),
    supabase.from("application_stages").select("*").order("sort_order"),
    supabase.from("application_stage_events").select("stage_key, occurred_at").order("occurred_at"),
    portalJourney(supabase, profile.id),
  ]);
  for (const r of [app, refs, stages, events]) if (r.error) throw r.error;

  const application = app.data as unknown as Application;
  const stageList = (stages.data ?? []) as Stage[];
  // With a portal match, the match and its agreements say where the Joey is, not Clarify.
  const stageKey = portal?.key ?? application.stage_key;
  const stageEvents = portal
    ? [...((events.data ?? []) as StageEvent[]).filter((e) => !(PORTAL_STAGES as readonly string[]).includes(e.stage_key)), ...portal.events]
        .sort((x, y) => x.occurred_at.localeCompare(y.occurred_at))
    : ((events.data ?? []) as StageEvent[]);
  return {
    application,
    references: (refs.data ?? []) as Reference[],
    stages: stageList,
    events: stageEvents,
    currentStage: stageList.find((s) => s.key === stageKey) ?? stageList[0],
  };
});
