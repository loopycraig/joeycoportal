// Where links in auth emails (confirm sign-up, set password) send people back to.
// Production sets NEXT_PUBLIC_SITE_URL to the portal's own domain, so an email always opens
// portal.withjoey.com even if someone signed up on another address (like the .vercel.app one).
// Elsewhere (local, Vercel previews) it falls back to the address the person is on.

/** The portal's base URL, with no trailing slash. `fallback` is the current origin. */
export function siteUrl(fallback: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured || fallback;
}
