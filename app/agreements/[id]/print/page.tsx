import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getAgreement, personLabel } from "@/lib/agreements/queries";
import { KIND_LABEL } from "@/lib/agreements/fields";
import { AgreementDocument, stamp } from "@/components/agreements/agreement-document";
import { AgreementHistory } from "@/components/agreements/agreement-history";
import { PrintButton } from "@/components/agreements/print-button";

// A clean copy of an agreement to print or save as PDF, with its signatures and audit trail.
// Either party can open it; RLS decides.
export default function PrintAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl bg-background px-6 py-10 text-foreground print:max-w-none print:px-0 print:py-0">
      <Suspense>
        <Copy params={params} />
      </Suspense>
    </main>
  );
}

async function Copy({ params }: { params: Promise<{ id: string }> }) {
  await getProfile(); // signed in
  const { id } = await params;
  const a = await getAgreement(id);
  if (!a) notFound();
  const v = a.versions.find((x) => x.version === a.current_version);
  if (!v) notFound();

  const hostName = personLabel(a.host);
  const joeyName = personLabel(a.joey);
  const names = { host: hostName, joey: joeyName };
  const actors: Record<string, string> = { [a.host_id]: hostName, ...(a.joey_id ? { [a.joey_id]: joeyName } : {}) };

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-medium">{KIND_LABEL[a.kind]}</p>
          <p className="text-xs text-muted-foreground">
            Version {v.version} · {a.status === "executed" && a.executed_at ? `Signed by everyone ${stamp(a.executed_at)}` : "Not fully signed yet"}
          </p>
        </div>
        <PrintButton />
      </div>

      <AgreementDocument
        blocks={v.rendered}
        signatures={a.signatures.filter((s) => s.version === v.version)}
        names={names}
        highlight={false}
      />

      <section className="mt-10 break-before-page space-y-3 border-t pt-6 font-sans">
        <h2 className="text-sm font-semibold">Signing record</h2>
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Document</dt>
          <dd>
            {KIND_LABEL[a.kind]}, version {v.version} ({v.template_version})
          </dd>
          <dt className="text-muted-foreground">Fingerprint (SHA-256)</dt>
          <dd className="break-all">{v.content_hash}</dd>
          <dt className="text-muted-foreground">Agreement ID</dt>
          <dd>{a.id}</dd>
        </dl>
        <AgreementHistory events={a.events} names={actors} />
      </section>
    </>
  );
}
