import { cn } from "@/lib/utils";
import type { TimecardStatus } from "@/lib/timecards";

const STYLES: Record<TimecardStatus, { label: string; dot: string }> = {
  draft: { label: "Draft", dot: "bg-muted-foreground/60" },
  submitted: { label: "Submitted", dot: "bg-amber-400" },
  approved: { label: "Approved", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", dot: "bg-red-500" },
};

export function StatusPill({ status }: { status: TimecardStatus }) {
  const { label, dot } = STYLES[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      {label}
    </span>
  );
}
