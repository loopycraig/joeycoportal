import Link from "next/link";
import type { Profile } from "@/lib/profile";
import { SidebarNav, SidebarLogout, type NavItem } from "@/components/sidebar-nav";
export { PageHeader, EmptyState, SectionHeader } from "@/components/page-parts";

export function AppShell({
  profile,
  portalName,
  nav,
  children,
}: {
  profile: Profile;
  portalName: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const displayName = profile.full_name || profile.email;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-card md:sticky md:top-0 md:h-svh md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-12 items-center gap-2 px-4">
          <Link href="/portal" className="flex shrink-0 items-center rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {/* Logo lives in /public; plain <img> keeps its natural aspect ratio */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/joey-logo.png" alt="Joey" className="h-6 w-auto" />
          </Link>
          <span className="text-xs text-muted-foreground">{portalName}</span>
        </div>

        <SidebarNav items={nav} />

        <div className="mt-auto hidden border-t p-2 md:block">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          </div>
          <SidebarLogout />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

// Shown for a moment while the portal checks who's signed in
export function ShellFallback() {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <div className="h-12 border-b bg-card md:h-svh md:w-56 md:border-b-0 md:border-r" />
      <div className="flex-1" />
    </div>
  );
}