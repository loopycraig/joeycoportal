import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { MatchList } from "@/components/match-list";

type MatchRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  host: { full_name: string | null; email: string } | null;
};

export default function JoeyHostsPage() {
  return (
    <>
      <PageHeader title="Hosts" />
      <Suspense>
        <HostList />
      </Suspense>
    </>
  );
}

async function HostList() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("matches")
    .select("id, started_at, ended_at, host:profiles!matches_host_id_fkey(full_name, email)")
    .eq("joey_id", profile.id)
    .order("started_at", { ascending: false });

  const matches = (data ?? []) as unknown as MatchRow[];

  if (matches.length === 0) {
    return (
      <EmptyState title="You're not matched with a Host yet">
        Ask your Host to add you using {profile.email}.
      </EmptyState>
    );
  }

  return (
    <MatchList
      rows={matches.map((m) => ({
        id: m.id,
        name: m.host?.full_name || m.host?.email || "Unknown",
        email: m.host?.email ?? "",
        started_at: m.started_at,
        ended_at: m.ended_at,
      }))}
    />
  );
}
