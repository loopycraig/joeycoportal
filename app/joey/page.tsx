import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { JoeyTimecards, type OpenMatch } from "@/components/joey-timecards";
import { TIMECARD_FIELDS, personName, type Person, type Timecard } from "@/lib/timecards";

export default function JoeyTimecardsPage() {
  return (
    <Suspense fallback={<PageHeader title="Timecards" />}>
      <TimecardsData />
    </Suspense>
  );
}

async function TimecardsData() {
  const profile = await getProfile();
  const supabase = await createClient();

  const [cards, matches] = await Promise.all([
    supabase
      .from("timecards")
      .select(`${TIMECARD_FIELDS}, host:profiles!timecards_host_id_fkey(full_name, email)`)
      .eq("joey_id", profile.id)
      .order("work_date", { ascending: false })
      .limit(200),
    supabase
      .from("matches")
      .select("id, host_id, host:profiles!matches_host_id_fkey(full_name, email)")
      .eq("joey_id", profile.id)
      .is("ended_at", null)
      .order("started_at", { ascending: true }),
  ]);

  if (cards.error) throw new Error(cards.error.message);
  if (matches.error) throw new Error(matches.error.message);

  const openMatches: OpenMatch[] = (
    matches.data as unknown as { id: string; host_id: string; host: Person }[]
  ).map((m) => ({ id: m.id, host_id: m.host_id, hostName: personName(m.host) }));

  return (
    <JoeyTimecards
      joeyId={profile.id}
      timecards={cards.data as unknown as Timecard[]}
      openMatches={openMatches}
    />
  );
}
