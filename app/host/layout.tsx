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
      portalName="Host portal"
      nav={[
        { href: "/host", label: "Review" },
        { href: "/host/payments", label: "Payments"},
        { href: "/host/joeys", label: "Joeys" },
      ]}
    >
      {children}
    </AppShell>
  );
}
