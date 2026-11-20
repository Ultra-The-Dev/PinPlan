"use client";
// Panel schedule PDF: one page per panel, laid out like the directory on a panel door. No prices (crew document).
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { breakerLabel, circuitLabel, type PanelScheduleT } from "@/lib/panelSchedule";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#0F2340" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: "#64748b", marginTop: 2 },
  totals: { flexDirection: "row", marginTop: 10, marginBottom: 10 },
  box: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8, marginRight: 8 },
  boxVal: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0F2340", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  cNo: { width: 44, fontFamily: "Helvetica-Bold" },
  cBrk: { width: 50 },
  cDesc: { flex: 2, paddingRight: 6 },
  cDev: { flex: 2.4, paddingRight: 6, color: "#334155" },
  cWire: { width: 70 },
  cFt: { width: 40, textAlign: "right" },
  cVa: { width: 48, textAlign: "right" },
  foot: { position: "absolute", bottom: 18, left: 28, right: 28, color: "#94a3b8", fontSize: 7 },
});

function PanelSchedulesDocument({ title, subtitle, panels }: { title: string; subtitle: string; panels: PanelScheduleT[] }) {
  return (
    <Document title={`${title} — panel schedule`}>
      {panels.map((p) => (
        <Page key={p.closetId} size="LETTER" style={s.page}>
          <Text style={s.h1}>{p.name}</Text>
          <Text style={s.muted}>
            {title}
            {p.floor ? ` · ${p.floor}` : ""}
          </Text>
          <Text style={s.muted}>{subtitle}</Text>
          <View style={s.totals}>
            <View style={s.box}>
              <Text>Circuits</Text>
              <Text style={s.boxVal}>{p.circuits.filter((c) => c.number !== "unassigned").length}</Text>
            </View>
            <View style={s.box}>
              <Text>Devices</Text>
              <Text style={s.boxVal}>{p.circuits.reduce((n, c) => n + c.devices, 0)}</Text>
            </View>
            <View style={s.box}>
              <Text>Est. connected load</Text>
              <Text style={s.boxVal}>
                {p.totalVA.toLocaleString()} VA · {p.amps240} A @ 240 V
              </Text>
            </View>
          </View>
          <View style={s.th} fixed>
            <Text style={s.cNo}>Ckt</Text>
            <Text style={s.cBrk}>Breaker</Text>
            <Text style={s.cDesc}>Feeds</Text>
            <Text style={s.cDev}>Devices</Text>
            <Text style={s.cWire}>Wire</Text>
            <Text style={s.cFt}>Ft</Text>
            <Text style={s.cVa}>VA</Text>
          </View>
          {p.circuits.map((c, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{circuitLabel(c)}</Text>
              <Text style={s.cBrk}>
                {breakerLabel(c)}
                {c.volts >= 208 ? ` ${c.volts}V` : ""}
              </Text>
              <Text style={s.cDesc}>{c.description || "—"}</Text>
              <Text style={s.cDev}>
                {c.devicesText || "—"}
                {c.labels.length ? `\n${c.labels.join(", ")}` : ""}
              </Text>
              <Text style={s.cWire}>{c.wire || "—"}</Text>
              <Text style={s.cFt}>{c.wireFt ?? ""}</Text>
              <Text style={s.cVa}>{c.va ? c.va.toLocaleString() : ""}</Text>
            </View>
          ))}
          <Text style={s.foot} fixed>
            Loads are rough estimates from typical values per device (e.g. 180 VA per receptacle) — not a load calculation. Verify breaker and wire sizes against the code and the equipment.
          </Text>
        </Page>
      ))}
    </Document>
  );
}

export async function renderPanelSchedulePdf(props: { title: string; subtitle: string; panels: PanelScheduleT[] }): Promise<Blob> {
  return pdf(<PanelSchedulesDocument {...props} />).toBlob();
}
