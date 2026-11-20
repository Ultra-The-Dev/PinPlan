// Branded daily log PDF (@react-pdf/renderer): one log or a date range, each with that day's photos (with mark-up).
// Loaded with a dynamic import so it stays out of SSR. Same look as the photo report (PhotoReportPdf.tsx).
import { docBrand } from "@/lib/brandDefaults";
import { Document, Image, Page, StyleSheet, Text, View, pdf, type Styles } from "@react-pdf/renderer";
import type { ReportPdfSections, RangeSummaryRow } from "@/lib/dailyLogReport";
import type { BusinessSettings } from "@/lib/types";

export interface DailyLogPdfPhoto {
  src: string;
  width: number;
  height: number;
  caption?: string | null;
  meta: string;
}

export interface DailyLogPdfEntry {
  /** e.g. "Monday, March 2, 2026" */
  day: string;
  title?: string | null;
  author?: string | null;
  body: string;
  photos: DailyLogPdfPhoto[];
  /** Structured report sections (null/absent for older free-text logs, which print as before). */
  report?: (ReportPdfSections & { signatureSrc?: string | null; signedAt?: string }) | null;
}

export interface DailyLogPdfSummary {
  rows: (RangeSummaryRow & { day: string })[];
  manHours: number;
  delayHours: number;
  incidents: number;
}

