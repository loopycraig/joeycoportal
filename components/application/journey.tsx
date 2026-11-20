import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage, StageEvent } from "@/lib/joey/queries";
import type { JourneyStep, StepState } from "@/components/application/journey-bar";

/** What journeySteps needs from a stage. Joey and Host stages both have these. */
export type JourneyStage = Pick<Stage, "key" | "sort_order" | "step" | "title" | "owner_label" | "typical_duration" | "on_path">;

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * The one-pager's steps, with where the Joey is. A step can hold more than one stage (Getting
 * Started: applying, then submitted), so stages are grouped by their step. When paused or closed,
 * the path stops at the last on-path step reached.
 */
export function journeySteps<S extends JourneyStage>(stages: S[], events: StageEvent[], currentStage: S): JourneyStep[] {
  const onPath = stages.filter((s) => s.on_path);
  const firstAt = new Map<string, string>();
  for (const e of events) if (!firstAt.has(e.stage_key)) firstAt.set(e.stage_key, e.occurred_at);

  const offPath = !currentStage.on_path;
  const reached = offPath ? onPath.findLast((s) => firstAt.has(s.key)) ?? onPath[0] : currentStage;

  const groups: { step: string; stages: S[] }[] = [];
  for (const s of onPath) {
    const step = s.step ?? s.title;
    const last = groups.at(-1);
    if (last && last.step === step) last.stages.push(s);
    else groups.push({ step, stages: [s] });
  }

  return groups.map(({ step, stages: inStep }) => {
    const first = inStep[0];
    const lastStage = inStep[inStep.length - 1];
    const here = inStep.find((s) => s.key === reached.key);
    const state: StepState = here
      ? offPath
        ? "paused"
        : "current"
      : lastStage.sort_order < reached.sort_order
        ? "done"
        : "upcoming";
    const at = inStep.map((s) => firstAt.get(s.key)).find(Boolean);
    return {
      key: first.key,
      title: step,
      ownerLabel: (here ?? first).owner_label,
      typicalDuration: first.typical_duration,
      state,
      reachedOn: at ? fmt(at) : null,
    };
  });
}

/** After submitting: where things stand, what's next, and anything the Joey needs to do. */
export function StageStatus({ stages, currentStage }: { stages: Stage[]; currentStage: Stage }) {
  const offPath = !currentStage.on_path;
  const next = offPath ? null : stages.find((s) => s.on_path && s.sort_order > currentStage.sort_order);
  const nextLabel = next ? (next.step && next.step !== currentStage.step ? next.step : next.title) : null;
  // The Joey's own part of the background check, shown from Match Ready until it's underway.
  const bgState =
    currentStage.key === "background_check"
      ? "current"
      : currentStage.key === "approved" || currentStage.key === "matching"
        ? "upcoming"
        : null;

  return (
    <section aria-labelledby="now-title" className="border-b px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <OwnerChip stage={currentStage} />
        {currentStage.step && currentStage.step.toLowerCase() !== currentStage.title.toLowerCase() && (
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{currentStage.step}</p>
        )}
        <h2 id="now-title" className={cn("text-2xl font-semibold tracking-tight", currentStage.step && currentStage.step.toLowerCase() !== currentStage.title.toLowerCase() ? "mt-1" : "mt-3")}>
          {currentStage.title}
        </h2>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{currentStage.joey_message}</p>
        {currentStage.typical_duration && !offPath && (
          <p className="mt-3 text-sm text-muted-foreground">Typical timing: {lowerFirst(currentStage.typical_duration)}.</p>
        )}

        {(next || bgState) && (
          <div className="mt-6 space-y-3 border-t pt-4 text-sm">
            {next && (
              <p>
                <span className="text-muted-foreground">Next: </span>
                {nextLabel}, with {next.owner_label.replace(/^You\b/, "you")}.
              </p>
            )}
            {bgState && (
              <TodoItem
                state={bgState}
                detail={
                  bgState === "current"
                    ? "Look for an email from our screening partner. You'll finish this on their site."
                    : bgState === "upcoming"
                      ? "Once you and a Host decide to move forward, we'll email you a consent link."
                      : undefined
                }
              >
                Your part: give consent for your background check
              </TodoItem>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** "Varies by city" reads as "varies by city" mid-sentence; "About a week" as "about a week". */
export function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function OwnerChip({ stage }: { stage: Stage }) {
  const yours = stage.owner === "joey" || stage.owner === "vendor";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
        yours ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "text-muted-foreground",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", yours ? "bg-sky-500" : "bg-muted-foreground/60")} />
      {stage.on_path ? `Who's on point: ${stage.owner_label}` : "Paused"}
    </span>
  );
}

function TodoItem({
  children,
  state,
  detail,
}: {
  children: React.ReactNode;
  state: "done" | "current" | "upcoming";
  detail?: string;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border",
          state === "done" && "border-emerald-500 bg-emerald-500 text-white",
          state === "current" && "border-sky-500 ring-2 ring-sky-500/20",
        )}
      >
        {state === "done" && <Check className="size-3" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block",
            state === "done" && "text-muted-foreground line-through decoration-muted-foreground/40",
            state === "upcoming" && "text-muted-foreground",
          )}
        >
          {children}
          <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (to do now)" : " (not yet)"}</span>
        </span>
        {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </div>
  );
}
