"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChoiceChips, Field, SelectInput, TextArea, TextInput } from "@/components/application/fields";
import { ReferencesEditor } from "@/components/application/references-editor";
import { CityPicker } from "@/components/application/city-picker";
import { DisclosureSigner, type SignInput } from "@/components/application/disclosure-signer";
import type { DisclosureId } from "@/lib/joey/disclosures";
import { saveApplicationDraft, submitApplication } from "@/lib/joey/actions";
import {
  HEARD_ABOUT_OPTIONS,
  HOST_PREFERENCE_OPTIONS,
  MISSING_LABELS,
  MOVE_IN_OPTIONS,
  SECTIONS,
  SERVICE_OPTIONS,
  WORK_AUTH_OPTIONS,
  missingFields,
  sectionProgress,
  type ApplicationDraft,
  type Reference,
  type SectionId,
} from "@/lib/joey/application";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

export function ApplicationForm({
  initial,
  email,
  references,
  disclosuresSignedAt,
}: {
  initial: ApplicationDraft;
  email: string;
  references: Reference[];
  /** Stamped by the database when each disclosure was signed. */
  disclosuresSignedAt: Record<DisclosureId, string | null>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [refCount, setRefCount] = useState(references.length);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [showMissing, setShowMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedAt, setSignedAt] = useState(disclosuresSignedAt);

  // Autosave: batch changes and write them 700ms after the last edit.
  const pending = useRef<Partial<ApplicationDraft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return true;
    pending.current = {};
    setSave({ kind: "saving" });
    const res = await saveApplicationDraft(patch);
    if (res.ok) {
      setSave({ kind: "saved", at: res.savedAt });
      return true;
    }
    pending.current = { ...patch, ...pending.current }; // keep for the next try
    setSave({ kind: "error", message: res.error });
    return false;
  }, []);

  const update = <K extends keyof ApplicationDraft>(key: K, value: ApplicationDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  // Signing a document saves straight away rather than waiting for autosave.
  const signDisclosure = async (id: DisclosureId, input: SignInput) => {
    if (id === "bg") {
      update("bg_disclosure_signature", input.signature);
      update("bg_disclosure_version", input.version);
    } else if (id === "conduct") {
      update("conduct_signature", input.signature);
      update("conduct_version", input.version);
    } else {
      update("ca_disclosure_signature", input.signature);
      update("ca_disclosure_version", input.version);
      update("ca_report_copy_requested", input.copyRequested ?? false);
    }
    const ok = await flush();
    if (ok) setSignedAt((s) => ({ ...s, [id]: new Date().toISOString() }));
    return ok;
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

  const missing = useMemo(() => missingFields(draft, refCount), [draft, refCount]);
  const sections = sectionProgress(missing);
  const done = sections.filter((s) => s.complete).length;
  const miss = (key: string) => showMissing && missing.includes(key);

  const submit = async () => {
    setSubmitError(null);
    if (missing.length > 0) {
      setShowMissing(true);
      const first = sections.find((s) => !s.complete);
      if (first) document.getElementById(first.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSubmitting(true);
    if (!(await flush())) {
      setSubmitting(false);
      return;
    }
    const res = await submitApplication();
    if (!res.ok) {
      setSubmitting(false);
      setSubmitError(res.error);
      if ("missing" in res) setShowMissing(true);
      return;
    }
    // The page re-renders as "submitted": journey bar, where things stand, and a summary.
    window.scrollTo({ top: 0 });
    router.refresh();
  };

  return (
    <div className="lg:grid lg:grid-cols-[13rem_1fr]">
      {/* Section list with completion */}
      <nav aria-label="Application sections" className="hidden border-r lg:block">
        <ol className="sticky top-[var(--journey-h,0px)] space-y-0.5 p-4">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <StepDot complete={s.complete} index={i + 1} flagged={showMissing && !s.complete} />
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        <Section id="about">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" missing={miss("first_name")}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} autoComplete="given-name" invalid={miss("first_name")}
                  value={draft.first_name ?? ""} onChange={(e) => update("first_name", e.target.value)} />
              )}
            </Field>
            <Field label="Last name" missing={miss("last_name")}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} autoComplete="family-name" invalid={miss("last_name")}
                  value={draft.last_name ?? ""} onChange={(e) => update("last_name", e.target.value)} />
              )}
            </Field>
            <Field label="Email" hint="The email you signed in with. We'll use it for every update.">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={email} readOnly disabled />}
            </Field>
            <Field label="Phone" missing={miss("phone")} missingText="Add a phone number with area code">
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} type="tel" autoComplete="tel" invalid={miss("phone")}
                  value={draft.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
              )}
            </Field>
            <Field
              label="Date of birth"
              hint="Only used to confirm you're 18 or older. It isn't shared with Hosts."
              missing={miss("date_of_birth") || missing.includes("under_18")}
              missingText={missing.includes("under_18") ? MISSING_LABELS.under_18 : "Required"}
            >
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} type="date" autoComplete="bday"
                  invalid={miss("date_of_birth") || missing.includes("under_18")}
                  value={draft.date_of_birth ?? ""} onChange={(e) => update("date_of_birth", e.target.value || null)} />
              )}
            </Field>
            <Field label="Are you authorized to work in the U.S.?" missing={miss("work_authorized")}>
              {(id, d) => (
                <SelectInput id={id} describedBy={d} options={WORK_AUTH_OPTIONS} invalid={miss("work_authorized")}
                  value={draft.work_authorized} onChange={(v) => update("work_authorized", v)} />
              )}
            </Field>
            <Field label="School and degree" hint="For example, UCLA, BS Nursing (2027)" missing={miss("school_degree")} className="sm:col-span-2">
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} invalid={miss("school_degree")}
                  value={draft.school_degree ?? ""} onChange={(e) => update("school_degree", e.target.value)} />
              )}
            </Field>
          </div>
        </Section>

        <Section id="preferences">
          <div className="space-y-6">
            <CityPicker legend="Preferred cities" hint="Choose every city you'd move to. Not on our list? Type it in."
              value={draft.preferred_cities}
              onChange={(v) => update("preferred_cities", v)} missing={miss("preferred_cities")} />
            <ChoiceChips legend="When are you looking to move in?" multiple={false}
              options={MOVE_IN_OPTIONS} value={draft.move_in_timing ? [draft.move_in_timing] : []}
              onChange={(v) => update("move_in_timing", v[0] ?? null)} missing={miss("move_in_timing")} />
            <ChoiceChips legend="I'd be comfortable working with Hosts who are" multiple={false}
              options={HOST_PREFERENCE_OPTIONS} value={draft.host_preference ? [draft.host_preference] : []}
              onChange={(v) => update("host_preference", v[0] ?? null)} missing={miss("host_preference")} />
            <ChoiceChips legend="I'm comfortable helping with" hint="Choose all that apply."
              options={SERVICE_OPTIONS} value={draft.services}
              onChange={(v) => update("services", v)} missing={miss("services")} />
          </div>
        </Section>

        <Section id="story">
          <div className="space-y-5">
            <Field label="Why are you interested in becoming a Joey?" hint="A few sentences is plenty." missing={miss("why_joey")}>
              {(id, d) => (
                <TextArea id={id} aria-describedby={d} rows={5} invalid={miss("why_joey")}
                  value={draft.why_joey ?? ""} onChange={(e) => update("why_joey", e.target.value)} />
              )}
            </Field>
            <Field label="How did you hear about us?" missing={miss("heard_about")} className="sm:max-w-sm">
              {(id, d) => (
                <SelectInput id={id} describedBy={d} options={HEARD_ABOUT_OPTIONS} invalid={miss("heard_about")}
                  value={draft.heard_about} onChange={(v) => update("heard_about", v)} />
              )}
            </Field>
          </div>
        </Section>

        <Section
          id="references"
          intro="We contact your references after we review your application. We'll let you know before we reach out, so you can give them a heads-up."
        >
          <ReferencesEditor initial={references} editable onCountChange={setRefCount} showMissing={showMissing} />
        </Section>

        <Section
          id="acknowledgements"
          intro="Before we can run your background check, please read and sign each of these. Each opens on its own page."
        >
          <div className="space-y-6">
            <DisclosureSigner
              printedName={[draft.first_name, draft.last_name].filter(Boolean).join(" ")}
              signatures={{
                bg: { signature: draft.bg_disclosure_signature, signedAt: signedAt.bg },
                ca: {
                  signature: draft.ca_disclosure_signature,
                  signedAt: signedAt.ca,
                  copyRequested: draft.ca_report_copy_requested,
                },
                conduct: { signature: draft.conduct_signature, signedAt: signedAt.conduct },
              }}
              onSign={signDisclosure}
              missing={{
                bg: miss("bg_disclosure_signature"),
                ca: miss("ca_disclosure_signature"),
                conduct: miss("conduct_signature"),
              }}
            />
            <ChoiceChips legend="Get news and updates from JoeyCo?" multiple={false}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              value={draft.news_opt_in === null ? [] : [draft.news_opt_in ? "yes" : "no"]}
              onChange={(v) => update("news_opt_in", v[0] === "yes")} missing={miss("news_opt_in")} />
          </div>
        </Section>

        {/* Submit bar */}
        <div className="sticky bottom-0 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 text-sm">
              <p>
                {done} of {SECTIONS.length} sections complete
              </p>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                <SaveStatus state={save} />
              </p>
            </div>
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit application"}
            </Button>
          </div>
          {(submitError || (showMissing && missing.length > 0)) && (
            <div role="alert" className="mt-2 text-sm text-destructive">
              {submitError ?? "A few things still need answers:"}{" "}
              {showMissing && missing.length > 0 && (
                <span className="text-muted-foreground">
                  {missing.map((k) => MISSING_LABELS[k] ?? k).join(", ")}.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ id, intro, children }: { id: SectionId; intro?: string; children: React.ReactNode }) {
  const index = SECTIONS.findIndex((s) => s.id === id);
  const title = SECTIONS[index].title;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-[calc(var(--journey-h,0px)+1rem)] border-b px-6 py-8">
      <h2 id={`${id}-title`} className="mb-1 flex items-baseline gap-2 text-base font-medium">
        <span className="tabular-nums text-muted-foreground">{index + 1}</span>
        {title}
      </h2>
      {intro && <p className="mb-5 max-w-prose text-sm text-muted-foreground">{intro}</p>}
      <div className={intro ? undefined : "pt-4"}>{children}</div>
    </section>
  );
}

function StepDot({ complete, index, flagged }: { complete: boolean; index: number; flagged: boolean }) {
  return (
    <span
      aria-label={complete ? "Complete" : flagged ? "Needs answers" : "Not complete"}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums",
        complete && "border-emerald-500 bg-emerald-500 text-white",
        !complete && flagged && "border-destructive text-destructive",
        !complete && !flagged && "text-muted-foreground",
      )}
    >
      {complete ? <Check className="size-3" aria-hidden /> : index}
    </span>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "idle":
      return <>Your answers save automatically.</>;
    case "saving":
      return <>Saving…</>;
    case "saved":
      return (
        <>Saved at {new Date(state.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</>
      );
    case "error":
      return <span className="text-destructive">{state.message}</span>;
  }
}
