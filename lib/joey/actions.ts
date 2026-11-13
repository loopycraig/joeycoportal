"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteReferenceRecord, pushApplication } from "@/lib/clarify/sync";
import { clarifyConfigured } from "@/lib/clarify/client";
import {
  EDITABLE_FIELDS,
  validateReference,
  type ApplicationDraft,
  type Reference,
  type ReferenceInput,
} from "@/lib/joey/application";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/** Autosave. Only whitelisted answer columns are written; RLS rejects edits after submission. */
export async function saveApplicationDraft(patch: Partial<ApplicationDraft>): Promise<Result<{ savedAt: string }>> {
  const clean: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (typeof v === "string") clean[key] = v.trim() === "" ? null : v;
    else clean[key] = v;
  }
  if (Object.keys(clean).length === 0) return { ok: true, savedAt: new Date().toISOString() };

  const supabase = await createClient();
  const uid = await currentUserId(supabase);
  const { data, error } = await supabase
    .from("joey_applications")
    .update(clean)
    .eq("joey_id", uid)
    .eq("status", "draft")
    .select("updated_at");
  if (error) return { ok: false, error: "Couldn't save your changes. Check your connection and try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Your application has already been submitted, so answers can't be changed here." };
  }
  return { ok: true, savedAt: data[0].updated_at as string };
}

const REF_SELECT = "id, full_name, relationship, email, phone, known_for";

function cleanReference(r: ReferenceInput): ReferenceInput {
  return {
    full_name: r.full_name.trim(),
    relationship: r.relationship.trim(),
    email: r.email.trim().toLowerCase(),
    phone: r.phone.trim(),
    known_for: r.known_for.trim(),
  };
}

const LOCKED_REFS =
  "References are locked now that we've started contacting them. Email us if something needs to change.";

export async function addReference(input: ReferenceInput): Promise<Result<{ reference: Reference }>> {
  const r = cleanReference(input);
  const invalid = validateReference(r);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const uid = await currentUserId(supabase);
  const { data, error } = await supabase
    .from("joey_references")
    .insert({ ...r, joey_id: uid })
    .select(REF_SELECT)
    .single();
  if (error) {
    if (error.message.includes("up to 5")) return { ok: false, error: "You can list up to 5 references." };
    if (error.code === "42501") return { ok: false, error: LOCKED_REFS };
    return { ok: false, error: "Couldn't add that reference. Check the details and try again." };
  }
  await afterReferenceChange(uid);
  return { ok: true, reference: data as Reference };
}

export async function updateReference(id: string, input: ReferenceInput): Promise<Result<{ reference: Reference }>> {
  const r = cleanReference(input);
  const invalid = validateReference(r);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const uid = await currentUserId(supabase);
  const { data, error } = await supabase.from("joey_references").update(r).eq("id", id).select(REF_SELECT);
  if (error) return { ok: false, error: "Couldn't save that reference. Check the details and try again." };
  if (!data || data.length === 0) return { ok: false, error: LOCKED_REFS };
  await afterReferenceChange(uid);
  return { ok: true, reference: data[0] as Reference };
}

export async function removeReference(id: string): Promise<Result> {
  const supabase = await createClient();
  const uid = await currentUserId(supabase);
  const { data, error } = await supabase
    .from("joey_references")
    .delete()
    .eq("id", id)
    .select("id, clarify_reference_id");
  if (error) return { ok: false, error: "Couldn't remove that reference. Try again." };
  if (!data || data.length === 0) return { ok: false, error: LOCKED_REFS };
  if (data[0].clarify_reference_id) await deleteReferenceRecord(data[0].clarify_reference_id);
  await afterReferenceChange(uid);
  return { ok: true };
}

/** Submits, then pushes to Clarify right away. A failed push is retried later, so it never blocks the Joey. */
export async function submitApplication(): Promise<Result | { ok: false; error: string; missing: string[] }> {
  const supabase = await createClient();
  const uid = await currentUserId(supabase);

  // The disclosure signatures are checked here as well as in SQL, until
  // public.application_missing() includes them (see the migration's TODO).
  const { data: app, error: appError } = await supabase
    .from("joey_applications")
    .select("bg_disclosure_signature, ca_disclosure_signature")
    .eq("joey_id", uid)
    .single();
  if (appError) return { ok: false, error: "Couldn't submit your application. Try again in a moment." };
  const unsigned = (["bg_disclosure_signature", "ca_disclosure_signature"] as const).filter(
    (k) => !app[k]?.trim(),
  );
  if (unsigned.length > 0) {
    return { ok: false, error: "Please read and sign both background check disclosures.", missing: unsigned };
  }

  const { data: missing, error } = await supabase.rpc("submit_my_application");
  if (error) return { ok: false, error: "Couldn't submit your application. Try again in a moment." };
  if (Array.isArray(missing) && missing.length > 0) {
    return { ok: false, error: "A few things still need answers.", missing: missing as string[] };
  }

  await pushToClarify(uid);
  revalidatePath("/joey", "layout");
  return { ok: true };
}

// Edits to references after submission go to Clarify too.
async function afterReferenceChange(uid: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("joey_applications").select("status").eq("joey_id", uid).single();
  if (data?.status === "submitted") await pushToClarify(uid);
}

// The application is already saved in Supabase, so Clarify being unconfigured or down never fails the Joey's action.
// Anything that doesn't reach Clarify now is retried by the cron.
async function pushToClarify(uid: string) {
  if (!clarifyConfigured()) return;
  try {
    await pushApplication(createAdminClient(), uid);
  } catch (e) {
    console.error("[clarify] push after action failed", uid, e);
  }
}
