"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Someone signed up with an email that already has a placeholder account (made from a Clarify Match
 * before they joined). Sends them a link to set their password; signing in with it claims the account,
 * with their match already there. Returns false when the email isn't a placeholder.
 */
export async function claimPlaceholder(email: string): Promise<boolean> {
  const address = email.trim();
  if (!address) return false;

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .ilike("email", address.replace(/[\\%_]/g, (c) => `\\${c}`))
    .eq("is_placeholder", true)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) return false;

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { error: sendErr } = await (await createClient()).auth.resetPasswordForEmail(address, {
    redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
  });
  if (sendErr) throw new Error(sendErr.message);
  return true;
}
