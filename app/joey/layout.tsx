import { Suspense } from "react";
import { requireRole } from "@/lib/profile";
import { isMatched } from "@/lib/joey/queries";
import { AppShell, ShellFallback } from "@/components/app-shell";

export default function JoeyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <JoeyShell>{children}</JoeyShell>
    </Suspense>
  );
}

// Before a match, Joeys have one page (their application, with the journey across the top);
// the rest of the portal shows greyed out so they can see what unlocks. After a match,
// the full portal opens and the application moves into Settings.
async function JoeyShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("joey");
  const matched = await isMatched();

  const portal = [
    { href: "/joey", label: "Timecards" },
    { href: "/joey/hosts", label: "Hosts" },
    { href: "/joey/payments", label: "Payments" },
    { href: "/joey/settings/application", label: "Settings" },
  ];
  const nav = matched
    ? portal
    : [{ href: "/joey/application", label: "Application" }, ...portal.map((p) => ({ ...p, locked: true }))];

  return (
    <AppShell
      profile={profile}
      portalName="Joey Portal"
      nav={nav}
      lockedNote={matched ? undefined : "Unlocks once you're matched with a Host"}
    >
      {children}
    </AppShell>
  );
}
