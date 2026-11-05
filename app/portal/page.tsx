import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { homeFor } from "@/lib/roles";

// Everyone lands here after logging in; send them where they belong.
export default function PortalPage() {
  return (
    <Suspense>
      <PortalRedirect />
    </Suspense>
  );
}

async function PortalRedirect() {
  const profile = await getProfile();
  redirect(homeFor(profile.role));
  return null;
}
