import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-parts";
import { JoeyAvatar } from "@/components/host-joeys";
import { getProfile } from "@/lib/profile";
import { getProposedJoeys } from "@/lib/clarify/proposed";

export default function ProposedJoeyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Header title="Proposed Joey" />}>
      <View params={params} />
    </Suspense>
  );
}

function Header({ title }: { title: string }) {
  return (
    <PageHeader
      title={title}
      actions={
        <Link
          href="/host/joeys?tab=proposed"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Matches
        </Link>
      }
    />
  );
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getProfile()]);
  // Only Joeys proposed to this Host on an open Match can be opened, so look it up from that list.
  const res = await getProposedJoeys(profile.email);
  const joey = res.configured ? res.joeys.find((j) => j.id === id) : undefined;
  if (!joey) {
    return (
      <>
        <Header title="Proposed Joey" />
        <EmptyState title="This Joey isn't on your list">
          They may have been matched elsewhere or taken off your search. Your current list is on Matches.
        </EmptyState>
      </>
    );
  }

  const facts: [string, string | null][] = [
    ["School", joey.school],
    ["Preferred cities", joey.cities.join(", ") || null],
    ["Living arrangement", joey.livingArrangement],
    ["Can move in", joey.moveIn],
    ["Prefers living with", joey.hostPreference],
  ];

  return (
    <>
      <Header title={joey.name} />
      <div className="grid max-w-2xl gap-6 px-4 py-6 text-sm sm:px-6">
        <div className="flex items-center gap-4">
          <JoeyAvatar name={joey.name} className="size-14 text-base" />
          <div>
            <p className="text-base font-medium">{joey.name}</p>
            <p className="text-muted-foreground">Proposed by the JoeyCo team</p>
          </div>
        </div>

        <section className="grid gap-2">
          <h2 className="text-xs font-medium text-muted-foreground">About</h2>
          {joey.bio ? (
            joey.bio.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="leading-relaxed whitespace-pre-line">
                {para}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground">No bio yet.</p>
          )}
        </section>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
          {facts
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>

        {joey.tasks.length > 0 && (
          <section className="grid gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Happy to help with</h2>
            <ul className="flex flex-wrap gap-1.5">
              {joey.tasks.map((t) => (
                <li key={t} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {t}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-muted-foreground">
          Want to meet {joey.name.split(" ")[0]}? Reply to your JoeyCo contact and they&apos;ll set up an introduction.
        </p>
      </div>
    </>
  );
}
