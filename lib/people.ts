export type Person = { full_name: string | null; email: string } | null;

export function personName(p: Person | undefined) {
  return p?.full_name || p?.email || "Unknown";
}
