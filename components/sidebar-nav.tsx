"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";

/** `locked` items are shown greyed out (not links), e.g. portal pages a Joey gets once matched. */
export type NavItem = { href: string; label: string; locked?: boolean };

export function SidebarNav({ items, lockedNote }: { items: NavItem[]; lockedNote?: string }) {
  const pathname = usePathname();
  const firstLocked = items.findIndex((i) => i.locked);

  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
      {items.map((item, i) => {
        if (item.locked) {
          return (
            <div key={item.href} className="contents">
              {i === firstLocked && lockedNote && (
                <p className="hidden px-2 pb-1 pt-4 text-xs text-muted-foreground/70 md:block">{lockedNote}</p>
              )}
              <span
                aria-disabled="true"
                title={lockedNote}
                className="flex cursor-default items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground/50"
              >
                {item.label}
                <Lock aria-hidden className="size-3.5" />
                {lockedNote && <span className="sr-only"> ({lockedNote})</span>}
              </span>
            </div>
          );
        }
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
