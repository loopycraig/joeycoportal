// Turn raw Supabase/Postgres messages into something a person can act on.
export function friendlyError(err: unknown, fallback = "Something went wrong. Try again."): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (!msg) return fallback;

  const rules: [RegExp, string][] = [
    [/row-level security|permission denied for table time_entries/i, "That change isn't allowed anymore. The match may have ended or the day was already submitted. Refresh and try again."],
    [/not awaiting review/i, "This was already reviewed or taken back. Refresh to see the latest."],
    [/Nothing to submit/i, "There's nothing left to submit. Refresh to see the latest."],
    [/already ended/i, "This match has already ended."],
    [/hours_check|check constraint.*hours/i, "Hours must be between 0.25 and 24."],
    [/Invalid login credentials/i, "That email and password don't match."],
    [/Email not confirmed/i, "Confirm your email first. Check your inbox for the link."],
    [/User already registered/i, "An account with this email already exists. Log in instead."],
    [/Email address not authorized/i, "We couldn't send email to that address yet. Please contact support."],
    [/rate limit/i, "Too many attempts. Wait a few minutes and try again."],
    [/JWT|session (missing|expired)|Auth session/i, "Your session expired. Log in again."],
    [/Failed to fetch|NetworkError|Load failed/i, "Couldn't reach the server. Check your connection and try again."],
  ];

  for (const [pattern, friendly] of rules) {
    if (pattern.test(msg)) return friendly;
  }
  return msg;
}
