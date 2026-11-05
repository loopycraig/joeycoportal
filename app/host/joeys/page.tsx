import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { HostJoeys, type JoeyMatch } from "@/components/host-joeys";
import { personName, type Person } from "@/lib/timecards";

type MatchRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  joey: Person;
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function HostJoeysPage() {
  return (
    <Suspense fallback={<PageHeader title="Joeys" />}>
      <JoeysData />
    </Suspense>
  );
}

async function JoeysData() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("matches")
    .select("id, started_at, ended_at, joey:profiles!matches_joey_id_fkey(full_name, email)")
    .eq("host_id", profile.id)
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows: JoeyMatch[] = (data as unknown as MatchRow[]).map((m) => ({
    id: m.id,
    name: personName(m.joey),
    email: m.joey?.email ?? "",
    started: fmt(m.started_at),
    ended: m.ended_at ? fmt(m.ended_at) : null,
  }));

  return (
    <HostJoeys
      active={rows.filter((r) => r.ended === null)}
      ended={rows.filter((r) => r.ended !== null)}
    />
  );
}
