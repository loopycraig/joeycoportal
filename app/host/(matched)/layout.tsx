import { Suspense } from "react";
import { requireMatchedHost } from "@/lib/host/queries";

// The full Host portal. Hosts who haven't been matched with a Joey yet are sent to their application.
export default function MatchedHostLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireMatchedHost();
  return <>{children}</>;
}
