import { Suspense } from "react";
import { requireRole } from "@/lib/profile";
import { hostHasMatch } from "@/lib/host/queries";
import { AppShell, ShellFallback } from "@/components/app-shell";

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <HostShell>{children}</HostShell>
    </Suspense>
  );
}

// Before a match, Hosts have one page: Getting Started (their application, then where things
// stand). The rest of the portal shows greyed out so they can see what unlocks.
async function HostShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("host");
  const matched = await hostHasMatch();

  const portal = [
    { href: "/host", label: "Home" },
    { href: "/host/agreements", label: "Agreements" },
    { href: "/host/timesheets", label: "Timecards" },
    { href: "/host/payments", label: "Payments" },
    { href: "/host/joeys", label: "Matches" },
  ];
  const nav = matched
    ? portal
    : [{ href: "/host/application", label: "Getting Started" }, ...portal.map((p) => ({ ...p, locked: true }))];

  return (
    <AppShell
      profile={profile}
      portalName="Host Portal"
      nav={nav}
      lockedNote={matched ? undefined : "Unlocks once you're matched with a Joey"}
    >
      {children}
    </AppShell>
  );
}
