// Home: one card per area, each a short list of rows in the same shape as that area's own page
// (pay periods, agreements, people), with what needs doing first. Server-safe.

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill, type PillTone } from "@/components/status-pill";

export type HomeRow = {
  key: string;
  /** What it is: a pay period, an agreement, a person. */
  label: string;
  /** Who it's with, or other context. */
  detail?: string;
  href: string;
  /** Status, as the area's page words it. */
  status?: string;
  tone: PillTone;
  /** A figure to line up on the right: hours or an amount. */
  value?: string;
  /** It's this person's turn. */
  action?: boolean;
};

export type HomeCardData = {
  title: string;
  href: string;
  rows: HomeRow[];
  /** Shown when there are no rows. */
  empty: string;
};

const MAX_ROWS = 5;

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
  const { title, href, rows, empty } = card;
  const todo = rows.filter((r) => r.action);
  const urgent = todo.some((r) => r.tone === "stopped");
  // To-dos first, then everything else in the order given.
  const ordered = [...todo, ...rows.filter((r) => !r.action)];
  const shown = ordered.slice(0, MAX_ROWS);
  const more = ordered.length - shown.length;

  return (
    <section aria-labelledby={`home-${href}`} className="flex flex-col rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id={`home-${href}`} className="text-sm font-medium">
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </h2>
        {todo.length > 0 ? (
          <Pill tone={urgent ? "stopped" : "waiting"} label={`${todo.length} to do`} />
        ) : (
          <Pill tone="done" label="All caught up" />
        )}
      </header>

      <div className="flex flex-1 flex-col">
        {shown.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y border-b">
            {shown.map((r) => (
              <li key={r.key}>
                <Link
                  href={r.href}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", r.action && "font-medium")}>{r.label}</p>
                    {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {r.value && <span className="text-sm tabular-nums">{r.value}</span>}
                    {r.status && <Pill label={r.status} tone={r.tone} />}
                  </div>
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
