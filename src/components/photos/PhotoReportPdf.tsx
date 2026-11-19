// Branded photo report PDF (@react-pdf/renderer). Loaded with a dynamic import so it stays out of SSR.
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { BusinessSettings } from "@/lib/types";

export interface ReportPhoto {
  src: string;
  width: number;
  height: number;
  caption?: string | null;
  meta: string;
  tags?: string[];
  label?: string;
}

export interface PhotoReportData {
  title: string;
  business: BusinessSettings;
  clientName: string;
  address: string;
  notes?: string;
  dateRange: string;
  perPage: 1 | 2 | 4;
  photos: ReportPhoto[];
}

const MUTED = "#64748b";

export function PhotoReportDocument({ d }: { d: PhotoReportData }) {
  const brand = d.business.brandColor || "#0a1b54";
  const s = StyleSheet.create({
    page: { paddingTop: 0, paddingBottom: 42, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
    bar: { height: 6, backgroundColor: brand, marginHorizontal: -36, marginBottom: 22 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
    muted: { color: MUTED, lineHeight: 1.4 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
  });
  const contentW = 612 - 72;
  const cellW = d.perPage === 1 ? contentW : (contentW - 12) / 2;
  const imgH = d.perPage === 1 ? 470 : d.perPage === 2 ? 300 : 200;
  const pages: ReportPhoto[][] = [];
  for (let i = 0; i < d.photos.length; i += d.perPage === 2 ? 2 : d.perPage) pages.push(d.photos.slice(i, i + (d.perPage === 2 ? 2 : d.perPage)));
  const fit = (p: ReportPhoto) => {
    const k = Math.min(cellW / p.width, imgH / p.height);
    return { width: p.width * k, height: p.height * k };
  };
  return (
    <Document title={d.title} author={d.business.name || undefined}>
      {pages.map((group, pi) => (
        <Page key={pi} size="LETTER" style={s.page}>
          <View style={s.bar} fixed />
          {pi === 0 && (
            <View style={s.head}>
              <View style={{ maxWidth: 330 }}>
                <Text style={s.title}>{d.title}</Text>
                <Text style={s.muted}>{[d.clientName, d.address].filter(Boolean).join(" · ")}</Text>
                <Text style={s.muted}>
                  {d.dateRange} · {d.photos.length} photo{d.photos.length === 1 ? "" : "s"}
                </Text>
                {d.notes ? <Text style={{ marginTop: 8, lineHeight: 1.45 }}>{d.notes}</Text> : null}
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
          )}
          <View style={s.grid}>
            {group.map((p, k) => (
              <View key={k} style={{ width: cellW, marginBottom: 14 }} wrap={false}>
                <View style={{ height: imgH, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 4 }}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                  <Image src={p.src} style={fit(p)} />
                </View>
                {p.label ? <Text style={{ marginTop: 5, fontFamily: "Helvetica-Bold", color: brand, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>{p.label}</Text> : null}
                {p.caption ? <Text style={{ marginTop: p.label ? 2 : 6, fontFamily: "Helvetica-Bold", fontSize: 10 }}>{p.caption}</Text> : null}
                <Text style={[s.muted, { marginTop: 2 }]}>{p.meta}</Text>
                {p.tags?.length ? <Text style={[s.muted, { marginTop: 1 }]}>{p.tags.join(" · ")}</Text> : null}
              </View>
            ))}
          </View>
          <View style={s.footer} fixed>
            <Text>{d.business.name}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderPhotoReportPdf(d: PhotoReportData): Promise<Blob> {
  const logo = d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo;
  return pdf(<PhotoReportDocument d={{ ...d, business: { ...d.business, logo } }} />).toBlob();
}
