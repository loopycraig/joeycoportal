import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { AgreementView } from "@/components/agreements/agreement-view";
import { getProfile } from "@/lib/profile";

export default function JoeyAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageHeader title="Agreement" />}>
      <View params={params} />
    </Suspense>
  );
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getProfile()]);
  return <AgreementView id={id} viewer="joey" profileId={profile.id} />;
}
