import { formatHours, formatMoney, type Totals } from "@/lib/timesheets";

/** Hours by type and the estimated gross, as a compact strip. */
export function WeekTotals({ totals, label = "Estimated gross" }: { totals: Totals; label?: string }) {
  const cells: [string, string][] = [
    ["Regular", formatHours(totals.regular)],
    ["Overtime", formatHours(totals.overtime)],
  ];
  if (totals.pto) cells.push(["PTO", formatHours(totals.pto)]);
  if (totals.sick) cells.push(["Sick", formatHours(totals.sick)]);
  if (totals.holiday) cells.push(["Holiday", formatHours(totals.holiday)]);

  return (
    <div className="flex flex-col gap-1">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="ml-auto text-right">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{totals.missingRate && totals.grossCents === 0 ? "—" : formatMoney(totals.grossCents)}</dd>
        </div>
      </dl>
      <p className="text-right text-xs text-muted-foreground">
        {totals.missingRate
          ? "Some days have no agreed hourly rate yet, so this is incomplete."
          : "Before taxes. Poppins calculates the final pay."}
      </p>
    </div>
  );
}
