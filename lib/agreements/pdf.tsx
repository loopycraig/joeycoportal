// A signed agreement as a PDF: the document exactly as signed (its frozen rendered blocks), the
// signatures, and a signing record page. Server only (lib/agreements/pdf route).
//
// Uses the PDF standard fonts (Times, Courier), which only cover Windows-1252. Checkboxes are
// printed as [X] / [ ] and any other character those fonts can't draw becomes "?".

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { KIND_LABEL } from "@/lib/agreements/fields";
import type { AgreementDetail, AgreementEvent } from "@/lib/agreements/queries";
import type { Party, RenderedBlock, Run } from "@/lib/agreements/types";

const TZ = "America/Los_Angeles";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
    timeZoneName: "short",
  });

/** Keeps characters the standard fonts can draw; replaces the rest. */
function safe(s: string) {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    // Printable ASCII, Latin-1, and the Windows-1252 extras (quotes, dashes, bullet, etc.).
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || "‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ€".includes(ch) || ch === "\n") out += ch;
    else out += "?";
  }
  return out;
}

const PARTY_LABEL: Record<Party, string> = { joey: "JOEY", host: "HOST", joeyco: "JOEYCO, INC." };

const EVENT_LABEL: Record<string, string> = {
  created: "Started",
  sent: "Sent for review",
  viewed: "Opened by the Joey",
  changes_requested: "Changes requested",
  signed: "Signed",
  countersigned: "Countersigned",
  voided: "Withdrawn",
  executed: "Signed by everyone",
};

const s = StyleSheet.create({
  page: { paddingVertical: 54, paddingHorizontal: 64, fontFamily: "Times-Roman", fontSize: 10.5, lineHeight: 1.45 },
  title: { fontFamily: "Times-Bold", fontSize: 11.5, textAlign: "center", textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
  sub: { fontFamily: "Times-Bold", marginTop: 4, marginBottom: 2 },
  para: { flexDirection: "row", marginBottom: 6 },
  num: { width: 26 },
  bullet: { width: 14 },
  flex: { flex: 1 },
  box: { borderWidth: 0.75, borderColor: "#666", padding: 6, marginBottom: 6 },
  table: { borderWidth: 0.5, borderColor: "#666", marginBottom: 8, fontFamily: "Helvetica", fontSize: 8 },
  row: { flexDirection: "row" },
  cell: { flex: 1, borderWidth: 0.5, borderColor: "#999", padding: 3 },
  firstCell: { flex: 2.4, borderWidth: 0.5, borderColor: "#999", padding: 3 },
  sigs: { flexDirection: "row", gap: 14, marginTop: 10, marginBottom: 10 },
  sig: { flex: 1, borderWidth: 0.5, borderColor: "#999", padding: 8 },
  sigParty: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.5, marginBottom: 4 },
  sigName: { fontFamily: "Times-Italic", fontSize: 15, borderBottomWidth: 0.75, borderBottomColor: "#333", marginBottom: 4, minHeight: 20 },
  small: { fontFamily: "Helvetica", fontSize: 8, color: "#444" },
  footer: { position: "absolute", bottom: 26, left: 64, right: 64, fontFamily: "Helvetica", fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
  recordTitle: { fontFamily: "Helvetica-Bold", fontSize: 12, marginBottom: 10 },
  kv: { flexDirection: "row", fontFamily: "Helvetica", fontSize: 8.5, marginBottom: 3 },
  key: { width: 120, color: "#555" },
  event: { fontFamily: "Helvetica", fontSize: 8.5, marginBottom: 5 },
});

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.box) return <Text key={i} style={{ fontFamily: "Courier-Bold" }}>{r.s === "☒" ? "[X] " : "[ ] "}</Text>;
        const font = r.b ? "Times-Bold" : "Times-Roman";
        return (
          <Text key={i} style={{ fontFamily: font, textDecoration: r.u ? "underline" : undefined, color: r.empty ? "#777" : undefined }}>
            {safe(r.s)}
          </Text>
        );
      })}
    </>
  );
}

type Sig = { party: Party; typed_name: string; signer_title: string | null; signed_at: string; addendum_ack: boolean | null };

