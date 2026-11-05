export type TimecardStatus = "draft" | "submitted" | "approved" | "rejected";

export type Person = { full_name: string | null; email: string } | null;

export type Timecard = {
  id: string;
  match_id: string;
  host_id: string;
  joey_id: string;
  work_date: string; // YYYY-MM-DD
  hours: number;
  notes: string | null;
  status: TimecardStatus;
  review_note: string | null;
  host?: Person;
  joey?: Person;
};

export const TIMECARD_FIELDS =
  "id, match_id, host_id, joey_id, work_date, hours, notes, status, review_note";

export function personName(p: Person | undefined) {
  return p?.full_name || p?.email || "Unknown";
}

// work_date has no time zone, so build it as a local date to avoid off-by-one days
export function formatWorkDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatHours(h: number) {
  return `${Number(h).toFixed(2).replace(/\.?0+$/, "")}h`;
}

export function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
