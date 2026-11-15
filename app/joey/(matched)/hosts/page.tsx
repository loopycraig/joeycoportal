import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { PageTabs } from "@/components/page-tabs";
import { MatchList } from "@/components/match-list";

type MatchRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  host: { full_name: string | null; email: string } | null;
  agreements: { kind: string; status: string }[];
};

export default function JoeyHostsPage() {
  return (
    <>
      <PageHeader title="My Host" />
      <Suspense>
        <HostList />
      </Suspense>
    </>
  );
}

async function HostList() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, started_at, ended_at, host:profiles!matches_host_id_fkey(full_name, email), agreements(kind, status)",
    )
    .eq("joey_id", profile.id)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);

  const matches = (data ?? []) as unknown as MatchRow[];

  if (matches.length === 0) {
    return (
      <EmptyState title="You're not matched with a Host yet">
        Ask your Host to add you using {profile.email}.
      </EmptyState>
    );
  }

  // Pending until both the offer letter and the housing license are signed.
  const agreed = (m: MatchRow) =>
    ["offer_letter", "housing_license"].every((k) => m.agreements.some((a) => a.kind === k && a.status === "executed"));
  const rows = (list: MatchRow[]) =>
    list.map((m) => ({
      id: m.id,
      name: m.host?.full_name || m.host?.email || "Unknown",
      email: m.host?.email ?? "",
      started_at: m.started_at,
      ended_at: m.ended_at,
    }));
  const tab = (list: MatchRow[], empty: string) =>
    list.length === 0 ? (
      <p className="border-b px-4 py-4 text-sm text-muted-foreground sm:px-6">{empty}</p>
    ) : (
      <div className="border-b">
        <MatchList rows={rows(list)} />
      </div>
    );

  const pending = matches.filter((m) => !m.ended_at && !agreed(m));
  const active = matches.filter((m) => !m.ended_at && agreed(m));
  const expired = matches.filter((m) => m.ended_at);

  return (
    <PageTabs
      defaultTab={pending.length > 0 ? "pending" : "active"}
      tabs={[
        {
          id: "pending",
          label: "Pending",
          count: pending.length,
          content: tab(pending, "Nothing pending. A match shows here until your offer letter and housing license are signed."),
        },
        { id: "active", label: "Active", content: tab(active, "No active Host.") },
        { id: "expired", label: "Expired", content: tab(expired, "No past Hosts.") },
      ]}
    />
  );
}
