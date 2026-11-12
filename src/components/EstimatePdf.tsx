"use client";
// Client-facing estimate PDF (@react-pdf/renderer). Load via `renderEstimatePdf` (dynamic import keeps it out of SSR).
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Estimate } from "@/lib/estimate";
import { formatMoney } from "@/lib/estimate";
import type { BusinessSettings, Project } from "@/lib/types";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  biz: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#6b7280" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  box: { marginBottom: 18, padding: 10, backgroundColor: "#f3f4f6", borderRadius: 4 },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111827", paddingBottom: 4, fontFamily: "Helvetica-Bold" },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 40, textAlign: "right" },
  cPrice: { width: 70, textAlign: "right" },
  cTotal: { width: 75, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 12, borderTopWidth: 1, borderTopColor: "#111827", paddingTop: 4, marginTop: 2 },
  section: { marginTop: 18, fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 4 },
  terms: { marginTop: 24, fontSize: 9, color: "#374151" },
  sign: { marginTop: 36, flexDirection: "row", justifyContent: "space-between" },
  signLine: { width: 220, borderTopWidth: 0.5, borderTopColor: "#111827", paddingTop: 4, fontSize: 9, color: "#6b7280" },
});

export interface EstimatePdfProps {
  project: Project;
  business: BusinessSettings;
  estimate: Estimate;
  currency: string;
  taxPct: number;
  date?: Date;
}

function Table({ lines, currency }: { lines: Estimate["lines"]; currency: string }) {
  return (
    <View>
      <View style={s.th}>
        <Text style={s.cDesc}>Description</Text>
        <Text style={s.cQty}>Qty</Text>
        <Text style={s.cUnit}>Unit</Text>
        <Text style={s.cPrice}>Unit price</Text>
        <Text style={s.cTotal}>Amount</Text>
      </View>
      {lines.map((l) => (
        <View style={s.row} key={l.key} wrap={false}>
          <Text style={s.cDesc}>{l.description}</Text>
          <Text style={s.cQty}>{Number(l.qty.toFixed(2))}</Text>
          <Text style={s.cUnit}>{l.unit}</Text>
          <Text style={s.cPrice}>{formatMoney(l.unitPrice, currency)}</Text>
          <Text style={s.cTotal}>{formatMoney(l.total, currency)}</Text>
        </View>
      ))}
    </View>
  );
}

export function EstimateDocument({ project, business, estimate, currency, taxPct, date = new Date() }: EstimatePdfProps) {
  const included = estimate.lines.filter((l) => l.included);
  const optional = estimate.lines.filter((l) => !l.included);
  return (
    <Document title={`Estimate — ${project.address}`} author={business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.biz}>{business.name || "Estimate"}</Text>
            {[business.address, business.phone, business.email, business.website].filter(Boolean).map((t) => (
              <Text key={t} style={s.muted}>{t}</Text>
            ))}
          </View>
          <View>
            <Text style={s.title}>ESTIMATE</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>{date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</Text>
          </View>
        </View>
        <View style={s.box}>
          <Text style={s.label}>Prepared for</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{project.clientName}</Text>
          <Text>{project.address}</Text>
          {project.clientEmail ? <Text style={s.muted}>{project.clientEmail}</Text> : null}
          {project.clientPhone ? <Text style={s.muted}>{project.clientPhone}</Text> : null}
        </View>
        <Table lines={included} currency={currency} />
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatMoney(estimate.subtotal, currency)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>Tax ({taxPct}%)</Text>
            <Text>{formatMoney(estimate.tax, currency)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Total</Text>
            <Text>{formatMoney(estimate.total, currency)}</Text>
          </View>
        </View>
        {optional.length > 0 && (
          <View wrap={false}>
            <Text style={s.section}>Optional items (not included in total)</Text>
            <Table lines={optional} currency={currency} />
          </View>
        )}
        {business.estimateTerms ? <Text style={s.terms}>{business.estimateTerms}</Text> : null}
        <View style={s.sign} wrap={false}>
          <Text style={s.signLine}>Client approval (signature)</Text>
          <Text style={[s.signLine, { width: 140 }]}>Date</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderEstimatePdf(props: EstimatePdfProps): Promise<Blob> {
  return pdf(<EstimateDocument {...props} />).toBlob();
}
