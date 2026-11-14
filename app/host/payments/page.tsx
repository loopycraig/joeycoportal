import { Suspense } from "react";
import { getProfile } from "@/lib/profile";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { getMatchesWithTerms, getStatements } from "@/lib/payments/queries";
import { MatchTermsList } from "@/components/payments/match-terms";
import { StatementList } from "@/components/payments/statement-list";
import { PayPeriodList } from "@/components/payments/pay-periods";
import { getPayPeriods } from "@/lib/payments/periods";

export default function HostPaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" />
      <SectionHeading>Pay by pay period</SectionHeading>
      <Suspense>
        <Periods />
      </Suspense>
      <SectionHeading>Agreed terms</SectionHeading>
      <Suspense>
        <Terms />
      </Suspense>
      <SectionHeading>JoeyCo statements (rent and fees)</SectionHeading>
      <Suspense>
        <Statements />
      </Suspense>
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="border-b px-6 pb-2 pt-6 text-xs font-medium text-muted-foreground">{children}</h2>;
}

async function Terms() {
  const profile = await getProfile();
  const matches = await getMatchesWithTerms(profile.id, "host");
  if (matches.length === 0) {
    return <EmptyState title="No active Joeys" />;
  }
  return <MatchTermsList matches={matches} userId={profile.id} role="host" />;
}

async function Statements() {
  const statements = await getStatements();
  if (statements.length === 0) {
    return <EmptyState title="No statements yet">Your monthly rent and fee statements show up here once billing starts.</EmptyState>;
  }
  return <StatementList statements={statements} />;
}

async function Periods() {
  const { today, periods } = await getPayPeriods("host");
  if (periods.length === 0) {
    return (
      <EmptyState title="No pay periods yet">
        Hours show up here by pay period once they&apos;re submitted, with when they&apos;re due and whether they&apos;re paid.
      </EmptyState>
    );
  }
  return <PayPeriodList periods={periods} role="host" today={today} />;
}
