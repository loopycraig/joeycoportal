// Renders a frozen agreement (RenderedBlock[]) with its signatures. Server- and client-safe.

import { cn } from "@/lib/utils";
import type { Party, RenderedBlock, Run } from "@/lib/agreements/types";

export type ShownSignature = {
  party: Party;
  typed_name: string;
  signer_title?: string | null;
  signed_at: string | null;
};

const PARTY_LABEL: Record<Party, string> = { joey: "Joey", host: "Host", joeyco: "JoeyCo, Inc." };

export const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });

function Runs({ runs, highlight }: { runs: Run[]; highlight: boolean }) {
  return (
    <>
      {runs.map((r, i) => (
        <span
          key={i}
          className={cn(
            r.b && "font-semibold",
            r.u && "underline underline-offset-2",
            r.box && "mr-1 font-sans",
            r.empty && "text-muted-foreground",
            r.f && highlight && "rounded-sm bg-amber-100 px-0.5 text-foreground dark:bg-amber-400/20",
          )}
        >
          {r.s}
        </span>
      ))}
    </>
  );
}

export function AgreementDocument({
  blocks,
  signatures,
  names,
  highlight = true,
  className,
}: {
  blocks: RenderedBlock[];
  signatures: ShownSignature[];
  /** Printed names under each signature line. */
  names: Partial<Record<Party, string>>;
  /** Tint the filled-in values so they're easy to check. */
  highlight?: boolean;
  className?: string;
}) {
  return (
    <article className={cn("space-y-3 font-serif text-[15px] leading-relaxed", className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "title":
            return (
              <h3 key={i} className="pt-2 text-center font-sans text-sm font-semibold uppercase tracking-wide">
                <Runs runs={b.runs} highlight={highlight} />
              </h3>
            );
          case "sub":
            return (
              <p key={i} className="pt-1 font-semibold">
                <Runs runs={b.runs} highlight={highlight} />
              </p>
            );
          case "p":
            return (
              <p key={i} className={cn("flex gap-2", b.lvl === 1 && "pl-6", b.lvl === 2 && "pl-12")}>
                {b.n && <span className="shrink-0 tabular-nums">{b.n}</span>}
                <span>
                  <Runs runs={b.runs} highlight={highlight} />
                </span>
              </p>
            );
          case "li":
            return (
              <p key={i} className={cn("flex gap-2 pl-4", b.lvl === 1 && "pl-10")}>
                <span aria-hidden>•</span>
                <span>
                  <Runs runs={b.runs} highlight={highlight} />
                </span>
              </p>
            );
          case "box":
            return (
              <div key={i} className="whitespace-pre-wrap rounded-md border px-3 py-2">
                <Runs runs={b.runs} highlight={highlight} />
              </div>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse font-sans text-xs">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="border px-2 py-1 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((c, k) => (
                          <td key={k} className={cn("border px-2 py-1", k > 0 && highlight && c !== "—" && c && "bg-amber-100/60 dark:bg-amber-400/10")}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "signatures":
            return (
              <div key={i} className="grid gap-4 pt-2 font-sans text-sm sm:grid-cols-2">
                {b.parties.map((party) => {
                  const s = signatures.find((x) => x.party === party);
                  return (
                    <div key={party} className="space-y-1 rounded-md border px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide">{PARTY_LABEL[party]}</p>
                      <p className={cn("min-h-7 border-b font-serif text-lg italic", !s && "text-muted-foreground/50")}>
                        {s ? s.typed_name : "Not signed yet"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {party === "joeyco"
                          ? s
                            ? `${s.typed_name}${s.signer_title ? `, ${s.signer_title}` : ""}`
                            : "—"
                          : names[party] || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{s?.signed_at ? stamp(s.signed_at) : "Date: —"}</p>
                      {b.addendum && s && party === "joey" && (
                        <p className="text-xs text-muted-foreground">Addendum acknowledged with this signature</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          case "break":
            return <hr key={i} className="my-6 break-after-page border-dashed" />;
        }
      })}
    </article>
  );
}
