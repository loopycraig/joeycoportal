import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-parts";
import { DisclosureDocument } from "@/components/application/disclosure-signer";
import { DISCLOSURES } from "@/lib/joey/disclosures";
import { getApplicationBundle } from "@/lib/joey/queries";

// The background check disclosures and Code of Conduct the Joey signed while applying, read-only.
export default function JoeyAcknowledgementsPage() {
  return (
    <>
      <PageHeader title="Acknowledgements" />
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
  const { application: a } = await getApplicationBundle();
  const printedName = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const sig = {
    bg: { signature: a.bg_disclosure_signature, signedAt: a.bg_disclosure_signed_at },
    ca: { signature: a.ca_disclosure_signature, signedAt: a.ca_disclosure_signed_at, copyRequested: a.ca_report_copy_requested },
    conduct: { signature: a.conduct_signature, signedAt: a.conduct_signed_at },
  };
  return (
    <div className="divide-y">
      {DISCLOSURES.filter((d) => sig[d.id].signature).map((d) => (
        <section key={d.id} id={d.id} className="mx-auto max-w-2xl scroll-mt-4 px-4 py-8 sm:px-6">
          <DisclosureDocument disclosure={d} current={sig[d.id]} printedName={printedName} />
        </section>
      ))}
    </div>
  );
}
