import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { APPLICATION_SELECT, REFERENCE_SELECT, type Application, type Reference } from "@/lib/joey/application";

export type Stage = {
  key: string;
  sort_order: number;
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
export const AGREEMENT_STAGES = ["approved", "matched"];

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

/** For pages that only make sense once a Joey has a Host (timecards, payments, settings). */
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

  const [app, refs, stages, events] = await Promise.all([
    supabase.from("joey_applications").select(APPLICATION_SELECT).single(),
    supabase
      .from("joey_references")
      .select(REFERENCE_SELECT)
      .order("created_at"),
    supabase.from("application_stages").select("*").order("sort_order"),
    supabase.from("application_stage_events").select("stage_key, occurred_at").order("occurred_at"),
  ]);
  for (const r of [app, refs, stages, events]) if (r.error) throw r.error;

  const application = app.data as unknown as Application;
  const stageList = (stages.data ?? []) as Stage[];
  return {
    application,
    references: (refs.data ?? []) as Reference[],
    stages: stageList,
    events: (events.data ?? []) as StageEvent[],
    currentStage: stageList.find((s) => s.key === application.stage_key) ?? stageList[0],
  };
});
