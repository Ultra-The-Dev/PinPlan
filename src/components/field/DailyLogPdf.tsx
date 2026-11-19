// Branded daily log PDF (@react-pdf/renderer): one log or a date range, each with that day's photos (with mark-up).
// Loaded with a dynamic import so it stays out of SSR. Same look as the photo report (PhotoReportPdf.tsx).
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
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
}

export interface DailyLogPdfData {
  title: string;
  business: BusinessSettings;
  clientName: string;
  address: string;
  dateRange: string;
  logs: DailyLogPdfEntry[];
}

const MUTED = "#64748b";
const CONTENT_W = 612 - 72;
const CELL_W = (CONTENT_W - 12) / 2;
const IMG_H = 190;

export function DailyLogDocument({ d }: { d: DailyLogPdfData }) {
  const brand = d.business.brandColor || "#0a1b54";
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
        {d.logs.map((l, i) => (
          <View key={i} style={s.log}>
            {/* Keep the day heading with the start of its text. */}
            <View wrap={false} minPresenceAhead={80}>
              <Text style={s.day}>{l.day}</Text>
              {l.title ? <Text style={{ marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 12.5 }}>{l.title}</Text> : null}
              {l.author ? <Text style={[s.muted, { marginTop: 2 }]}>Logged by {l.author}</Text> : null}
            </View>
            {l.body ? <Text style={{ marginTop: 7, fontSize: 9.5, lineHeight: 1.5 }}>{l.body}</Text> : null}
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

export async function renderDailyLogPdf(d: DailyLogPdfData): Promise<Blob> {
  const logo = d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo;
  return pdf(<DailyLogDocument d={{ ...d, business: { ...d.business, logo } }} />).toBlob();
}
