import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { AgreementList, type ListItem } from "@/components/agreements/agreement-list";
import { toListItem } from "@/components/agreements/agreement-view";
import { JourneyBar } from "@/components/application/journey-bar";
import { StageStatus, journeySteps } from "@/components/application/journey";
import { listMyAgreements } from "@/lib/agreements/queries";
import { getApplicationBundle, isMatched } from "@/lib/joey/queries";
import { DISCLOSURES } from "@/lib/joey/disclosures";

export default function JoeyAgreementsPage() {
  return (
    <>
      <PageHeader title="Agreements" className="sticky top-0 z-30 bg-background" />
      <Suspense>
        <Content />
      </Suspense>
    </>
  );
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

async function Content() {
  const [agreements, bundle, matched] = await Promise.all([listMyAgreements(), getApplicationBundle(), isMatched()]);
  const { application: a, stages, events, currentStage } = bundle;

  // What the Joey signed while applying, kept here with everything else they've signed.
  const signedAt = { bg: a.bg_disclosure_signed_at, ca: a.ca_disclosure_signed_at, conduct: a.conduct_signed_at };
  const signature = { bg: a.bg_disclosure_signature, ca: a.ca_disclosure_signature, conduct: a.conduct_signature };
  const onboarding: ListItem[] =
    a.status === "submitted"
      ? [
          {
            key: "application",
            href: "/joey/agreements/application",
            title: "Your application",
            detail: a.submitted_at ? `Submitted ${day(a.submitted_at)}` : undefined,
            status: "Submitted",
            tone: "done",
            section: "active",
          },
          ...DISCLOSURES.filter((d) => signature[d.id]).map(
            (d): ListItem => ({
              key: d.id,
              href: `/joey/agreements/acknowledgements#${d.id}`,
              title: d.name,
              detail: signedAt[d.id] ? `Signed ${day(signedAt[d.id])}` : "Signed",
              status: "Signed",
              tone: "done",
              section: "active",
            }),
          ),
        ]
      : [];

  return (
    <>
      {!matched && (
        <>
          <JourneyBar steps={journeySteps(stages, events, currentStage)} />
          <StageStatus stages={stages} events={events} currentStage={currentStage} />
        </>
      )}
      <AgreementList items={[...agreements.map((x) => toListItem(x, "joey")), ...onboarding]} />
    </>
  );
}
