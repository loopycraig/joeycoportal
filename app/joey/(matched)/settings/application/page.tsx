import { Suspense } from "react";
import { getProfile } from "@/lib/profile";
import { getApplicationBundle } from "@/lib/joey/queries";
import { CONTACT_EMAIL } from "@/lib/joey/application";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { ApplicationSummary } from "@/components/application/application-summary";
import { SettingsTabs } from "../settings-tabs";

export default function JoeySettingsApplicationPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <Suspense>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const profile = await getProfile();
  const { application, references } = await getApplicationBundle();
  if (application.status !== "submitted") {
    return (
      <EmptyState title="Your application isn't in the portal">
        You applied before the portal existed. To update your details, email {CONTACT_EMAIL}.
      </EmptyState>
    );
  }
  return (
    <ApplicationSummary
      application={application}
      email={profile.email}
      references={references}
      referencesEditable={false}
      contactEmail={CONTACT_EMAIL}
    />
  );
}