export interface DailyLogPdfData {
  title: string;
  business: BusinessSettings;
  clientName: string;
  address: string;
  dateRange: string;
  logs: DailyLogPdfEntry[];
  /** Date-range export: totals page (man-hours, delay hours) before the logs. */
  summary?: DailyLogPdfSummary | null;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

const MUTED = "#64748b";
const CONTENT_W = 612 - 72;
const CELL_W = (CONTENT_W - 12) / 2;
const IMG_H = 190;

export function DailyLogDocument({ d }: { d: DailyLogPdfData }) {
  const brand = docBrand(d.business.brandColor);
  const s = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 42, paddingHorizontal: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827" },
    bar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: brand },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
    // react-pdf resolves a unitless lineHeight against the fontSize in the same style (not the inherited one), so set both.
    muted: { color: MUTED, fontSize: 9, lineHeight: 1.4 },
    log: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12, marginBottom: 14 },
    day: { fontFamily: "Helvetica-Bold", color: brand, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 10 },
    h: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 9, marginBottom: 3 },
    li: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 1 },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
    th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED },
    footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
  });
  const fit = (p: DailyLogPdfPhoto) => {
    const k = Math.min(CELL_W / Math.max(1, p.width), IMG_H / Math.max(1, p.height));
    return { width: p.width * k, height: p.height * k };
  };
  const photoCount = d.logs.reduce((n, l) => n + l.photos.length, 0);
  return (
    <Document title={d.title} author={d.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <View style={s.head}>
          <View style={{ maxWidth: 330 }}>
            <Text style={s.title}>{d.title}</Text>
            <Text style={s.muted}>{[d.clientName, d.address].filter(Boolean).join(" · ")}</Text>
            <Text style={s.muted}>
              {[d.dateRange, `${d.logs.length} log${d.logs.length === 1 ? "" : "s"}`, photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
            </Text>
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
        {d.summary && d.summary.rows.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12, marginBottom: 14 }} wrap={false}>
            <Text style={s.day}>Summary</Text>
            <View style={{ flexDirection: "row", marginTop: 8, marginBottom: 8 }}>
              {[
                ["Man-hours", num(d.summary.manHours)],
                ["Delay hours", num(d.summary.delayHours)],
                ["Days reported", String(d.summary.rows.length)],
                ["Safety incidents", String(d.summary.incidents)],
              ].map(([k, v]) => (
                <View key={k} style={{ flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 8, marginRight: 6 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, color: brand }}>{v}</Text>
                  <Text style={[s.muted, { fontSize: 8 }]}>{k}</Text>
                </View>
              ))}
            </View>
            <View style={s.tr}>
              <Text style={[s.th, { flex: 1 }]}>Day</Text>
              <Text style={[s.th, { width: 60, textAlign: "right" }]}>Crew</Text>
              <Text style={[s.th, { width: 80, textAlign: "right" }]}>Man-hours</Text>
              <Text style={[s.th, { width: 80, textAlign: "right" }]}>Delay hours</Text>
              <Text style={[s.th, { width: 70, textAlign: "right" }]}>Incident</Text>
            </View>
            {d.summary.rows.map((r) => (
              <View key={r.date} style={s.tr}>
                <Text style={{ flex: 1 }}>{r.day}</Text>
                <Text style={{ width: 60, textAlign: "right" }}>{r.crew || ""}</Text>
                <Text style={{ width: 80, textAlign: "right" }}>{r.manHours ? num(r.manHours) : ""}</Text>
                <Text style={{ width: 80, textAlign: "right" }}>{r.delayHours ? num(r.delayHours) : ""}</Text>
                <Text style={{ width: 70, textAlign: "right", color: r.incident ? "#b91c1c" : "#111827" }}>{r.incident ? "Yes" : ""}</Text>
              </View>
            ))}
            <View style={[s.tr, { borderBottomWidth: 0 }]}>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>Total</Text>
              <Text style={{ width: 60 }} />
              <Text style={{ width: 80, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{num(d.summary.manHours)}</Text>
              <Text style={{ width: 80, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{num(d.summary.delayHours)}</Text>
              <Text style={{ width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{d.summary.incidents || ""}</Text>
            </View>
          </View>
        )}
        {d.logs.map((l, i) => (
          <View key={i} style={s.log}>
            {/* Keep the day heading with the start of its text. */}
            <View wrap={false} minPresenceAhead={80}>
              <Text style={s.day}>{l.day}</Text>
              {l.title ? <Text style={{ marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 12.5 }}>{l.title}</Text> : null}
              {l.author ? <Text style={[s.muted, { marginTop: 2 }]}>Logged by {l.author}</Text> : null}
            </View>
            {l.report ? <ReportSections r={l.report} s={s} /> : null}
            {l.body ? (
              <>
                {l.report ? <Text style={s.h}>Notes</Text> : null}
                <Text style={{ marginTop: l.report ? 0 : 7, fontSize: 9.5, lineHeight: 1.5 }}>{l.body}</Text>
              </>
            ) : null}
            {l.report?.signature ? (
              <View style={{ marginTop: 10 }} wrap={false}>
                <Text style={s.h}>Signature</Text>
                {l.report.signatureSrc ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                  <Image src={l.report.signatureSrc} style={{ height: 44, width: 160, objectFit: "contain", objectPosition: "left" }} />
                ) : null}
                <Text style={[s.muted, { borderTopWidth: 0.5, borderTopColor: "#94a3b8", paddingTop: 2, width: 200 }]}>
                  {[l.report.signature.name, l.report.signedAt].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ) : null}
            {l.photos.length > 0 && (
              <View style={s.grid}>
                {l.photos.map((p, k) => (
                  <View key={k} style={{ width: CELL_W, marginBottom: 10 }} wrap={false}>
                    <View style={{ height: IMG_H, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 4 }}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                      <Image src={p.src} style={fit(p)} />
                    </View>
                    {p.caption ? <Text style={{ marginTop: 5, fontFamily: "Helvetica-Bold", fontSize: 9.5 }}>{p.caption}</Text> : null}
                    <Text style={[s.muted, { marginTop: 2, fontSize: 8 }]}>{p.meta}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>{d.business.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

type PdfStyles = Record<"h" | "li" | "tr" | "th" | "muted", Styles[string]>;

/** Weather line, crew table with total man-hours, work, deliveries, equipment, delays, safety and visitors. */
function ReportSections({ r, s }: { r: ReportPdfSections; s: PdfStyles }) {
  const list = (title: string, xs: string[]) =>
    xs.length ? (
      <View>
        <Text style={s.h}>{title}</Text>
        {xs.map((x, i) => (
          <Text key={i} style={s.li}>
            •  {x}
          </Text>
        ))}
      </View>
    ) : null;
  return (
    <View>
      {r.weather ? (
        <View>
          <Text style={s.h}>Weather</Text>
          <Text style={s.li}>{r.weather}</Text>
        </View>
      ) : null}
      {r.crew.length > 0 && (
        <View wrap={false}>
          <Text style={s.h}>Crew & hours</Text>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 1 }]}>Name</Text>
            <Text style={[s.th, { width: 140 }]}>Role</Text>
            <Text style={[s.th, { width: 60, textAlign: "right" }]}>Hours</Text>
          </View>
          {r.crew.map((c, i) => (
            <View key={i} style={s.tr}>
              <Text style={{ flex: 1 }}>{c.name}</Text>
              <Text style={[{ width: 140 }, s.muted]}>{c.role}</Text>
              <Text style={{ width: 60, textAlign: "right" }}>{num(c.hours)}</Text>
            </View>
          ))}
          <View style={[s.tr, { borderBottomWidth: 0 }]}>
            <Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>{`${r.crew.length} on site · total man-hours`}</Text>
            <Text style={{ width: 60, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{num(r.manHours)}</Text>
          </View>
        </View>
      )}
      {list("Work performed", r.work)}
      {list("Materials delivered", r.deliveries)}
      {list("Equipment", r.equipment)}
      {list(r.delayHours ? `Delays · ${num(r.delayHours)} h lost` : "Delays", r.delays)}
      {r.safety ? (
        <View>
          <Text style={s.h}>Safety</Text>
          <Text style={[s.li, r.incident ? { color: "#b91c1c", fontFamily: "Helvetica-Bold" } : {}]}>{r.safety}</Text>
        </View>
      ) : null}
      {list("Visitors & inspections", r.visitors)}
    </View>
  );
}

export async function renderDailyLogPdf(d: DailyLogPdfData): Promise<Blob> {
  const logo = d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo;
  return pdf(<DailyLogDocument d={{ ...d, business: { ...d.business, logo } }} />).toBlob();
}
