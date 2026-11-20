import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { HOST_APPLICATION_SELECT, type HostApplication } from "@/lib/host/application";

export type HostStage = {
  key: string;
  sort_order: number;
  /** The journey step this stage belongs to; the journey bar shows steps. */
  step: string | null;
  title: string;
  host_message: string;
  owner_label: string;
  typical_duration: string | null;
  on_path: boolean;
};

export type HostStageEvent = { stage_key: string; occurred_at: string };

/**
 * Whether the signed-in Host has ever had a match (made from a Clarify deal at Contracting).
 * Hosts with one use the full portal; Hosts without one see their application. Deduped per request.
 */
export const hostHasMatch = cache(async (): Promise<boolean> => {
  const profile = await getProfile();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("host_id", profile.id);
  if (error) throw error;
  return (count ?? 0) > 0;
});

/** For the full-portal pages. Hosts without a match go to their application. */
export async function requireMatchedHost() {
  if (!(await hostHasMatch())) redirect("/host/application");
}

/** The Host's application (created on first visit), stages, and stage history. */
export const getHostApplicationBundle = cache(async () => {
  const supabase = await createClient();
  const { error: ensureError } = await supabase.rpc("ensure_my_host_application");
  if (ensureError) throw ensureError;

  const [app, stages, events] = await Promise.all([
    supabase.from("host_applications").select(HOST_APPLICATION_SELECT).single(),
    supabase.from("host_application_stages").select("*").order("sort_order"),
    supabase.from("host_application_stage_events").select("stage_key, occurred_at").order("occurred_at"),
  ]);
  for (const r of [app, stages, events]) if (r.error) throw r.error;

  const application = app.data as unknown as HostApplication;
  const stageList = (stages.data ?? []) as HostStage[];
  return {
    application,
    stages: stageList,
    events: (events.data ?? []) as HostStageEvent[],
    currentStage: stageList.find((s) => s.key === application.stage_key) ?? stageList[0],
  };
});
