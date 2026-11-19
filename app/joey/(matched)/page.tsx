import { Suspense } from "react";
import { PageHeader } from "@/components/page-parts";
import { HomeGrid } from "@/components/home/home-grid";
import { JourneyBar } from "@/components/application/journey-bar";
import { StageStatus, journeySteps } from "@/components/application/journey";
import { getJoeyHome } from "@/lib/home";
import { PRE_MOVE_IN_STAGES, getApplicationBundle } from "@/lib/joey/queries";

export default function JoeyHomePage() {
  return (
    <>
      <PageHeader title="Home" className="sticky top-0 z-30 bg-background" />
      <Suspense>
        <JoeyHome />
      </Suspense>
    </>
  );
}

// Until move-in, Home leads with the journey: signing the agreements, then preparing to move in.
async function JoeyHome() {
  const [cards, { stages, events, currentStage }] = await Promise.all([getJoeyHome(), getApplicationBundle()]);
  const beforeMoveIn = PRE_MOVE_IN_STAGES.includes(currentStage.key);
  return (
    <>
      {beforeMoveIn && (
        <>
          <JourneyBar steps={journeySteps(stages, events, currentStage)} />
          <StageStatus stages={stages} currentStage={currentStage} />
        </>
      )}
      <HomeGrid cards={cards} />
    </>
  );
}