function Block({ b, sigs, names }: { b: RenderedBlock; sigs: Sig[]; names: Partial<Record<Party, string>> }) {
  switch (b.t) {
    case "title":
      return (
        <Text style={s.title}>
          <Runs runs={b.runs} />
        </Text>
      );
    case "sub":
      return (
        <Text style={s.sub}>
          <Runs runs={b.runs} />
        </Text>
      );
    case "p":
    case "li":
      return (
        <View style={[s.para, { paddingLeft: (b.lvl ?? 0) * 22 + (b.t === "li" ? 12 : 0) }]} wrap>
          {b.t === "li" ? <Text style={s.bullet}>•</Text> : b.n ? <Text style={s.num}>{safe(b.n)}</Text> : null}
          <Text style={s.flex}>
            <Runs runs={b.runs} />
          </Text>
        </View>
      );
    case "box":
      return (
        <View style={s.box}>
          <Text>
            <Runs runs={b.runs} />
          </Text>
        </View>
      );
    case "table":
      return (
        <View style={s.table} wrap={false}>
          {[b.head, ...b.rows].map((row, i) => (
            <View key={i} style={s.row}>
              {row.map((c, j) => (
                <Text key={j} style={[j === 0 ? s.firstCell : s.cell, i === 0 ? { fontFamily: "Helvetica-Bold" } : {}]}>
                  {safe(c)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "signatures":
      return (
        <View style={s.sigs} wrap={false}>
          {b.parties.map((party) => {
            const sig = sigs.find((x) => x.party === party);
            const printed = party === "joeyco" ? (sig ? `${sig.typed_name}${sig.signer_title ? `, ${sig.signer_title}` : ""}` : "") : names[party] ?? "";
            return (
              <View key={party} style={s.sig}>
                <Text style={s.sigParty}>{PARTY_LABEL[party]}</Text>
                <Text style={s.sigName}>{sig ? safe(sig.typed_name) : ""}</Text>
                <Text style={s.small}>Name: {safe(printed)}</Text>
                <Text style={s.small}>Date: {sig ? stamp(sig.signed_at) : ""}</Text>
                {b.addendum && party === "joey" && sig?.addendum_ack && (
                  <Text style={s.small}>Addendum acknowledged with this signature</Text>
                )}
              </View>
            );
          })}
        </View>
      );
    case "break":
      return <View break />;
  }
}

function AgreementPdf({ a }: { a: AgreementDetail }) {
  const v = a.versions.find((x) => x.version === a.current_version)!;
  const sigs = a.signatures.filter((x) => x.version === v.version) as Sig[];
  const hostName = a.host?.full_name || a.host?.email || "";
  const joeyName = a.joey?.full_name || a.joey?.email || "";
  const names = { host: hostName, joey: joeyName };
  const actors: Record<string, string> = { [a.host_id]: hostName, ...(a.joey_id ? { [a.joey_id]: joeyName } : {}) };
  const title = KIND_LABEL[a.kind];
  const footer = `${title} · version ${v.version} · SHA-256 ${v.content_hash.slice(0, 16)}…`;

  return (
    <Document title={title} author="JoeyCo Portal" subject={`${title} (signed)`} creator="JoeyCo Portal" producer="JoeyCo Portal">
      <Page size="LETTER" style={s.page} wrap>
        {v.rendered.map((b, i) => (
          <Block key={i} b={b} sigs={sigs} names={names} />
        ))}
        <View style={s.footer} fixed>
          <Text>{safe(footer)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      <Page size="LETTER" style={s.page}>
        <Text style={s.recordTitle}>Signing record</Text>
        {[
          ["Document", `${title}, version ${v.version} (${v.template_version})`],
          ["Agreement ID", a.id],
          ["Fingerprint (SHA-256)", v.content_hash],
          ["Signed by everyone", a.executed_at ? stamp(a.executed_at) : "Not yet"],
          ["Signed electronically", "Each signer agreed to sign electronically and typed their name as their signature in the JoeyCo portal."],
        ].map(([k, val]) => (
          <View key={k} style={s.kv}>
            <Text style={s.key}>{k}</Text>
            <Text style={s.flex}>{safe(val)}</Text>
          </View>
        ))}
        <Text style={[s.recordTitle, { fontSize: 10, marginTop: 14 }]}>Signatures</Text>
        {sigs.map((sig) => (
          <Text key={sig.party} style={s.event}>
            {PARTY_LABEL[sig.party]}: {safe(sig.typed_name)}
            {sig.signer_title ? `, ${safe(sig.signer_title)}` : ""} · {stamp(sig.signed_at)}
            {sig.party === "joeyco" ? " · added automatically for JoeyCo" : ""}
          </Text>
        ))}
        <Text style={[s.recordTitle, { fontSize: 10, marginTop: 14 }]}>History</Text>
        {a.events.map((e: AgreementEvent) => (
          <Text key={e.id} style={s.event}>
            {stamp(e.at)} · {EVENT_LABEL[e.action] ?? e.action}
            {e.version ? ` (version ${e.version})` : ""}
            {e.actor_id && actors[e.actor_id] ? ` · ${safe(actors[e.actor_id])}` : ""}
            {e.comment ? ` · “${safe(e.comment)}”` : ""}
          </Text>
        ))}
        <View style={s.footer} fixed>
          <Text>{safe(footer)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function agreementPdfName(a: AgreementDetail) {
  const who = a.kind === "host_services" ? a.host?.full_name || "Host" : a.joey?.full_name || "Joey";
  const day = (a.executed_at ?? new Date().toISOString()).slice(0, 10);
  return `${KIND_LABEL[a.kind]} - ${who} - ${day}.pdf`.replace(/[^\w .,()-]+/g, "");
}

export async function renderAgreementPdf(a: AgreementDetail): Promise<Buffer> {
  return renderToBuffer(<AgreementPdf a={a} />);
}
