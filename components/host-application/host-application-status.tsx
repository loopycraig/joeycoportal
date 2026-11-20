import { Check, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { journeySteps } from "@/components/application/journey";
import type { HostStage, HostStageEvent } from "@/lib/host/queries";
import { CALENDLY_URL, CHILDCARE, CHILDCARE_LABELS, CONTACT_EMAIL, MEDICAL, OTHER, type HostApplication } from "@/lib/host/application";

/** After submitting: where things stand, a way to book a call, the steps ahead, and their answers. */
export function HostApplicationStatus({
  application: a,
  email,
  stages,
  events,
  currentStage,
}: {
  application: HostApplication;
  email: string;
  stages: HostStage[];
  events: HostStageEvent[];
  currentStage: HostStage;
}) {
  const justApplied = currentStage.key === "in_review";
  const steps = journeySteps(stages, events, currentStage);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      {justApplied ? (
        <>
          <h2 className="text-3xl font-semibold tracking-tight">Hosting looks good on you!</h2>
          <p className="mt-3 text-xl leading-relaxed text-muted-foreground">
            You&apos;re all set. We&apos;ll reach out soon.
          </p>
        </>
      ) : (
        <>
          {currentStage.step && currentStage.step.toLowerCase() !== currentStage.title.toLowerCase() && (
            <p className="text-base font-medium text-muted-foreground">{currentStage.step}</p>
          )}
          <h2 className="text-3xl font-semibold tracking-tight">{currentStage.title}</h2>
          <p className="mt-3 text-xl leading-relaxed text-muted-foreground">{currentStage.host_message}</p>
        </>
      )}

      {currentStage.on_path && (
        <div className="mt-8 rounded-lg border p-5">
          <p className="text-lg">
            {justApplied ? "Want to pick a time to talk with us?" : "Want to talk with us?"}
          </p>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-14 items-center justify-center rounded-lg bg-highlight px-8 text-lg font-semibold text-highlight-foreground shadow hover:bg-highlight/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Schedule a call
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      )}

      <section aria-labelledby="steps-title" className="mt-12">
        <h3 id="steps-title" className="text-xl font-semibold">
          What happens next
        </h3>
        <ol className="mt-5 space-y-5">
          {steps.map((s, i) => (
            <li key={s.key} className="flex gap-4" aria-current={s.state === "current" ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 text-base tabular-nums",
                  s.state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                  s.state === "current" && "border-foreground bg-foreground text-background",
                  s.state === "paused" && "border-amber-500 text-amber-600",
                  s.state === "upcoming" && "text-muted-foreground",
                )}
              >
                {s.state === "done" ? <Check className="size-5" /> : s.state === "paused" ? <Pause className="size-4" /> : i + 1}
              </span>
              <div className="pt-1">
                <p className={cn("text-lg", s.state === "upcoming" ? "text-muted-foreground" : "font-medium")}>{s.title}</p>
                <p className="text-base text-muted-foreground">
                  {s.state === "done"
                    ? "Done"
                    : s.state === "current"
                      ? "You are here"
                      : s.state === "paused"
                        ? "Paused here"
                        : s.ownerLabel}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="group mt-12 rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
          Your answers
          <span className="text-base font-normal text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-base font-normal text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <dl className="space-y-4 border-t p-5 text-lg">
          {answerRows(a, email).map(([label, value]) => (
            <div key={label}>
              <dt className="text-base text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line break-words">{value || "—"}</dd>
            </div>
          ))}
          <p className="border-t pt-4 text-base text-muted-foreground">
            Need to change something? Email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </dl>
      </details>
    </div>
  );
}

function answerRows(a: HostApplication, email: string): [string, string | null][] {
  return [
    ["Name", a.full_name],
    ["Phone", a.phone],
    ["Email", email],
    ["Zip code", a.zip_code],
    ["Help you need", a.help_types.join(", ")],
    ...(a.help_types.includes(CHILDCARE)
      ? [["Childcare", a.childcare_need && (CHILDCARE_LABELS[a.childcare_need] ?? a.childcare_need)] as [string, string | null]]
      : []),
    ...(a.help_types.includes(MEDICAL) ? [["Medical help", a.medical_needs] as [string, string | null]] : []),
    ...(a.help_types.includes(OTHER) ? [["Other help", a.help_details] as [string, string | null]] : []),
    ["Hours each week", a.weekly_hours],
    ["Your home has", a.amenities.join(", ") || "None of these yet"],
  ];
}
