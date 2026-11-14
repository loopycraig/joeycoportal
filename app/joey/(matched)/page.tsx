import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { HomeGrid } from "@/components/home/home-grid";
import { getJoeyHome } from "@/lib/home";

export default function JoeyHomePage() {
  return (
    <>
      <PageHeader title="Home" />
      <Suspense>
        <JoeyHome />
      </Suspense>
    </>
  );
}

async function JoeyHome() {
  return <HomeGrid cards={await getJoeyHome()} />;
}
