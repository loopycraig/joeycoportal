import { createClient } from "@/lib/supabase/server";

export type Person = { full_name: string | null; email: string };

export type Terms = {
  id: string;
  effective_date: string;
  /** Either can be missing until its agreement is signed. */
  hourly_rate_cents: number | null;
  monthly_rent_cents: number | null;
  status: "proposed" | "accepted" | "declined" | "withdrawn" | "superseded";
  note: string | null;
  proposed_by: string;
  proposed_at: string;
  responded_at: string | null;
};

export type MatchWithTerms = {
  id: string;
  started_at: string;
  other: Person | null;
  terms: Terms[];
};

export type PaymentLine = {
  id: string;
  kind: string;
  description: string;
  quantity: number | null;
  unit_amount_cents: number | null;
  amount_cents: number;
  service_start: string | null;
};

export type Statement = {
  id: string;
  kind: "payroll" | "host_monthly";
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "approved" | "processed";
  lines: PaymentLine[];
  payment: { direction: "payout" | "charge"; amount_cents: number; status: string } | null;
};

/** Open matches for this user, with every version of their terms. */
export async function getMatchesWithTerms(userId: string, role: "joey" | "host"): Promise<MatchWithTerms[]> {
  const supabase = await createClient();
  const other = role === "host" ? "joey:profiles!matches_joey_id_fkey" : "host:profiles!matches_host_id_fkey";

  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, started_at, ${other}(full_name, email),
       match_terms(id, effective_date, hourly_rate_cents, monthly_rent_cents, status, note, proposed_by, proposed_at, responded_at)`,
    )
    .eq(role === "host" ? "host_id" : "joey_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  if (error) throw error;

  type Row = { id: string; started_at: string; joey?: Person; host?: Person; match_terms: Terms[] };
  return ((data ?? []) as unknown as Row[]).map((m) => ({
    id: m.id,
    started_at: m.started_at,
    other: (role === "host" ? m.joey : m.host) ?? null,
    terms: m.match_terms ?? [],
  }));
}

/** Every pay run this user appears in, newest first, with only their own lines. */
export async function getStatements(): Promise<Statement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_runs")
    .select(
      `id, kind, period_start, period_end, pay_date, status,
       payment_lines(id, kind, description, quantity, unit_amount_cents, amount_cents, service_start),
       payments(direction, amount_cents, status)`,
    )
    .order("pay_date", { ascending: false })
    .limit(36);
  if (error) throw error;

  type Row = Omit<Statement, "lines" | "payment"> & {
    payment_lines: PaymentLine[];
    payments: Statement["payment"][];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    period_start: r.period_start,
    period_end: r.period_end,
    pay_date: r.pay_date,
    status: r.status,
    lines: [...(r.payment_lines ?? [])].sort((a, b) => (a.service_start ?? "").localeCompare(b.service_start ?? "")),
    payment: r.payments?.[0] ?? null,
  }));
}
