import { cn } from "@/lib/utils";
import { formatCents, formatDate, formatSignedCents } from "@/lib/money";
import type { Statement } from "@/lib/payments/queries";

function title(s: Statement) {
  if (s.kind === "host_monthly") {
    const [y, m] = s.period_start.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return `Pay period ${formatDate(s.period_start, { year: false })} – ${formatDate(s.period_end)}`;
}

function statusOf(s: Statement, net: number): { label: string; dot: string } {
  if (net === 0) return { label: "Nothing due", dot: "bg-muted-foreground/40" };
  if (s.status === "draft") return { label: "Upcoming", dot: "bg-muted-foreground/60" };
  switch (s.payment?.status) {
    case "succeeded":
      return { label: net > 0 ? "Paid" : "Collected", dot: "bg-emerald-500" };
    case "failed":
      return { label: "Failed", dot: "bg-red-500" };
    case "processing":
      return { label: "Processing", dot: "bg-blue-500" };
    default:
      return { label: "Scheduled", dot: "bg-blue-500" };
  }
}

export function StatementList({ statements }: { statements: Statement[] }) {
  return (
    <ul className="divide-y">
      {statements.map((s) => {
        const net = s.lines.reduce((sum, l) => sum + l.amount_cents, 0);
        const status = statusOf(s, net);
        return (
          <li key={s.id}>
            <details className="group">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-4 px-6 py-3 text-sm",
                  "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                  "[&::-webkit-details-marker]:hidden",
                )}
              >
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", status.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{title(s)}</p>
                  <p className="text-xs text-muted-foreground">
                    {status.label}
                    {net !== 0 && `, ${formatDate(s.pay_date)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("tabular-nums font-medium", net > 0 && "text-emerald-500")}>
                    {formatCents(Math.abs(net))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {net > 0 ? "to you" : net < 0 ? "you owe" : ""}
                  </p>
                </div>
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                >
                  <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </summary>

              <table className="mb-3 ml-12 mr-6 w-[calc(100%-4.5rem)] text-xs">
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
                      <td
                        className={cn(
                          "whitespace-nowrap py-1.5 text-right tabular-nums",
                          l.amount_cents < 0 && "text-muted-foreground",
                        )}
                      >
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
            </details>
          </li>
        );
      })}
    </ul>
  );
}
