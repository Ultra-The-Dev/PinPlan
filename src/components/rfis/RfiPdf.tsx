// Branded RFI PDFs (@react-pdf/renderer), same look as the daily log PDF: one RFI with its photos and plan crop, and
// the job's RFI log as a table. Loaded with a dynamic import so it stays out of SSR. No prices anywhere.
import { docBrand } from "@/lib/brandDefaults";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { BusinessSettings } from "@/lib/types";

export interface RfiPdfPhoto {
  src: string;
  width: number;
  height: number;
  caption?: string | null;
}

export interface RfiPdfEntry {
  code: string;
  subject: string;
  question: string;
  suggestion?: string | null;
  status: string;
  ball: string;
  to: string;
  due: string;
  sent: string;
  age: string;
  priority: string;
  costImpact: string;
  scheduleImpact: string;
  createdBy?: string | null;
  location?: string | null;
  documents: string[];
  answer?: string | null;
  answeredBy?: string | null;
  answered: string;
  closed: string;
  overdue: boolean;
  photos: RfiPdfPhoto[];
  /** PNG data URL of the plan crop with the spot ringed. */
  plan?: { src: string; width: number; height: number } | null;
}

export interface RfiPdfData {
  business: BusinessSettings;
  clientName: string;
  address: string;
  printed: string;
}

const MUTED = "#64748b";
const CONTENT_W = 612 - 72;
const CELL_W = (CONTENT_W - 12) / 2;
const IMG_H = 180;

function styles(brand: string) {
  return StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 42, paddingHorizontal: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827" },
    bar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: brand },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
    muted: { color: MUTED, fontSize: 9, lineHeight: 1.4 },
    label: { fontFamily: "Helvetica-Bold", color: brand, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
    box: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 10, marginTop: 10 },
    footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
    th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, textTransform: "uppercase" },
  });
}

function Header({ d, title, sub }: { d: RfiPdfData; title: string; sub: string }) {
  const brand = docBrand(d.business.brandColor);
  const s = styles(brand);
  return (
    <View style={s.head}>
      <View style={{ maxWidth: 330 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.muted}>{[d.clientName, d.address].filter(Boolean).join(" · ")}</Text>
        <Text style={s.muted}>{sub}</Text>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 190 }}>
        {d.business.logo ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
          <Image src={d.business.logo} style={{ height: 38, maxWidth: 170, objectFit: "contain", marginBottom: 4 }} />
        ) : (
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{d.business.name}</Text>
        )}
        <Text style={[s.muted, { textAlign: "right" }]}>{[d.business.phone, d.business.email, d.business.website].filter(Boolean).join("\n")}</Text>
      </View>
    </View>
  );
}

