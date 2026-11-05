import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Email confirmation links (and later, Google sign-in) land here with a ?code=
// that we exchange for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only allow same-site relative redirects
  const nextParam = searchParams.get("next") ?? "/portal";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/portal";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`,
    );
  }

  const reason = searchParams.get("error_description") ?? "The sign-in link was missing a code.";
  return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(reason)}`);
}