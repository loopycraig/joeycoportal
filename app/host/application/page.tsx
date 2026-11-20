import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { syncHostOnVisit } from "@/lib/clarify/host-sync";
import { getHostApplicationBundle, hostHasMatch } from "@/lib/host/queries";
import { HOST_EDITABLE_FIELDS, type HostApplicationDraft } from "@/lib/host/application";
import { PageHeader } from "@/components/app-shell";
import { HostApplicationForm } from "@/components/host-application/host-application-form";
import { HostApplicationStatus } from "@/components/host-application/host-application-status";

// A Host's one page before they're matched: the sign-up questions (draft), then where things stand.
export default function HostApplicationPage() {
  return (
    <>
      <PageHeader title="Getting Started" />
      <Suspense>
        <HostApplicationContent />
      </Suspense>
    </>
  );
}

async function HostApplicationContent() {
  // Matched Hosts use the full portal.
  if (await hostHasMatch()) redirect("/host");
  const profile = await getProfile();
  await syncHostOnVisit(profile.id);
  const { application, stages, events, currentStage } = await getHostApplicationBundle();

  if (application.status === "submitted") {
    return (
      <HostApplicationStatus
        application={application}
        email={profile.email}
        stages={stages}
        events={events}
        currentStage={currentStage}
      />
    );
  }

  const draft = Object.fromEntries(HOST_EDITABLE_FIELDS.map((k) => [k, application[k]])) as HostApplicationDraft;
  return <HostApplicationForm initial={draft} email={profile.email} />;
}
