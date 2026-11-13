import { ReferencesEditor } from "@/components/application/references-editor";
import { SECTIONS, type Application, type Reference } from "@/lib/joey/application";

/** Read-only view of a submitted application. References stay editable until the reference check starts. */
export function ApplicationSummary({
  application: a,
  email,
  references,
  referencesEditable,
  contactEmail,
}: {
  application: Application;
  email: string;
  references: Reference[];
  referencesEditable: boolean;
  contactEmail: string;
}) {
  const list = (v: string[]) => (v.length ? v.join(", ") : null);
  const date = (iso: string | null, withTime = false) =>
    iso
      ? new Date(withTime ? iso : `${iso}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const rows: Record<string, [string, string | null][]> = {
    about: [
      ["Name", [a.first_name, a.last_name].filter(Boolean).join(" ") || null],
      ["Email", email],
      ["Phone", a.phone],
      ["Date of birth", date(a.date_of_birth)],
      ["Authorized to work in the U.S.", a.work_authorized],
      ["School and degree", a.school_degree],
    ],
    preferences: [
      ["Preferred cities", list(a.preferred_cities)],
      ["Move-in timing", a.move_in_timing],
      ["Comfortable working with Hosts who are", a.host_preference],
      ["Comfortable helping with", list(a.services)],
    ],
    story: [
      ["Why you want to be a Joey", a.why_joey],
      ["How you heard about us", a.heard_about],
    ],
    acknowledgements: [
      [
        "Background check disclosure",
        a.bg_disclosure_signature ? `Signed by ${a.bg_disclosure_signature}, ${date(a.bg_disclosure_signed_at, true)}` : null,
      ],
      [
        "California disclosure",
        a.ca_disclosure_signature ? `Signed by ${a.ca_disclosure_signature}, ${date(a.ca_disclosure_signed_at, true)}` : null,
      ],
      ["Free copy of the report", a.ca_report_copy_requested === null ? null : a.ca_report_copy_requested ? "Yes" : "No"],
      [
        "Code of Conduct",
        a.conduct_signature ? `Signed by ${a.conduct_signature}, ${date(a.conduct_signed_at, true)}` : null,
      ],
      ["News and updates", a.news_opt_in === null ? null : a.news_opt_in ? "Yes" : "No"],
    ],
  };

  return (
    <div>
      <p className="border-b px-6 py-4 text-sm text-muted-foreground">
        Submitted {date(a.submitted_at, true)}. To change an answer, email{" "}
        <a className="text-foreground underline underline-offset-4" href={`mailto:${contactEmail}`}>
          {contactEmail}
        </a>
        .
      </p>
      {SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`sum-${s.id}`} className="border-b px-6 py-6">
          <h2 id={`sum-${s.id}`} className="mb-4 text-sm font-medium">
            {s.title}
          </h2>
          {s.id === "references" ? (
            <>
              <ReferencesEditor initial={references} editable={referencesEditable} />
              {!referencesEditable && references.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  References are locked once we start contacting them.
                </p>
              )}
            </>
          ) : (
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[14rem_1fr]">
              {rows[s.id].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-line">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}
