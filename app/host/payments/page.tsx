import { Suspense } from "react";
import { getProfile } from "@/lib/profile";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { getMatchesWithTerms, getStatements } from "@/lib/payments/queries";
import { MatchTermsList } from "@/components/payments/match-terms";
import { StatementList } from "@/components/payments/statement-list";
import { PayPeriodList } from "@/components/payments/pay-periods";
import { getPayPeriods } from "@/lib/payments/periods";
import { RentPaymentList } from "@/components/payments/rent-payments";
import { getRentPayments } from "@/lib/payments/rent";

export default function HostPaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" />
      <SectionHeading>Pay by pay period</SectionHeading>
      <Suspense>
        <Periods />
      </Suspense>
      <SectionHeading>Rent</SectionHeading>
      <Suspense>
        <Rent />
      </Suspense>
      <SectionHeading>Agreed terms</SectionHeading>
      <Suspense>
        <Terms />
      </Suspense>
      <SectionHeading>JoeyCo statements (fees)</SectionHeading>
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
    return <EmptyState title="No statements yet">Your monthly JoeyCo fee statements show up here once billing starts. Rent is between you and your Joey, under Rent above.</EmptyState>;
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

async function Rent() {
  const { today, payments } = await getRentPayments("host");
  if (payments.length === 0) {
    return <EmptyState title="No rent due yet">Each month&apos;s rent from your Joey shows up here, with when it&apos;s due under the housing license.</EmptyState>;
  }
  return <RentPaymentList payments={payments} role="host" today={today} />;
}
