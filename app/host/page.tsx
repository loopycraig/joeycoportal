import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { HomeGrid } from "@/components/home/home-grid";
import { getHostHome } from "@/lib/home";

export default function HostHomePage() {
  return (
    <>
      <PageHeader title="Home" />
      <Suspense>
        <HostHome />
      </Suspense>
    </>
  );
}

async function HostHome() {
  return <HomeGrid cards={await getHostHome()} />;
}
