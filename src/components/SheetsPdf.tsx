"use client";
// Marked-up plan sheets as a PDF: one page per floor with the plan, a legend and a per-floor count box
// (like the handwritten totals in the margin of the scans). Also used for the crew's wiring sheets.
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

export interface SheetPage {
  name: string;
  imageDataUrl: string;
  width: number;
  height: number;
  legend: { iconDataUrl?: string; color?: string; name: string }[];
  counts: { name: string; value: string; note?: string }[];
  /** Optional table (crew home-run schedule). */
  table?: { headers: string[]; rows: string[][] };
}

const s = StyleSheet.create({
  page: { padding: 18, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a", flexDirection: "row" },
  planWrap: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#cbd5e1" },
  side: { width: 170, marginLeft: 10 },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4, textTransform: "uppercase", color: "#475569" },
  muted: { color: "#64748b" },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  icon: { width: 12, height: 12, marginRight: 4 },
  swatch: { width: 12, height: 3, marginRight: 4 },
  countBox: { borderWidth: 1, borderColor: "#1d4ed8", padding: 6, borderRadius: 3 },
  countRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  countVal: { fontFamily: "Helvetica-Bold", color: "#1d4ed8" },
  tablePage: { padding: 24, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0f172a", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
  cell: { flex: 1, paddingRight: 4 },
});

export function SheetsDocument({ title, subtitle, pages }: { title: string; subtitle: string; pages: SheetPage[] }) {
  return (
    <Document title={title}>
      {pages.map((p, i) => [
        <Page key={`p${i}`} size="TABLOID" orientation="landscape" style={s.page}>
          <View style={s.planWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={p.imageDataUrl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </View>
          <View style={s.side}>
            <Text style={s.h1}>{p.name}</Text>
            <Text style={s.muted}>{title}</Text>
            <Text style={s.muted}>{subtitle}</Text>
            <Text style={s.h2}>Count</Text>
            <View style={s.countBox}>
              {p.counts.map((c, k) => (
                <View key={k} style={s.countRow}>
                  <Text>{c.name}</Text>
                  <Text style={s.countVal}>
                    {c.value}
                    {c.note ? ` ${c.note}` : ""}
                  </Text>
                </View>
              ))}
              {!p.counts.length && <Text style={s.muted}>Nothing placed on this floor.</Text>}
            </View>
            <Text style={s.h2}>Legend</Text>
            {p.legend.map((l, k) => (
              <View key={k} style={s.row}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {l.iconDataUrl ? <Image src={l.iconDataUrl} style={s.icon} /> : <View style={[s.swatch, { backgroundColor: l.color }]} />}
                <Text>{l.name}</Text>
              </View>
            ))}
            <Text style={[s.muted, { marginTop: 8 }]}>? = tentative / to confirm</Text>
          </View>
        </Page>,
        p.table && p.table.rows.length ? (
          <Page key={`t${i}`} size="LETTER" style={s.tablePage}>
            <Text style={s.h1}>{p.name} — home-run schedule</Text>
            <Text style={[s.muted, { marginBottom: 8 }]}>{title}</Text>
            <View style={s.th}>
              {p.table.headers.map((h) => (
                <Text key={h} style={s.cell}>
                  {h}
                </Text>
              ))}
            </View>
            {p.table.rows.map((r, k) => (
              <View key={k} style={s.tr} wrap={false}>
                {r.map((c, j) => (
                  <Text key={j} style={s.cell}>
                    {c}
                  </Text>
                ))}
              </View>
            ))}
          </Page>
        ) : null,
      ])}
    </Document>
  );
}

export async function renderSheetsPdf(props: { title: string; subtitle: string; pages: SheetPage[] }): Promise<Blob> {
  return pdf(<SheetsDocument {...props} />).toBlob();
}
