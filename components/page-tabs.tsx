"use client";

// Tabs under a page header. Every panel is rendered (server content passed in as children) and the
// inactive ones are hidden, so switching is instant. The active tab is kept in ?tab= so a refresh
// keeps it, and a link to #<id> (e.g. a rent row from Home) opens the tab holding that element.
// Without either, it opens on defaultTab (or the first tab).

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export type PageTab = {
  id: string;
  label: string;
  /** Shown beside the label when above zero. */
  count?: number;
  content: React.ReactNode;
};

export function PageTabs({
  tabs,
  defaultTab,
  active: controlled,
  onSelect,
}: {
  tabs: PageTab[];
  defaultTab?: string;
  /** Optional: the parent picks the tab (e.g. to jump to one from a link inside another). */
  active?: string;
  onSelect?: (id: string) => void;
}) {
  const first = defaultTab && tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0].id;
  const [own, setOwn] = useState(first);
  const active = controlled ?? own;
  const setActive = (id: string) => {
    setOwn(id);
    onSelect?.(id);
  };

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const panel = hash ? document.getElementById(hash)?.closest("[role=tabpanel]") : null;
    const fromHash = panel && tabs.find((t) => `panel-${t.id}` === panel.id);
    const fromQuery = tabs.find((t) => t.id === new URLSearchParams(window.location.search).get("tab"));
    const tab = fromHash || fromQuery;
    if (!tab) return;
    setActive(tab.id);
    // The row was hidden when it tried to scroll itself into view; do it now that it's shown.
    if (fromHash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    // Only on first load: the tab list doesn't change after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.hash = "";
    if (id === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };

  return (
    <>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b px-2 sm:px-4" onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-2 py-2.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                on
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!t.count && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </>
  );
}
