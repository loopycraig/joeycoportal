// The audit trail and versions of an agreement. Server-safe.

import { stamp } from "@/components/agreements/agreement-document";
import type { AgreementEvent } from "@/lib/agreements/queries";

const ACTION: Record<string, string> = {
  created: "Started",
  sent: "Sent for review",
  viewed: "Opened by the Joey",
  changes_requested: "Changes requested",
  signed: "Signed",
  countersigned: "Countersigned",
  voided: "Withdrawn",
  executed: "Signed by everyone",
  acknowledged: "Acknowledged by the Joey",
};

export function AgreementHistory({
  events,
  names,
  notice,
}: {
  events: AgreementEvent[];
  /** Notices are delivered and acknowledged, not reviewed and signed. */
  notice?: boolean;
  /** Actor id → name. */
  names: Record<string, string>;
}) {
  return (
    <ol className="space-y-3 text-sm">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="flex gap-3">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <div className="min-w-0">
            <p>
              {(notice && e.action === "sent" ? "Delivered to the Joey" : ACTION[e.action]) ?? e.action}
              {e.version ? <span className="text-muted-foreground"> · version {e.version}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.actor_id ? `${names[e.actor_id] ?? "Someone"} · ` : ""}
              {stamp(e.at)}
            </p>
            {e.comment && (
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">{e.comment}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
