import { StatusPill } from "@/components/status-pill";
import { formatHours, formatWorkDate, type TimecardStatus } from "@/lib/timecards";

// Phones: two lines (name + hours, then date + status).
// Wider screens: one row of columns (date, name, notes, hours, status).
export const timecardRowClass =
  "grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left text-sm sm:flex sm:px-6 sm:py-2.5";

export function TimecardRowCells({
  workDate,
  name,
  detail,
  hours,
  status,
}: {
  workDate: string;
  name: string;
  detail?: string | null;
  hours: number;
  status: TimecardStatus;
}) {
  return (
    <>
      <span className="truncate sm:order-2 sm:w-32 sm:shrink-0">{name}</span>
      <span className="text-right tabular-nums sm:order-4 sm:ml-auto sm:w-12 sm:shrink-0">
        {formatHours(hours)}
      </span>
      <span className="text-muted-foreground sm:order-1 sm:w-24 sm:shrink-0">
        {formatWorkDate(workDate)}
      </span>
      <span className="justify-self-end sm:order-5 sm:w-24 sm:shrink-0">
        <StatusPill status={status} />
      </span>
      <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:order-3 sm:block">
        {detail}
      </span>
    </>
  );
}
