const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 12345 → "$123.45" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 12345 → "+$123.45", -12345 → "−$123.45" */
export function formatSignedCents(cents: number): string {
  if (cents === 0) return usd.format(0);
  return `${cents > 0 ? "+" : "−"}${usd.format(Math.abs(cents) / 100)}`;
}

/** "1,234.5" → 123450. Returns null if it isn't a valid, non-negative amount. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** "2026-11-20" → "Nov 20, 2026" (date-only strings, no timezone shift) */
export function formatDate(isoDate: string, opts: { year?: boolean } = { year: true }): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** Today's date as "YYYY-MM-DD" in the given timezone */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
