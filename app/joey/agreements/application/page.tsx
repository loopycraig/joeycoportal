import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProfile } from "@/lib/profile";
import { getApplicationBundle } from "@/lib/joey/queries";
import { CONTACT_EMAIL } from "@/lib/joey/application";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { ApplicationSummary } from "@/components/application/application-summary";

export default function JoeyAgreementsApplicationPage() {
  return (
    <>
      <PageHeader title="Your application" />
      <div className="border-b px-4 py-2 sm:px-6">
        <Link href="/joey/agreements" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          All agreements
        </Link>
      </div>
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
