// One agreement, for either party. Server component.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-parts";
import { Pill, type PillTone } from "@/components/status-pill";
import { AgreementDocument } from "@/components/agreements/agreement-document";
import { AgreementEditor } from "@/components/agreements/agreement-editor";
import { AgreementHistory } from "@/components/agreements/agreement-history";
import { ReviewPanel } from "@/components/agreements/review-panel";
import type { ListItem } from "@/components/agreements/agreement-list";
import { getAgreement, hasEsignConsent, personLabel, type AgreementSummary } from "@/lib/agreements/queries";
import { KIND_LABEL, needsAction, statusLabel, type Viewer } from "@/lib/agreements/fields";
import type { AgreementStatus } from "@/lib/agreements/types";

export function toneOf(status: AgreementStatus, mine: boolean): PillTone {
  if (status === "executed") return "done";
  if (status === "void") return "stopped";
  return mine ? "waiting" : "neutral";
}

export function toListItem(a: AgreementSummary, viewer: Viewer): ListItem {
  const mine = needsAction(a.status, viewer, a.kind);
  const other = a.kind === "host_services" ? "with JoeyCo" : viewer === "host" ? `with ${personLabel(a.joey)}` : `from ${personLabel(a.host)}`;
  const base = viewer === "host" ? "/host/agreements" : "/joey/agreements";
  return {
    key: a.id,
    href: `${base}/${a.id}`,
    title: KIND_LABEL[a.kind],
    detail: other + (a.section === "expired" && a.status === "executed" ? " · ended" : ""),
    status: statusLabel(a.status, viewer, a.kind),
    tone: toneOf(a.status, mine),
    action: mine,
    section: a.section,
  };
}

export async function AgreementView({ id, viewer, profileId }: { id: string; viewer: Viewer; profileId: string }) {
  const [a, consent] = await Promise.all([getAgreement(id), hasEsignConsent()]);
  if (!a) notFound();

  const base = viewer === "host" ? "/host/agreements" : "/joey/agreements";
  const hostName = personLabel(a.host);
  const joeyName = personLabel(a.joey);
  const names = { host: hostName, joey: joeyName };
  const actorNames: Record<string, string> = { [a.host_id]: hostName, ...(a.joey_id ? { [a.joey_id]: joeyName } : {}) };
  const current = a.versions.find((v) => v.version === a.current_version) ?? null;
  const sigs = a.signatures.filter((s) => s.version === a.current_version);
  const mine = needsAction(a.status, viewer, a.kind);

  const hostEditing =
    viewer === "host" &&
    profileId === a.host_id &&
    (a.kind === "host_services" ? a.status === "draft" : ["draft", "sent", "changes_requested"].includes(a.status));
  const reviewing =
    (viewer === "joey" && a.status === "sent") || (viewer === "host" && a.status === "awaiting_countersign");
  const lastRequest = [...a.events].reverse().find((e) => e.action === "changes_requested");

  return (
    <>
      <PageHeader
        title={KIND_LABEL[a.kind]}
        actions={
          <div className="flex items-center gap-3">
            <Pill label={statusLabel(a.status, viewer, a.kind)} tone={toneOf(a.status, mine)} />
            {current && (
              <Link href={`/agreements/${a.id}/print`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Printer className="size-3.5" aria-hidden />
                Printable copy
              </Link>
            )}
          </div>
        }
      />
      <div className="border-b px-4 py-2 sm:px-6">
        <Link href={base} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          All agreements
        </Link>
        {a.kind !== "host_services" && (
          <span className="ml-3 text-xs text-muted-foreground">
            {viewer === "host" ? `With ${joeyName}` : `From ${hostName}`}
            {current ? ` · version ${current.version}` : ""}
          </span>
        )}
      </div>

      {viewer === "host" && a.status === "changes_requested" && lastRequest?.comment && (
        <div className="border-b bg-amber-50 px-4 py-3 text-sm dark:bg-amber-400/10 sm:px-6">
          <p className="font-medium">{joeyName} asked for changes</p>
          <p className="mt-1 whitespace-pre-wrap">{lastRequest.comment}</p>
        </div>
      )}

      {hostEditing ? (
        <AgreementEditor
          id={a.id}
          kind={a.kind}
          status={a.status}
          initial={a.draft_fields}
          names={names}
          hasConsent={consent}
          hostName={hostName}
        />
      ) : current ? (
        <div className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {current.note && (
              <div className="mb-6 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground">What changed in version {current.version}</p>
                <p className="mt-1 whitespace-pre-wrap">{current.note}</p>
              </div>
            )}
            <AgreementDocument blocks={current.rendered} signatures={sigs} names={names} highlight={a.status !== "executed"} className="max-w-2xl" />
          </div>
          <aside className="space-y-6">
            {reviewing && (
              <ReviewPanel
                id={a.id}
                kind={a.kind}
                role={viewer}
                version={current.version}
                contentHash={current.content_hash}
                printedName={viewer === "host" ? hostName : joeyName}
                hasConsent={consent}
              />
            )}
            {viewer === "joey" && a.status === "changes_requested" && (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                You asked for changes. Your Host will send a new version to review.
              </p>
            )}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">History</h3>
              <AgreementHistory events={a.events} names={actorNames} />
              <p className="break-all pt-2 text-[11px] text-muted-foreground">
                Version {current.version} fingerprint (SHA-256): {current.content_hash}
              </p>
            </section>
          </aside>
        </div>
      ) : (
        <p className="px-6 py-10 text-sm text-muted-foreground">This agreement hasn&apos;t been sent yet.</p>
      )}
    </>
  );
}
