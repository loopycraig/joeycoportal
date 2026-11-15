// Pending, Active and Expired agreements, as tabs. Server-safe.

import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";
import { Pill, type PillTone } from "@/components/status-pill";
import type { Section } from "@/lib/agreements/fields";

export type ListItem = {
  key: string;
  href: string;
  title: string;
  /** Who it's with, or other context. */
  detail?: string;
  status: string;
  tone: PillTone;
  /** It's this viewer's turn. */
  action?: boolean;
  section: Section;
};

const SECTIONS: { id: Section; title: string; empty: string }[] = [
  { id: "pending", title: "Pending", empty: "Nothing waiting on anyone." },
  { id: "active", title: "Active", empty: "No signed agreements yet." },
  { id: "expired", title: "Expired", empty: "Nothing has expired." },
];

/** One tab per section. Opens on Pending when something's waiting, otherwise Active. */
export function AgreementList({ items }: { items: ListItem[] }) {
  const pending = items.filter((i) => i.section === "pending").length;
  return (
    <PageTabs
      defaultTab={pending > 0 ? "pending" : "active"}
      tabs={SECTIONS.map((s) => {
        const rows = items.filter((i) => i.section === s.id);
        return {
          id: s.id,
          label: s.title,
          count: s.id === "pending" ? rows.length : undefined,
          content:
            rows.length === 0 ? (
              <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">{s.empty}</p>
            ) : (
              <ul className="divide-y border-b">
                {rows.map((r) => (
                  <li key={r.key}>
                    <Link
                      href={r.href}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:px-6"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm", r.action && "font-medium")}>{r.title}</p>
                        {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
                      </div>
                      <Pill label={r.status} tone={r.tone} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ),
        };
      })}
    />
  );
}
