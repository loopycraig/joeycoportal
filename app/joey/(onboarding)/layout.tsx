import { Suspense } from "react";
import { requireUnmatchedJoey } from "@/lib/joey/queries";

// Onboarding pages. Matched Joeys are sent to their normal home.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireUnmatchedJoey();
  return <>{children}</>;
}
