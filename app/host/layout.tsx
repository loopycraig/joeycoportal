import { Suspense } from "react";
import { requireRole } from "@/lib/profile";
import { AppShell, ShellFallback } from "@/components/app-shell";

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <HostShell>{children}</HostShell>
    </Suspense>
  );
}

async function HostShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("host");

  return (
    <AppShell
      profile={profile}
      portalName="Host Portal"
      nav={[
        { href: "/host", label: "Timesheets" },
        { href: "/host/payments", label: "Payments"},
        { href: "/host/joeys", label: "My Joeys" },
        { href: "/host/agreements", label: "Agreements" },
      ]}
    >
      {children}
    </AppShell>
  );
}
