import { Suspense } from "react";
import { requireMatchedJoey } from "@/lib/joey/queries";

// Home, Timesheets, Payments, My Host and Settings. Joeys without a match are sent to their application.
export default function MatchedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireMatchedJoey();
  return <>{children}</>;
}
