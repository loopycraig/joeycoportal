import { Suspense } from "react";
import { requireRole } from "@/lib/profile";
import { agreementsUnlocked, isMatched } from "@/lib/joey/queries";
import { AppShell, ShellFallback } from "@/components/app-shell";

export default function JoeyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <JoeyShell>{children}</JoeyShell>
    </Suspense>
  );
}

// Before a match, Joeys have one page: their application (with the journey across the top), which
// becomes Agreements at Match Ready. The rest of the portal shows greyed out so they can see what
// unlocks. After a match the full portal opens; the application lives in Agreements.
async function JoeyShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("joey");
  const [matched, unlocked] = await Promise.all([isMatched(), agreementsUnlocked()]);

  const portal = [
    { href: "/joey", label: "Timesheets" },
    { href: "/joey/payments", label: "Payments" },
    { href: "/joey/hosts", label: "My Host" },
  ];
  const agreements = { href: "/joey/agreements", label: "Agreements" };
  const nav = matched
    ? [...portal, agreements]
    : [
        unlocked ? agreements : { href: "/joey/application", label: "Application" },
        ...portal.map((p) => ({ ...p, locked: true })),
      ];

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
