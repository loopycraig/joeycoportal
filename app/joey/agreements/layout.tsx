import { Suspense } from "react";
import { redirect } from "next/navigation";
import { agreementsUnlocked } from "@/lib/joey/queries";

// Agreements opens at Match Ready (or once matched). Before that, Joeys stay on their application.
export default function JoeyAgreementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  if (!(await agreementsUnlocked())) redirect("/joey/application");
  return <>{children}</>;
}
