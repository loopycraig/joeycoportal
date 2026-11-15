"use client";

// A row that shows a one-line summary and opens to its details. A link to #<id> opens it.

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export function ExpandableRow({
  id,
  summary,
  children,
}: {
  id: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);

  return (
    <article id={id} className="scroll-mt-4 border-b">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-details`}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">{summary}</div>
      </button>
      {open && (
        <div id={`${id}-details`} className="px-4 pb-4 sm:pl-[3.25rem] sm:pr-6">
          {children}
        </div>
      )}
    </article>
  );
}
