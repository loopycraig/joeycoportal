"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clarifyConfigured } from "@/lib/clarify/client";
import { pushHostApplication } from "@/lib/clarify/host-sync";
import { HOST_EDITABLE_FIELDS, type HostApplicationDraft } from "@/lib/host/application";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/** Right after someone picks Host: makes their application, so it's waiting for them. */
export async function registerHostSignUp(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_my_host_application");
  if (error) console.error("couldn't create the host application at sign-up", error.message);
}

/** Autosave. Only whitelisted answer columns are written; RLS rejects edits after submission. */
export async function saveHostApplicationDraft(
  patch: Partial<HostApplicationDraft>,
): Promise<Result<{ savedAt: string }>> {
  const clean: Record<string, unknown> = {};
  for (const key of HOST_EDITABLE_FIELDS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (typeof v === "string") clean[key] = v.trim() === "" ? null : v;
    else clean[key] = v;
  }
  if (Object.keys(clean).length === 0) return { ok: true, savedAt: new Date().toISOString() };

  const supabase = await createClient();
  const uid = await currentUserId(supabase);
  const { data, error } = await supabase
    .from("host_applications")
    .update(clean)
    .eq("host_id", uid)
    .eq("status", "draft")
    .select("updated_at");
  if (error) return { ok: false, error: "We couldn't save that. Please check your internet connection and try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "You've already sent us your answers, so they can't be changed here." };
  }
  return { ok: true, savedAt: data[0].updated_at as string };
}

/** Submits, then sends it to Clarify right away. A failed push is retried later, so it never blocks the Host. */
export async function submitHostApplication(): Promise<Result | { ok: false; error: string; missing: string[] }> {
  const supabase = await createClient();
  const uid = await currentUserId(supabase);

  const { data: missing, error } = await supabase.rpc("submit_my_host_application");
  if (error) return { ok: false, error: "We couldn't send your answers. Please try again in a moment." };
  if (Array.isArray(missing) && missing.length > 0) {
    return { ok: false, error: "A few questions still need answers.", missing: missing as string[] };
  }

  if (clarifyConfigured()) {
    try {
      await pushHostApplication(createAdminClient(), uid);
    } catch (e) {
      console.error("[clarify] host push after submit failed", uid, e);
    }
  }
  revalidatePath("/host", "layout");
  return { ok: true };
}
