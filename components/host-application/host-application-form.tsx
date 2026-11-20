"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveHostApplicationDraft, submitHostApplication } from "@/lib/host/actions";
import {
  AMENITY_OPTIONS,
  CHILDCARE,
  CHILDCARE_LABELS,
  CHILDCARE_OPTIONS,
  HELP_OPTIONS,
  HOST_MISSING_LABELS,
  HOURS_OPTIONS,
  LESS_THAN_5,
  MEDICAL,
  OTHER,
  SCOPE_OF_SERVICE_URL,
  homeIsReady,
  hostMissingFields,
  hostStepsFor,
  type HostApplicationDraft,
  type HostStepId,
} from "@/lib/host/application";

// Hosts are mostly older adults: one question per screen, large type, big tap targets, plain words.

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function HostApplicationForm({ initial, email }: { initial: HostApplicationDraft; email: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Pressing Continue with the home not ready shows a note first; pressing again goes on.
  const [homeNoteShown, setHomeNoteShown] = useState(false);
  const [fromReview, setFromReview] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps = hostStepsFor(draft.help_types);
  const missing = useMemo(() => hostMissingFields(draft), [draft]);

  // Start where they left off: the first step with something unanswered, else the review.
  const [stepId, setStepId] = useState<HostStepId>(() => {
    const m = hostMissingFields(initial);
    return hostStepsFor(initial.help_types).find((s) => s.keys.some((k) => m.includes(k)))?.id ?? "review";
  });
  const index = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const step = steps[index];
  const questionCount = steps.length - 1; // the review isn't a question

  // Autosave: batch changes and write them 700ms after the last edit.
  const pending = useRef<Partial<HostApplicationDraft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return true;
    pending.current = {};
    setSave({ kind: "saving" });
    const res = await saveHostApplicationDraft(patch);
    if (res.ok) {
      setSave({ kind: "saved" });
      return true;
    }
    pending.current = { ...patch, ...pending.current }; // keep for the next try
    setSave({ kind: "error", message: res.error });
    return false;
  }, []);

  const update = <K extends keyof HostApplicationDraft>(key: K, value: HostApplicationDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  // Don't lose the last few keystrokes when leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  const goTo = (id: HostStepId, opts: { fromReview?: boolean } = {}) => {
    setFromReview(Boolean(opts.fromReview));
    setShowErrors(false);
    setHomeNoteShown(false);
    setStepId(id);
    window.scrollTo({ top: 0 });
    // Move focus to the new question so screen readers announce it.
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const next = async () => {
    const stepMissing = step.keys.filter((k) => missing.includes(k));
    if (stepMissing.length > 0) {
      setShowErrors(true);
      return;
    }
    if (step.id === "home" && !homeIsReady(draft.amenities) && !homeNoteShown) {
      setHomeNoteShown(true);
      return;
    }
    if (!(await flush())) return;
    // Came here with "Change" from the review: go back to it, unless a new answer is needed first
    // (choosing Childcare adds the "A bit more" question, for example).
    if (fromReview) {
      const gap = steps.find((s) => s.keys.some((k) => missing.includes(k)));
      return goTo(gap?.id ?? "review");
    }
    goTo(steps[index + 1].id);
  };

  const back = () => index > 0 && goTo(steps[index - 1].id);

  const submit = async () => {
    setSubmitError(null);
    const firstGap = steps.find((s) => s.keys.some((k) => missing.includes(k)));
    if (firstGap) {
      goTo(firstGap.id);
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    if (!(await flush())) {
      setSubmitting(false);
      return;
    }
    const res = await submitHostApplication();
    if (!res.ok) {
      setSubmitting(false);
      setSubmitError(res.error);
      return;
    }
    window.scrollTo({ top: 0 });
    router.refresh();
  };

  const err = (key: string) => (showErrors && missing.includes(key) ? HOST_MISSING_LABELS[key] : undefined);

  // Changing the help needed can drop the "A bit more" step; clear answers that no longer apply.
  const setHelpTypes = (v: string[]) => {
    update("help_types", v);
    if (!v.includes(CHILDCARE) && draft.childcare_need) update("childcare_need", null);
    if (!v.includes(MEDICAL) && draft.medical_needs) update("medical_needs", null);
    if (!v.includes(OTHER) && draft.help_details) update("help_details", null);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      {step.id !== "review" && (
        <Progress current={index + 1} total={questionCount} />
      )}

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-semibold leading-snug tracking-tight focus:outline-none sm:text-3xl"
      >
        {STEP_HEADINGS[step.id]}
      </h2>

      <div className="mt-6 space-y-8">
        {step.id === "you" && (
          <>
            {index === 0 && (
              <p className="text-lg leading-relaxed text-muted-foreground">
                👋 Hi, it&apos;s great to meet you! These quick questions help us see if hosting a Joey is a good fit, and
                let us know how to follow up with you.
              </p>
            )}
            <BigField label="Your full name" error={err("full_name")}>
              {(id, d) => (
                <BigInput id={id} aria-describedby={d} autoComplete="name" invalid={Boolean(err("full_name"))}
                  value={draft.full_name ?? ""} onChange={(e) => update("full_name", e.target.value)} />
              )}
            </BigField>
            <BigField label="A good phone number to reach you" error={err("phone")}>
              {(id, d) => (
                <BigInput id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" invalid={Boolean(err("phone"))}
                  value={draft.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
              )}
            </BigField>
            <BigField label="Your zip code" error={err("zip_code")} className="max-w-xs">
              {(id, d) => (
                <BigInput id={id} aria-describedby={d} inputMode="numeric" autoComplete="postal-code" maxLength={5}
                  invalid={Boolean(err("zip_code"))} value={draft.zip_code ?? ""}
                  onChange={(e) => update("zip_code", e.target.value.replace(/\D/g, "").slice(0, 5))} />
              )}
            </BigField>
            <p className="text-base text-muted-foreground">
              We&apos;ll email you at <span className="font-medium text-foreground">{email}</span>.
            </p>
          </>
        )}

        {step.id === "help" && (
          <ChoiceList
            legend="Choose all that apply."
            options={HELP_OPTIONS}
            value={draft.help_types}
            onChange={setHelpTypes}
            error={err("help_types")}
          />
        )}

        {step.id === "details" && (
          <>
            {draft.help_types.includes(CHILDCARE) && (
              <ChoiceList
                legend="How much childcare do you need?"
                multiple={false}
                options={CHILDCARE_OPTIONS}
                labels={CHILDCARE_LABELS}
                value={draft.childcare_need ? [draft.childcare_need] : []}
                onChange={(v) => update("childcare_need", v[0] ?? null)}
                error={err("childcare_need")}
              />
            )}
            {draft.help_types.includes(MEDICAL) && (
              <div className="space-y-4">
                <Note>
                  Joeys aren&apos;t licensed professionals. They can&apos;t provide medical care, give medications, or support
                  complex health needs. They can help around the house, drive you to appointments, and keep you company on
                  walks.
                </Note>
                <BigField label="What kind of medical help are you looking for?" error={err("medical_needs")}>
                  {(id, d) => (
                    <BigTextArea id={id} aria-describedby={d} invalid={Boolean(err("medical_needs"))}
                      value={draft.medical_needs ?? ""} onChange={(e) => update("medical_needs", e.target.value)} />
                  )}
                </BigField>
              </div>
            )}
            {draft.help_types.includes(OTHER) && (
              <BigField label="Tell us more! What sort of help do you need?" error={err("help_details")}>
                {(id, d) => (
                  <BigTextArea id={id} aria-describedby={d} invalid={Boolean(err("help_details"))}
                    value={draft.help_details ?? ""} onChange={(e) => update("help_details", e.target.value)} />
                )}
              </BigField>
            )}
          </>
        )}

        {step.id === "hours" && (
          <>
            <ChoiceList
              legend="Your best guess is fine."
              multiple={false}
              options={HOURS_OPTIONS}
              value={draft.weekly_hours ? [draft.weekly_hours] : []}
              onChange={(v) => update("weekly_hours", v[0] ?? null)}
              error={err("weekly_hours")}
            />
            {draft.weekly_hours === LESS_THAN_5 && (
              <Note>
                <strong className="font-semibold">Joeys are a great fit for Hosts who need 5 or more hours of help a week.</strong>{" "}
                Joeys are looking for steady part-time work. They&apos;re flexible about scheduling, but need some
                predictability. Not sure how a Joey would fit into your week? See our{" "}
                <a href={SCOPE_OF_SERVICE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  Scope of Service
                </a>
                . You&apos;re welcome to continue either way.
              </Note>
            )}
          </>
        )}

        {step.id === "home" && (
          <>
            <ChoiceList
              legend="A Joey lives with you, so they need a few things. Check everything you have."
              options={AMENITY_OPTIONS}
              value={draft.amenities}
              onChange={(v) => {
                update("amenities", v);
                setHomeNoteShown(false);
              }}
            />
            {homeIsReady(draft.amenities) ? (
              <Note tone="good">Your home is Joey-ready!</Note>
            ) : (
              homeNoteShown && (
                <Note>
                  Your home may not be quite ready yet. A Joey needs a private bedroom and access to a bathroom, the
                  kitchen, and WiFi. We&apos;d love to help you get your space ready, so you&apos;re welcome to continue.
                </Note>
              )
            )}
          </>
        )}

        {step.id === "review" && (
          <Review draft={draft} email={email} steps={steps.map((s) => s.id)} onChange={(id) => goTo(id, { fromReview: true })} />
        )}
      </div>

      {/* Back and Continue (or Send) */}
      <div className="mt-10 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center">
        {index > 0 ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex h-12 items-center justify-center gap-1 rounded-md px-4 text-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-base text-muted-foreground sm:ml-auto" aria-live="polite">
          <SaveStatus state={save} />
        </p>
        {step.id === "review" ? (
          <BigButton onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Send my answers"}
          </BigButton>
        ) : (
          <BigButton onClick={next}>
            {step.id === "home" && homeNoteShown && !homeIsReady(draft.amenities) ? "Continue anyway" : "Continue"}
          </BigButton>
        )}
      </div>
      {submitError && (
        <p role="alert" className="mt-4 text-lg text-destructive">
          {submitError}
        </p>
      )}
    </div>
  );
}

const STEP_HEADINGS: Record<HostStepId, string> = {
  you: "Let's start with you",
  help: "What kind of help are you looking for?",
  details: "Tell us a little more",
  hours: "About how many hours of help do you need each week?",
  home: "Does your home have these for a Joey?",
  review: "Does everything look right?",
};

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div>
      <p className="text-base text-muted-foreground">
        Question {current} of {total}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Question ${current} of ${total}`}
      >
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Review({
  draft: d,
  email,
  steps,
  onChange,
}: {
  draft: HostApplicationDraft;
  email: string;
  steps: HostStepId[];
  onChange: (id: HostStepId) => void;
}) {
  const groups: { id: HostStepId; title: string; rows: [string, string | null][] }[] = [
    {
      id: "you",
      title: "About you",
      rows: [
        ["Name", d.full_name],
        ["Phone", d.phone],
        ["Zip code", d.zip_code],
        ["Email", email],
      ],
    },
    { id: "help", title: "Help you need", rows: [["", d.help_types.join(", ") || null]] },
    {
      id: "details",
      title: "A little more",
      rows: [
        ...(d.help_types.includes(CHILDCARE) ? [["Childcare", d.childcare_need && (CHILDCARE_LABELS[d.childcare_need] ?? d.childcare_need)] as [string, string | null]] : []),
        ...(d.help_types.includes(MEDICAL) ? [["Medical help", d.medical_needs] as [string, string | null]] : []),
        ...(d.help_types.includes(OTHER) ? [["Other help", d.help_details] as [string, string | null]] : []),
      ],
    },
    { id: "hours", title: "Hours each week", rows: [["", d.weekly_hours]] },
    { id: "home", title: "Your home has", rows: [["", d.amenities.join(", ") || "None of these yet"]] },
  ];

  return (
    <div className="divide-y rounded-lg border">
      {groups
        .filter((g) => steps.includes(g.id))
        .map((g) => (
          <div key={g.id} className="flex gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-medium">{g.title}</h3>
              <dl className="mt-1 space-y-1 text-lg text-muted-foreground">
                {g.rows.map(([label, value], i) => (
                  <div key={i} className="whitespace-pre-line break-words">
                    {label && <dt className="inline">{label}: </dt>}
                    <dd className="inline text-foreground">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <button
              type="button"
              onClick={() => onChange(g.id)}
              className="h-10 shrink-0 self-start rounded-md px-3 text-base underline underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Change<span className="sr-only"> {g.title}</span>
            </button>
          </div>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Large controls
// ─────────────────────────────────────────────

const control =
  "w-full rounded-lg border-2 border-input bg-background px-4 text-lg shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function BigField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-lg font-medium">
        {label}
      </label>
      {children(id, errId)}
      {error && (
        <p id={errId} className="text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function BigInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={cn(control, "h-14", invalid && "border-destructive", className)} />;
}

function BigTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return (
    <textarea {...rest} rows={4} aria-invalid={invalid || undefined} className={cn(control, "min-h-32 resize-y py-3", invalid && "border-destructive", className)} />
  );
}

function BigButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-14 items-center justify-center rounded-lg bg-highlight px-8 text-lg font-semibold text-highlight-foreground shadow hover:bg-highlight/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Large tappable rows: checkboxes when multiple, radio buttons otherwise. */
function ChoiceList({
  legend,
  options,
  labels,
  value,
  onChange,
  multiple = true,
  error,
}: {
  legend: string;
  options: string[];
  labels?: Record<string, string>;
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  error?: string;
}) {
  const name = useId();
  const toggle = (v: string) => {
    if (!multiple) return onChange([v]);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <fieldset className="space-y-3" aria-invalid={Boolean(error) || undefined}>
      <legend className="mb-3 text-lg text-muted-foreground">{legend}</legend>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <label
            key={o}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-4 rounded-lg border-2 px-4 py-3 text-lg transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              on ? "border-foreground bg-accent" : "border-input hover:border-foreground/40",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o}
              checked={on}
              onChange={() => toggle(o)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center border-2",
                multiple ? "rounded-md" : "rounded-full",
                on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60",
              )}
            >
              {on && (multiple ? <Check className="size-5" /> : <span className="size-2.5 rounded-full bg-background" />)}
            </span>
            <span>{labels?.[o] ?? o}</span>
          </label>
        );
      })}
      {error && <p className="text-base text-destructive">{error}</p>}
    </fieldset>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "good" }) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-lg leading-relaxed",
        tone === "good" ? "border-emerald-500/40 bg-emerald-500/10" : "border-sky-500/40 bg-sky-500/10",
      )}
    >
      {tone === "good" ? (
        <Check className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Info className="mt-1 size-5 shrink-0 text-sky-600" aria-hidden />
      )}
      <div>{children}</div>
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "idle":
      return <>Your answers save as you go</>;
    case "saving":
      return <>Saving…</>;
    case "saved":
      return <>Saved</>;
    case "error":
      return <span className="text-destructive">{state.message}</span>;
  }
}