function Footer({ d }: { d: RfiPdfData }) {
  const s = styles(docBrand(d.business.brandColor));
  return (
    <View style={s.footer} fixed>
      <Text>{[d.business.name, `Printed ${d.printed}`].filter(Boolean).join(" · ")}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Fact({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <View style={{ width: wide ? "100%" : "33.3%", marginBottom: 6, paddingRight: 8 }}>
      <Text style={{ color: MUTED, fontSize: 7.5, textTransform: "uppercase" }}>{k}</Text>
      <Text style={{ marginTop: 1, fontSize: 9.5 }}>{v || "—"}</Text>
    </View>
  );
}

const fitBox = (w: number, h: number, maxW: number, maxH: number) => {
  const k = Math.min(maxW / Math.max(1, w), maxH / Math.max(1, h));
  return { width: w * k, height: h * k };
};

export function RfiDocument({ d, r }: { d: RfiPdfData; r: RfiPdfEntry }) {
  const brand = docBrand(d.business.brandColor);
  const s = styles(brand);
  return (
    <Document title={`${r.code} ${r.subject}`} author={d.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <Header d={d} title={`${r.code} · Request for information`} sub={`${r.status}${r.overdue ? " · OVERDUE" : ""} · Ball in court: ${r.ball}`} />
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 8 }}>{r.subject}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Fact k="To" v={r.to} />
          <Fact k="Answer needed by" v={r.due} />
          <Fact k="Sent" v={r.sent} />
          <Fact k="Priority" v={r.priority} />
          <Fact k="Cost impact" v={r.costImpact} />
          <Fact k="Schedule impact" v={r.scheduleImpact} />
          {r.createdBy ? <Fact k="Raised by" v={r.createdBy} /> : null}
          {r.location ? <Fact k="Location" v={r.location} /> : null}
          {r.documents.length ? <Fact k="Documents" v={r.documents.join(", ")} wide /> : null}
        </View>
        <View style={s.box}>
          <Text style={s.label}>Question</Text>
          <Text style={{ fontSize: 10.5, lineHeight: 1.5 }}>{r.question || r.subject}</Text>
        </View>
        {r.suggestion ? (
          <View style={s.box}>
            <Text style={s.label}>Our suggestion</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.5 }}>{r.suggestion}</Text>
          </View>
        ) : null}
        <View style={[s.box, { backgroundColor: r.answer ? "#ecfdf5" : "#f8fafc", padding: 10, borderRadius: 4, borderTopWidth: 0 }]} wrap={false}>
          <Text style={[s.label, { color: r.answer ? "#047857" : MUTED }]}>Answer</Text>
          <Text style={{ fontSize: 10.5, lineHeight: 1.5 }}>{r.answer || "Not answered yet."}</Text>
          {r.answer ? <Text style={[s.muted, { marginTop: 4 }]}>{[r.answeredBy, r.answered].filter(Boolean).join(" · ")}</Text> : null}
          {r.closed ? <Text style={[s.muted, { marginTop: 2 }]}>Closed {r.closed}</Text> : null}
        </View>
        {r.plan ? (
          <View style={s.box} wrap={false}>
            <Text style={s.label}>Location on the plan{r.location ? ` — ${r.location}` : ""}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={r.plan.src} style={fitBox(r.plan.width, r.plan.height, CONTENT_W, 300)} />
          </View>
        ) : null}
        {r.photos.length > 0 && (
          <View style={s.box}>
            <Text style={s.label} minPresenceAhead={IMG_H + 20}>
              Photos
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              {r.photos.map((p, k) => (
                <View key={k} style={{ width: CELL_W, marginBottom: 10 }} wrap={false}>
                  <View style={{ height: IMG_H, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 4 }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                    <Image src={p.src} style={fitBox(p.width, p.height, CELL_W, IMG_H)} />
                  </View>
                  {p.caption ? <Text style={{ marginTop: 4, fontSize: 9 }}>{p.caption}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}
        <Footer d={d} />
      </Page>
    </Document>
  );
}

const COLS: { key: keyof RfiPdfEntry; title: string; w: number }[] = [
  { key: "code", title: "RFI", w: 52 },
  { key: "subject", title: "Subject", w: 150 },
  { key: "to", title: "To", w: 90 },
  { key: "status", title: "Status", w: 58 },
  { key: "ball", title: "Ball", w: 40 },
  { key: "sent", title: "Sent", w: 50 },
  { key: "due", title: "Due", w: 50 },
  { key: "answered", title: "Answered", w: 50 },
];

export function RfiLogDocument({ d, rows }: { d: RfiPdfData; rows: RfiPdfEntry[] }) {
  const brand = docBrand(d.business.brandColor);
  const s = styles(brand);
  const open = rows.filter((r) => r.status === "Open").length;
  const overdue = rows.filter((r) => r.overdue).length;
  return (
    <Document title="RFI log" author={d.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <Header d={d} title="RFI log" sub={[`${rows.length} RFI${rows.length === 1 ? "" : "s"}`, `${open} open`, overdue ? `${overdue} overdue` : ""].filter(Boolean).join(" · ")} />
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 4 }} fixed>
          {COLS.map((c) => (
            <Text key={c.key} style={[s.th, { width: c.w }]}>
              {c.title}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingVertical: 5, backgroundColor: i % 2 ? "#f8fafc" : "#ffffff" }} wrap={false}>
            <View style={{ flexDirection: "row" }}>
              {COLS.map((c) => (
                <Text key={c.key} style={{ width: c.w, fontSize: 8.5, paddingRight: 4, fontFamily: c.key === "code" ? "Helvetica-Bold" : "Helvetica", color: c.key === "due" && r.overdue ? "#b91c1c" : "#111827" }}>
                  {String(r[c.key] ?? "") || "—"}
                </Text>
              ))}
            </View>
            {r.answer ? (
              <Text style={{ marginTop: 3, marginLeft: 52, fontSize: 8, color: "#047857" }}>
                Answer: {r.answer.length > 240 ? `${r.answer.slice(0, 240)}…` : r.answer}
              </Text>
            ) : null}
          </View>
        ))}
        <Footer d={d} />
      </Page>
    </Document>
  );
}

const withLogo = (d: RfiPdfData): RfiPdfData => ({ ...d, business: { ...d.business, logo: d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo } });

export async function renderRfiPdf(d: RfiPdfData, r: RfiPdfEntry): Promise<Blob> {
  return pdf(<RfiDocument d={withLogo(d)} r={r} />).toBlob();
}

export async function renderRfiLogPdf(d: RfiPdfData, rows: RfiPdfEntry[]): Promise<Blob> {
  return pdf(<RfiLogDocument d={withLogo(d)} rows={rows} />).toBlob();
}
