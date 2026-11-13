import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { syncOnVisit } from "@/lib/clarify/sync";
import { AGREEMENT_STAGES, getApplicationBundle } from "@/lib/joey/queries";
import { CONTACT_EMAIL, EDITABLE_FIELDS, type ApplicationDraft } from "@/lib/joey/application";
import { PageHeader, SectionHeader } from "@/components/app-shell";
import { ApplicationForm } from "@/components/application/application-form";
import { ApplicationSummary } from "@/components/application/application-summary";
import { JourneyBar } from "@/components/application/journey-bar";
import { StageStatus, journeySteps } from "@/components/application/journey";

// The one onboarding page: the whole journey across the top, and below it
// either the application form (draft) or where things stand (submitted).
export default function JoeyApplicationPage() {
  return (
    <>
      {/* Pinned, with the journey bar right under it (the bar sticks at top-12). */}
      <PageHeader title="My Application" className="sticky top-0 z-30 bg-background" />
      <Suspense>
        <ApplicationContent />
      </Suspense>
    </>
  );
}

async function ApplicationContent() {
  const profile = await getProfile();
  await syncOnVisit(profile.id);
  const { application, references, stages, events, currentStage } = await getApplicationBundle();
  // From Match Ready on, the application lives in Agreements.
  if (application.status === "submitted" && AGREEMENT_STAGES.includes(currentStage.key)) redirect("/joey/agreements");
  const bar = <JourneyBar steps={journeySteps(stages, events, currentStage)} />;

  if (application.status === "submitted") {
    return (
      <>
        {bar}
        <StageStatus stages={stages} events={events} currentStage={currentStage} />
        <SectionHeader>Your application</SectionHeader>
        <ApplicationSummary
          application={application}
          email={profile.email}
          references={references}
          referencesEditable={currentStage.joey_can_edit_references}
          contactEmail={CONTACT_EMAIL}
        />
      </>
    );
  }

  const draft = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, application[k]])) as ApplicationDraft;
  return (
    <>
      {bar}
      <ApplicationForm
        initial={draft}
        email={profile.email}
        references={references}
        disclosuresSignedAt={{
          bg: application.bg_disclosure_signed_at,
          ca: application.ca_disclosure_signed_at,
          conduct: application.conduct_signed_at,
        }}
      />
    </>
  );
}
