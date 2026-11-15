// Payments, for a Host or a Joey: every payment they're part of in one list, split into Pending and
// Completed. An open wage or rent row ends with the agreed rate or rent behind it. Wages go Host → Joey, rent Joey → Host, and JoeyCo's fees
// between the Host and JoeyCo. Server only.

import { Suspense } from "react";
import { getProfile } from "@/lib/profile";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { PageTabs } from "@/components/page-tabs";
import { PaymentList, type PaymentItem } from "@/components/payments/payment-list";
import { PayPeriodDetail } from "@/components/payments/pay-periods";
import { RentDetail } from "@/components/payments/rent-payments";
import { StatementDetail, statementNet, statementStatus, statementTitle } from "@/components/payments/statement-list";
import { TermsFooter } from "@/components/payments/match-terms";
import type { PillTone } from "@/components/status-pill";
import { getPayPeriods, type PayPeriod, type PayStatus } from "@/lib/payments/periods";
import { getRentPayments } from "@/lib/payments/rent";
import { RENT_STATUS, monthName, type RentPayment } from "@/lib/payments/rent-status";
import { PAY_STATUS } from "@/lib/payments/pay-status";
import { getMatchesWithTerms, getStatements, type MatchWithTerms, type Statement } from "@/lib/payments/queries";
import { formatRange, formatShort } from "@/lib/timesheets";

type Role = "host" | "joey";
type Row = PaymentItem & { done: boolean; doneOn: string | null };
type Ctx = { role: Role; today: string; userId: string; matches: Map<string, MatchWithTerms> };

const YOU = "You";
const JOEYCO = "JoeyCo";

const PAY_TONE: Record<PayStatus, PillTone> = {
  paid: "done",
  overdue: "stopped",
  due: "waiting",
  needs_approval: "waiting",
  changes_requested: "stopped",
};

export function PaymentsPage({ role }: { role: Role }) {
  return (
    <>
      <PageHeader title="Payments" />
      <Suspense>
        <Tabs role={role} />
      </Suspense>
    </>
  );
}

async function Tabs({ role }: { role: Role }) {
  const profile = await getProfile();
  const [{ today, periods }, { payments: rent }, statements, matches] = await Promise.all([
    getPayPeriods(role),
    getRentPayments(role),
    role === "host" ? getStatements() : Promise.resolve([] as Statement[]),
    getMatchesWithTerms(profile.id, role),
  ]);

  const ctx: Ctx = { role, today, userId: profile.id, matches: new Map(matches.map((m) => [m.id, m])) };
  const rows: Row[] = [
    ...periods.map((p) => wageRow(p, ctx)),
    ...rent.map((p) => rentRow(p, ctx)),
    ...statements.map(feeRow),
  ];
  // Pending: soonest due first. Completed: most recent first.
  const pending = rows.filter((r) => !r.done).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const completed = rows
    .filter((r) => r.done)
    .sort((a, b) => (b.doneOn ?? b.dueOn ?? "").localeCompare(a.doneOn ?? a.dueOn ?? ""));

  return (
    <PageTabs
      tabs={[
        {
          id: "pending",
          label: "Pending",
          count: pending.length,
          content:
            pending.length > 0 ? (
              <PaymentList items={pending} />
            ) : (
              <EmptyState title="Nothing pending">
                Wages, rent{role === "host" ? " and JoeyCo fees" : ""} show up here until they&apos;re paid.
              </EmptyState>
            ),
        },
        {
          id: "completed",
          label: "Completed",
          content:
            completed.length > 0 ? (
              <PaymentList items={completed} />
            ) : (
              <EmptyState title="Nothing completed yet">Payments move here once they&apos;re paid.</EmptyState>
            ),
        },
      ]}
    />
  );
}

/** Wages for a pay period: the Host pays the Joey. */
function wageRow(p: PayPeriod, { role, today, userId, matches }: Ctx): Row {
  const match = matches.get(p.matchId);
  const host = role === "host";
  const submitted = p.entries.some((e) => e.status === "submitted");
  return {
    key: `pay-${p.id}`,
    direction: host ? "out" : "in",
    from: host ? YOU : p.otherName,
    to: host ? p.otherName : YOU,
    purpose: "Wages",
    purposeDetail: formatRange(p.periodStart, p.periodEnd),
    amountCents: p.paid ? p.paid.amountCents : p.totals.grossCents,
    amountNote: p.paid ? undefined : "est.",
    dueOn: p.payday,
    status: {
      label: p.paid ? `Paid ${formatShort(p.paid.on)}` : PAY_STATUS[p.status][role],
      tone: PAY_TONE[p.status],
    },
    // The Host's turn: hours to approve, or a finished period to pay.
    defaultOpen: host && (submitted || ((p.status === "due" || p.status === "overdue") && p.periodEnd < today)),
    detail: (
      <>
        <PayPeriodDetail period={p} role={role} today={today} />
        {match && <TermsFooter match={match} field="rate" userId={userId} role={role} />}
      </>
    ),
    done: !!p.paid,
    doneOn: p.paid?.on ?? null,
  };
}

/** A month's rent: the Joey pays the Host. */
function rentRow(p: RentPayment, { role, today, userId, matches }: Ctx): Row {
  const match = matches.get(p.matchId);
  const host = role === "host";
  const s = RENT_STATUS[p.status];
  return {
    key: `rent-${p.key}`,
    direction: host ? "in" : "out",
    from: host ? p.otherName : YOU,
    to: host ? YOU : p.otherName,
    purpose: "Rent",
    purposeDetail: monthName(p.month),
    amountCents: p.amountCents,
    dueOn: p.dueOn,
    status: {
      label: p.receivedOn ? `${host ? "Received" : "Paid"} ${formatShort(p.receivedOn)}` : host ? s.host : s.joey,
      tone: s.tone,
    },
    detail: (
      <>
        <RentDetail payment={p} role={role} today={today} />
        {match && <TermsFooter match={match} field="rent" userId={userId} role={role} />}
      </>
    ),
    done: !!p.receivedOn,
    doneOn: p.receivedOn,
  };
}

/** A JoeyCo statement: the Host pays JoeyCo's fees (or, if it nets out the other way, JoeyCo pays them). */
function feeRow(s: Statement): Row {
  const net = statementNet(s);
  const status = statementStatus(s);
  return {
    key: `statement-${s.id}`,
    direction: net > 0 ? "in" : "out",
    from: net > 0 ? JOEYCO : YOU,
    to: net > 0 ? YOU : JOEYCO,
    purpose: s.kind === "host_monthly" ? "JoeyCo fees" : "JoeyCo payroll",
    purposeDetail: statementTitle(s),
    amountCents: Math.abs(net),
    dueOn: s.pay_date,
    status: { label: status.label, tone: status.tone },
    detail: <StatementDetail statement={s} />,
    done: status.settled,
    doneOn: status.settled ? s.pay_date : null,
  };
}
