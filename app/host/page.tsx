import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageHeader } from "@/components/page-parts";
import { ReviewQueue } from "@/components/review-queue";
import { TIMECARD_FIELDS, type Timecard } from "@/lib/timecards";

export default function HostReviewPage() {
  return (
    <Suspense fallback={<PageHeader title="Review" />}>
      <ReviewData />
    </Suspense>
  );
}

async function ReviewData() {
  const profile = await getProfile();
  const supabase = await createClient();
  const fields = `${TIMECARD_FIELDS}, joey:profiles!timecards_joey_id_fkey(full_name, email)`;

  const [pending, reviewed] = await Promise.all([
    supabase
      .from("timecards")
      .select(fields)
      .eq("host_id", profile.id)
      .eq("status", "submitted")
      .order("work_date", { ascending: true }),
    supabase
      .from("timecards")
      .select(fields)
      .eq("host_id", profile.id)
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(25),
  ]);

  if (pending.error) throw new Error(pending.error.message);
  if (reviewed.error) throw new Error(reviewed.error.message);

  return (
    <ReviewQueue
      pending={pending.data as unknown as Timecard[]}
      reviewed={reviewed.data as unknown as Timecard[]}
    />
  );
}
