import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/roles";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role | null;
};

// The signed-in user's profile. Sends them to log in if there's no session.
// cache() means layouts and pages share one lookup per request.
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No valid session. /auth/signout clears any stale cookies first, so the proxy doesn't send
  // them straight back here from the login page.
  if (!user) redirect("/auth/signout");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect(`/auth/error?error=${encodeURIComponent("Your profile couldn't be loaded.")}`);
  }
  return profile as Profile;
});

// Use in a portal layout: anyone without this role is sent to their own home.
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getProfile();
  if (profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}
