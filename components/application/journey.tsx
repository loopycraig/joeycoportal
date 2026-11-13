import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage, StageEvent } from "@/lib/joey/queries";
import type { JourneyStep, StepState } from "@/components/application/journey-bar";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Where the Joey is on the path. When paused or closed, the path stops at the last on-path step reached. */
export function journeySteps(stages: Stage[], events: StageEvent[], currentStage: Stage): JourneyStep[] {
  const onPath = stages.filter((s) => s.on_path);
  const lastAt = new Map<string, string>();
  for (const e of events) lastAt.set(e.stage_key, e.occurred_at);

  const offPath = !currentStage.on_path;
  const reached = offPath ? onPath.findLast((s) => lastAt.has(s.key)) ?? onPath[0] : currentStage;
  const stateOf = (s: Stage): StepState =>
    s.sort_order < reached.sort_order ? "done" : s.key === reached.key ? (offPath ? "paused" : "current") : "upcoming";

  return onPath.map((s) => {
    const at = lastAt.get(s.key);
    return {
      key: s.key,
      title: s.title,
      ownerLabel: s.owner_label,
      typicalDuration: s.typical_duration,
      state: stateOf(s),
      reachedOn: at ? fmt(at) : null,
    };
  });
}

/** After submitting: where things stand, what's next, and anything the Joey needs to do. */
export function StageStatus({
  stages,
  events,
  currentStage,
}: {
  stages: Stage[];
  events: StageEvent[];
  currentStage: Stage;
}) {
  const offPath = !currentStage.on_path;
  const since = events.findLast((e) => e.stage_key === currentStage.key)?.occurred_at;
  const next = offPath ? null : stages.find((s) => s.on_path && s.sort_order > currentStage.sort_order);
  const bgCheck = stages.find((s) => s.key === "background_check");
  const bgState = !bgCheck
    ? null
    : currentStage.key === bgCheck.key
      ? "current"
      : !offPath && currentStage.sort_order > bgCheck.sort_order
        ? "done"
        : offPath
          ? null
          : "upcoming";

  return (
    <section aria-labelledby="now-title" className="border-b px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <OwnerChip stage={currentStage} />
        <h2 id="now-title" className="mt-3 text-2xl font-semibold tracking-tight">
          {currentStage.title}
        </h2>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{currentStage.joey_message}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {since && <>Since {fmt(since)}. </>}
          {currentStage.typical_duration && !offPath && <>This usually takes {currentStage.typical_duration.toLowerCase()}.</>}
        </p>

        {(next || bgState) && (
          <div className="mt-6 space-y-3 border-t pt-4 text-sm">
            {next && (
              <p>
                <span className="text-muted-foreground">Next: </span>
                {next.title}, with {next.owner === "joey" ? "you" : next.owner_label.replace(/^Your /, "your ")}.
              </p>
            )}
            {bgState && (
              <TodoItem
                state={bgState}
                detail={
                  bgState === "current"
                    ? "Look for an email from our screening partner. You'll finish this on their site."
                    : bgState === "upcoming"
                      ? "We'll email you a consent link after your references check out."
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
      {stage.on_path ? `Who's on it: ${stage.owner_label}` : "Paused"}
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
