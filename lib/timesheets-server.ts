import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleRow } from "@/lib/agreements/types";
import {
  scheduleFromContract,
  type PayScheduleKind,
  type Rate,
  type ScheduledDay,
} from "@/lib/timesheets";

export type OfferTerms = {
  schedule: ScheduledDay[] | null;
  ptoAmount: number | null;
  ptoUnit: "days" | "hours";
};

/** Pay and time-off terms from the match's signed offer letter, if there is one. */
export async function getOfferTerms(supabase: SupabaseClient, matchId: string): Promise<OfferTerms> {
  const empty: OfferTerms = { schedule: null, ptoAmount: null, ptoUnit: "days" };
  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, current_version")
    .eq("match_id", matchId)
    .eq("kind", "offer_letter")
    .eq("status", "executed")
    .order("executed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!agreement) return empty;

  const { data: version } = await supabase
    .from("agreement_versions")
    .select("fields")
    .eq("agreement_id", agreement.id)
    .eq("version", agreement.current_version)
    .maybeSingle();
  const f = (version?.fields ?? {}) as Record<string, unknown>;
  const amount = Number(f.pto_amount);
  return {
    schedule: scheduleFromContract(Array.isArray(f.schedule) ? (f.schedule as ScheduleRow[]) : null),
    ptoAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
    ptoUnit: f.pto_unit === "hours" ? "hours" : "days",
  };
}

export async function getRates(supabase: SupabaseClient, matchIds: string[]): Promise<Map<string, Rate[]>> {
  const out = new Map<string, Rate[]>();
  if (matchIds.length === 0) return out;
  const { data, error } = await supabase
    .from("match_terms")
    .select("match_id, effective_date, hourly_rate_cents")
    .in("match_id", matchIds)
    .eq("status", "accepted");
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const list = out.get(r.match_id) ?? [];
    list.push({ effective_date: r.effective_date, hourly_rate_cents: r.hourly_rate_cents });
    out.set(r.match_id, list);
  }
  return out;
}

/** Hours in the PTO ledger per match (grants are added here first, so anniversaries are current). */
export async function getPtoBalances(supabase: SupabaseClient, matchIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (matchIds.length === 0) return out;
  await Promise.all(matchIds.map((id) => supabase.rpc("pto_sync_grants", { p_match: id })));
  const { data, error } = await supabase.from("pto_ledger").select("match_id, hours").in("match_id", matchIds);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) out.set(r.match_id, (out.get(r.match_id) ?? 0) + Number(r.hours));
  return out;
}

export type ScheduleInfo = {
  current: PayScheduleKind;
  next: { kind: PayScheduleKind; from: string } | null;
};

/** Each match's pay schedule today, and any change already set for later. */
export async function getPaySchedules(
  supabase: SupabaseClient,
  matchIds: string[],
  today: string,
): Promise<Map<string, ScheduleInfo>> {
  const out = new Map<string, ScheduleInfo>(matchIds.map((id) => [id, { current: "semimonthly", next: null }]));
  if (matchIds.length === 0) return out;
  const { data, error } = await supabase
    .from("pay_schedules")
    .select("match_id, effective_from, kind")
    .in("match_id", matchIds)
    .order("effective_from");
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const info = out.get(r.match_id)!;
    if (r.effective_from <= today) info.current = r.kind;
    else if (!info.next) info.next = { kind: r.kind, from: r.effective_from };
  }
  return out;
}

export async function getToday(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("local_today");
  if (error) throw new Error(error.message);
  return data as string;
}
