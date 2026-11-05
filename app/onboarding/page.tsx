import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { homeFor } from "@/lib/roles";
import { OnboardingForm } from "@/components/onboarding-form";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Suspense>
          <Onboarding />
        </Suspense>
      </div>
    </div>
  );
}

async function Onboarding() {
  const profile = await getProfile();
  if (profile.role) redirect(homeFor(profile.role));
  return <OnboardingForm defaultName={profile.full_name ?? ""} />;
}
