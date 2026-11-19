"use client";
// As-built PDF: a cover with overall progress per floor and open issues, then per floor the marked-up sheet with
// install-status rings and a device table (label, type, room, status, by, date, test result). No prices.
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { STATUS_COLORS, STATUS_ORDER, type ProgressRow } from "@/lib/installProgress";
import type { InstallStatus } from "@/lib/types";

export interface AsBuiltRow {
  label: string;
  type: string;
  room: string;
  status: InstallStatus;
  statusText: string;
  by: string;
  date: string;
  test: string;
}

export interface AsBuiltProps {
  title: string;
  client: string;
  business: string;
  date: string;
  overall: { counts: Record<InstallStatus, number>; total: number; done: number; pct: number; cables: number; cablesDone: number };
  sheets: ProgressRow[];
  issues: { label: string; note: string | null; by: string | null; sheet: string; date: string }[];
  legend: { color: string; name: string }[];
  pages: { name: string; imageDataUrl: string; row: ProgressRow; rows: AsBuiltRow[] }[];
}

const s = StyleSheet.create({
  cover: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  kicker: { fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 4 },
  h2: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6, textTransform: "uppercase", color: "#475569" },
  muted: { color: "#64748b" },
  big: { fontSize: 40, fontFamily: "Helvetica-Bold", color: "#065f46" },
  statRow: { flexDirection: "row", gap: 16, alignItems: "flex-end", marginTop: 14 },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#e2e8f0", marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  sheetPage: { padding: 18, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a", flexDirection: "row" },
  planWrap: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#cbd5e1" },
  side: { width: 170, marginLeft: 10 },
  tablePage: { padding: 24, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0f172a", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
});

const COLS: { key: keyof AsBuiltRow; name: string; flex: number }[] = [
  { key: "label", name: "Label", flex: 1 },
  { key: "type", name: "Type", flex: 1.6 },
  { key: "room", name: "Room", flex: 1.2 },
  { key: "statusText", name: "Status", flex: 1.1 },
  { key: "by", name: "By", flex: 1 },
  { key: "date", name: "Date", flex: 0.9 },
  { key: "test", name: "Test result", flex: 1.3 },
];

function StatusBar({ counts, total }: { counts: Record<InstallStatus, number>; total: number }) {
  return (
    <View style={s.bar}>
      {total > 0 && STATUS_ORDER.filter((k) => counts[k] > 0).map((k) => <View key={k} style={{ width: `${(counts[k] / total) * 100}%`, backgroundColor: STATUS_COLORS[k] }} />)}
    </View>
  );
}

export function AsBuiltDocument(p: AsBuiltProps) {
  return (
    <Document title={`${p.title} — as-built`}>
      <Page size="LETTER" style={s.cover}>
        <Text style={s.kicker}>As-built · install record{p.business ? ` · ${p.business}` : ""}</Text>
        <Text style={s.h1}>{p.title}</Text>
        {p.client ? <Text style={s.muted}>{p.client}</Text> : null}
        <Text style={s.muted}>{p.date}</Text>
        <View style={s.statRow}>
          <Text style={s.big}>{p.overall.pct}%</Text>
          <View>
            <Text>
              {p.overall.done} of {p.overall.total} devices tested or verified
            </Text>
            {p.overall.cables > 0 && (
              <Text style={s.muted}>
                {p.overall.cablesDone} of {p.overall.cables} cable runs certified
              </Text>
            )}
          </View>
        </View>
        <StatusBar counts={p.overall.counts} total={p.overall.total} />
        <View style={s.legend}>
          {p.legend.map((l) => (
            <View key={l.name} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: l.color }]} />
              <Text>{l.name}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>By floor</Text>
        {p.sheets.map((r) => (
          <View key={r.key} style={{ marginBottom: 6 }} wrap={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.name}</Text>
              <Text>
                {r.done}/{r.total} · {r.pct}%{r.runs.total ? `   cables ${r.runs.done}/${r.runs.total}` : ""}
              </Text>
            </View>
            <StatusBar counts={r.counts} total={r.total} />
          </View>
        ))}
        <Text style={s.h2}>Open issues ({p.issues.length})</Text>
        {p.issues.length === 0 && <Text style={s.muted}>None.</Text>}
        {p.issues.map((i, k) => (
          <View key={k} style={s.row} wrap={false}>
            <View style={[s.dot, { backgroundColor: STATUS_COLORS.issue }]} />
            <Text style={{ width: 90, fontFamily: "Helvetica-Bold" }}>{i.label}</Text>
            <Text style={{ flex: 1 }}>{i.note || "—"}</Text>
            <Text style={[s.muted, { width: 130, textAlign: "right" }]}>
              {[i.sheet, i.by, i.date].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ))}
      </Page>
      {p.pages.map((pg, i) => [
        <Page key={`s${i}`} size="TABLOID" orientation="landscape" style={s.sheetPage}>
          <View style={s.planWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={pg.imageDataUrl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </View>
          <View style={s.side}>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{pg.name}</Text>
            <Text style={s.muted}>{p.title}</Text>
            <Text style={s.muted}>As-built · {p.date}</Text>
            <Text style={[s.h2, { fontSize: 9 }]}>Progress</Text>
            <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: "#065f46" }}>{pg.row.pct}%</Text>
            <Text>
              {pg.row.done}/{pg.row.total} devices tested
            </Text>
            <StatusBar counts={pg.row.counts} total={pg.row.total} />
            <Text style={[s.h2, { fontSize: 9 }]}>Status</Text>
            {STATUS_ORDER.map((k) => (
              <View key={k} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <View style={[s.dot, { backgroundColor: STATUS_COLORS[k] }]} />
                <Text style={{ flex: 1 }}>{p.legend.find((l) => l.color === STATUS_COLORS[k])?.name}</Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{pg.row.counts[k]}</Text>
              </View>
            ))}
          </View>
        </Page>,
        pg.rows.length ? (
          <Page key={`t${i}`} size="LETTER" style={s.tablePage}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 }}>{pg.name} — devices</Text>
            <View style={s.th} fixed>
              {COLS.map((c) => (
                <Text key={c.key} style={{ flex: c.flex, paddingRight: 4 }}>
                  {c.name}
                </Text>
              ))}
            </View>
            {pg.rows.map((r, k) => (
              <View key={k} style={s.tr} wrap={false}>
                {COLS.map((c) =>
                  c.key === "statusText" ? (
                    <View key={c.key} style={{ flex: c.flex, flexDirection: "row", alignItems: "center", paddingRight: 4 }}>
                      <View style={[s.dot, { backgroundColor: STATUS_COLORS[r.status] }]} />
                      <Text>{r.statusText}</Text>
                    </View>
                  ) : (
                    <Text key={c.key} style={{ flex: c.flex, paddingRight: 4 }}>
                      {String(r[c.key] ?? "")}
                    </Text>
                  ),
                )}
              </View>
            ))}
          </Page>
        ) : null,
      ])}
    </Document>
  );
}

export async function renderAsBuiltPdf(props: AsBuiltProps): Promise<Blob> {
  return pdf(<AsBuiltDocument {...props} />).toBlob();
}
