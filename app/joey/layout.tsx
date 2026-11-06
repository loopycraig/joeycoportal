import { Suspense } from "react";
import { requireRole } from "@/lib/profile";
import { AppShell, ShellFallback } from "@/components/app-shell";

export default function JoeyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <JoeyShell>{children}</JoeyShell>
    </Suspense>
  );
}

async function JoeyShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("joey");

  return (
    <AppShell
      profile={profile}
      portalName="Joey portal"
      nav={[
        { href: "/joey", label: "Timecards" },
        { href: "/joey/payments", label: "Payments"},
        { href: "/joey/hosts", label: "Hosts" },
      ]}
    >
      {children}
    </AppShell>
  );
}
