import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears a session the auth server no longer recognises (signed out elsewhere, revoked, or
// expired), then goes to the login page. Server components can't clear cookies, so
// getProfile() sends people here. Without this, the proxy (which only checks the token's
// signature) and getProfile() (which asks the auth server) would bounce them between
// /auth/login and /portal forever.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // "local" only clears this browser's cookies; the session is usually already gone server-side.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/auth/login", request.url));
}
