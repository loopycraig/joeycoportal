// Rent, month by month: what the Joey pays the Host directly, when it's due (as the signed Housing
// License says) and whether the Host has received it. Server only.

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { personName, type Person } from "@/lib/people";
import { getToday } from "@/lib/timesheets-server";

import type { RentPayment } from "@/lib/payments/rent-status";
export type { RentPayment };

/** "Due" this many days ahead. */
const DUE_SOON_DAYS = 7;

export async function getRentPayments(role: "host" | "joey"): Promise<{ today: string; payments: RentPayment[] }> {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const today = await getToday(supabase);
  const other = role === "host" ? "other:profiles!matches_joey_id_fkey" : "other:profiles!matches_host_id_fkey";
  const { data, error } = await supabase
    .from("matches")
    .select(`id, ${other}(full_name, email)`)
    .eq(role === "host" ? "host_id" : "joey_id", profile.id);
  if (error) throw new Error(error.message);
  const matches = data as unknown as { id: string; other: Person }[];

  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + DUE_SOON_DAYS);
  const soonIso = soon.toISOString().slice(0, 10);

  const lists = await Promise.all(
    matches.map(async (m) => {
      const { data, error } = await supabase.rpc("match_rent_schedule", { p_match: m.id });
      if (error) throw new Error(error.message);
      type Row = {
        month: string;
        due_on: string;
        amount_cents: number;
        received_on: string | null;
        late_from: string | null;
        late_fee_cents: number | null;
        payment_method: string | null;
      };
      return (data as Row[]).map((r): RentPayment => ({
        key: `${m.id}-${r.month}`,
        matchId: m.id,
        otherName: personName(m.other),
        month: r.month,
        dueOn: r.due_on,
        amountCents: r.amount_cents,
        receivedOn: r.received_on,
        lateFrom: r.late_from,
        lateFeeCents: r.late_fee_cents,
        paymentMethod: r.payment_method,
        status: r.received_on
          ? "received"
          : r.late_from && r.late_from <= today
            ? "late"
            : r.due_on < today
              ? "overdue"
              : r.due_on <= soonIso
                ? "due"
                : "upcoming",
      }));
    }),
  );

  // Newest month first, as on Pay by pay period.
  const payments = lists.flat().sort((a, b) => b.dueOn.localeCompare(a.dueOn) || a.otherName.localeCompare(b.otherName));
  return { today, payments };
}
