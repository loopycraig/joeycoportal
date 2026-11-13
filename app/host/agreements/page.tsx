import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { AgreementList } from "@/components/agreements/agreement-list";
import { NewAgreementButton } from "@/components/agreements/new-agreement";
import { toListItem } from "@/components/agreements/agreement-view";
import { activeMatchesForHost, listMyAgreements } from "@/lib/agreements/queries";
import { ensureHostServices } from "@/lib/agreements/actions";

export default function HostAgreementsPage() {
  return (
    <Suspense fallback={<PageHeader title="Agreements" />}>
      <HostAgreements />
    </Suspense>
  );
}

async function HostAgreements() {
  // Every Host has a Host Services Agreement to sign; make sure it's in the list.
  await ensureHostServices();
  const [agreements, matches] = await Promise.all([listMyAgreements(), activeMatchesForHost()]);
  return (
    <>
      <PageHeader title="Agreements" actions={<NewAgreementButton matches={matches} />} />
      <p className="border-b px-4 py-3 text-sm text-muted-foreground sm:px-6">
        Fill in and send each Joey their Employment Offer Letter and Housing License Agreement. They review, ask for changes or
        sign, and then you sign to put it in effect.
      </p>
      <AgreementList items={agreements.map((a) => toListItem(a, "host"))} />
    </>
  );
}
