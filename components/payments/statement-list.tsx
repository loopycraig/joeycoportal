import { cn } from "@/lib/utils";
import { formatCents, formatDate, formatSignedCents } from "@/lib/money";
import type { PillTone } from "@/components/status-pill";
import type { Statement } from "@/lib/payments/queries";

export const statementNet = (s: Statement) => s.lines.reduce((sum, l) => sum + l.amount_cents, 0);

/** What a statement covers: a month of fees, or a pay period. */
export function statementTitle(s: Statement) {
  if (s.kind === "host_monthly") {
    const [y, m] = s.period_start.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return `Pay period ${formatDate(s.period_start, { year: false })} – ${formatDate(s.period_end)}`;
}

/** Where a statement stands, and whether it's settled (nothing left to pay or collect). */
export function statementStatus(s: Statement): { label: string; tone: PillTone; settled: boolean } {
  const net = statementNet(s);
  if (net === 0) return { label: "Nothing due", tone: "neutral", settled: true };
  if (s.status === "draft") return { label: "Upcoming", tone: "neutral", settled: false };
  switch (s.payment?.status) {
    case "succeeded":
      return { label: net > 0 ? "Paid" : "Collected", tone: "done", settled: true };
    case "failed":
      return { label: "Failed", tone: "stopped", settled: false };
    case "processing":
      return { label: "Processing", tone: "waiting", settled: false };
    default:
      return { label: "Scheduled", tone: "waiting", settled: false };
  }
}

/** A JoeyCo statement's lines and what it nets to. */
export function StatementDetail({ statement: s }: { statement: Statement }) {
  const net = statementNet(s);
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-border/50">
        {s.lines.map((l) => (
          <tr key={l.id}>
            <td className="py-1.5 pr-4">
              {l.description}
              {l.quantity !== null && l.unit_amount_cents !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  ({Number(l.quantity)} hrs at {formatCents(l.unit_amount_cents)})
                </span>
              )}
            </td>
            <td className={cn("whitespace-nowrap py-1.5 text-right tabular-nums", l.amount_cents < 0 && "text-muted-foreground")}>
              {formatSignedCents(l.amount_cents)}
            </td>
          </tr>
        ))}
        <tr className="font-medium">
          <td className="py-1.5 pr-4">{net >= 0 ? "Paid to you" : "You owe"}</td>
          <td className="py-1.5 text-right tabular-nums">{formatCents(Math.abs(net))}</td>
        </tr>
      </tbody>
    </table>
  );
}
