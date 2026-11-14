// Home: one card per area, each listing what needs doing there. Server-safe.

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/status-pill";

export type HomeAction = {
  label: string;
  detail?: string;
  href: string;
  /** Past a deadline, or due today. */
  urgent?: boolean;
};

export type HomeCardData = {
  title: string;
  href: string;
  /** Things this person has to do. */
  actions: HomeAction[];
  /** Useful facts, nothing to do. */
  info: string[];
};

const MAX_ACTIONS = 4;

export function HomeGrid({ cards }: { cards: HomeCardData[] }) {
  return (
    <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
      {cards.map((c) => (
        <HomeCard key={c.title} card={c} />
      ))}
    </div>
  );
}

function HomeCard({ card }: { card: HomeCardData }) {
  const { title, href, actions, info } = card;
  const urgent = actions.some((a) => a.urgent);
  const shown = actions.slice(0, MAX_ACTIONS);
  const more = actions.length - shown.length;

  return (
    <section aria-labelledby={`home-${href}`} className="flex flex-col rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id={`home-${href}`} className="text-sm font-medium">
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </h2>
        {actions.length > 0 ? (
          <Pill tone={urgent ? "stopped" : "waiting"} label={`${actions.length} to do`} />
        ) : (
          <Pill tone="done" label="All caught up" />
        )}
      </header>

      <div className="flex flex-1 flex-col">
        {shown.length > 0 && (
          <ul className="divide-y border-b">
            {shown.map((a) => (
              <li key={a.label + a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", a.urgent ? "bg-red-500" : "bg-amber-400")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.label}</span>
                    {a.detail && (
                      <span className={cn("block truncate text-xs", a.urgent ? "text-red-500" : "text-muted-foreground")}>
                        {a.detail}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
            {more > 0 && (
              <li className="px-4 py-2 text-xs text-muted-foreground">
                and {more} more in {title}
              </li>
            )}
          </ul>
        )}

        {actions.length === 0 && info.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">Nothing needs your attention.</p>
        )}

        {info.length > 0 && (
          <ul className="space-y-1 px-4 py-3 text-xs text-muted-foreground">
            {info.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <Link
          href={href}
          className="mt-auto inline-flex items-center gap-1 self-end px-4 py-3 text-xs text-muted-foreground hover:text-foreground"
        >
          Go to {title}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
