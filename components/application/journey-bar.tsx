"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "paused" | "upcoming";

export type JourneyStep = {
  key: string;
  title: string;
  ownerLabel: string;
  typicalDuration: string | null;
  state: StepState;
  /** Formatted date the Joey reached this step, if they have. */
  reachedOn: string | null;
};

/** The whole process across the top of the onboarding page. Every step opens a short brief:
 * who handles it and its status. The active stage's message is in the main content instead. */
export function JourneyBar({ steps }: { steps: JourneyStep[] }) {
  const ref = useRef<HTMLElement>(null);

  // The bar sticks just under the pinned page header (h-12). Publish the combined height
  // as --journey-h so other sticky things (the form's section list) and anchor jumps sit below both.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--journey-h", `calc(3rem + ${el.offsetHeight}px)`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--journey-h");
    };
  }, []);

  return (
    <nav ref={ref} aria-label="Your journey" className="sticky top-12 z-30 border-b bg-card">
      <WideBar steps={steps} />
      <CompactBar steps={steps} />
    </nav>
  );
}

function WideBar({ steps }: { steps: JourneyStep[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLOListElement>(null);

  // Close the brief on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <ol ref={ref} className="hidden items-start px-4 py-3 sm:flex sm:px-6">
      {steps.map((s, i) => {
        const isOpen = open === s.key;
        // Keep the brief on-screen at the ends of the bar.
        const align = i === 0 ? "left-0" : i === steps.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center" aria-current={s.state === "current" ? "step" : undefined}>
            {/* Connector to the previous step */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 top-4 h-px w-full",
                  s.state === "upcoming" ? "bg-border" : "bg-emerald-500/60",
                )}
              />
            )}
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : s.key)}
              aria-expanded={isOpen}
              aria-controls={`step-brief-${s.key}`}
              className="group relative z-10 flex w-full min-w-0 flex-col items-center gap-1.5 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Marker state={s.state} n={i + 1} />
              <span
                className={cn(
                  "w-full truncate text-center text-xs",
                  s.state === "upcoming" ? "text-muted-foreground group-hover:text-foreground" : "font-medium",
                  s.state === "current" && "text-foreground",
                )}
              >
                {s.title}
              </span>
            </button>
            {isOpen && (
              <div
                id={`step-brief-${s.key}`}
                role="dialog"
                aria-label={s.title}
                className={cn("absolute top-full z-20 mt-1 w-72 rounded-lg border bg-popover p-4 text-left shadow-md", align)}
              >
                <StepBrief step={s} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Phones: "Step 2 of 7" with a progress strip, and the full list on tap. */
function CompactBar({ steps }: { steps: JourneyStep[] }) {
  const idx = Math.max(0, steps.findIndex((s) => s.state === "current" || s.state === "paused"));
  const here = steps[idx];
  return (
    <details className="group px-4 py-3 sm:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Step {idx + 1} of {steps.length}
            {here.state === "paused" && <span className="text-amber-600"> · Paused</span>}
          </p>
          <p className="truncate text-sm font-medium">{here.title}</p>
          <div aria-hidden className="mt-2 flex gap-1">
            {steps.map((s) => (
              <span
                key={s.key}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  s.state === "done" && "bg-emerald-500",
                  s.state === "current" && "bg-foreground",
                  s.state === "paused" && "bg-amber-500",
                  s.state === "upcoming" && "bg-border",
                )}
              />
            ))}
          </div>
        </div>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="sr-only">Show all steps</span>
      </summary>
      <ol className="mt-4 max-h-[65svh] space-y-4 overflow-y-auto border-t pt-4">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <Marker state={s.state} n={i + 1} />
            <div className="min-w-0 flex-1">
              <StepBrief step={s} />
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function StepBrief({ step: s }: { step: JourneyStep }) {
  const status =
    s.state === "done"
      ? `Done${s.reachedOn ? ` · ${s.reachedOn}` : ""}`
      : s.state === "current"
        ? "Happening now"
        : s.state === "paused"
          ? "Paused here"
          : s.typicalDuration
            ? `Usually takes ${s.typicalDuration.toLowerCase()}`
            : "Coming up";
  return (
    <>
      <p className="text-sm font-medium">{s.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {s.ownerLabel} ·{" "}
        <span className={cn(s.state === "current" && "font-medium text-foreground", s.state === "paused" && "text-amber-600")}>
          {status}
        </span>
      </p>
    </>
  );
}

function Marker({ state, n }: { state: StepState; n: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
        state === "done" && "border-emerald-500 bg-emerald-500 text-white",
        state === "current" && "border-foreground bg-foreground text-background ring-4 ring-foreground/10",
        state === "paused" && "border-amber-500 bg-background text-amber-600",
        state === "upcoming" && "bg-background text-muted-foreground",
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : state === "paused" ? <Pause className="size-3" /> : n}
    </span>
  );
}
