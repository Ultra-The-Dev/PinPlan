"use client";
// Client-facing estimate PDF (@react-pdf/renderer). Load via `renderEstimatePdf` (dynamic import keeps it out of SSR).
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ComputedLine, Estimate } from "@/lib/estimate";
import { formatMoney } from "@/lib/estimate";
import type { BusinessSettings, Project } from "@/lib/types";

const INK = "#161616";
const BRAND = "#c2410c";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  bar: { height: 6, backgroundColor: BRAND, marginHorizontal: -44, marginBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 26 },
  biz: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  muted: { color: MUTED, lineHeight: 1.45 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1.5, color: BRAND },
  meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  metaLabel: { color: MUTED, width: 70, textAlign: "right", marginRight: 8 },
  metaValue: { width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" },
  parties: { flexDirection: "row", marginBottom: 22 },
  party: { flex: 1, padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, marginRight: 10 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  strong: { fontFamily: "Helvetica-Bold" },
  scope: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  scopeItem: { marginRight: 12, marginTop: 2 },
  th: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, fontFamily: "Helvetica-Bold", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  group: { fontSize: 7.5, color: BRAND, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, paddingTop: 10, paddingBottom: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 40, textAlign: "right", color: MUTED },
  cPrice: { width: 72, textAlign: "right" },
  cTotal: { width: 78, textAlign: "right" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 13, borderTopWidth: 1.2, borderTopColor: INK, paddingTop: 7, marginTop: 4 },
  section: { marginTop: 22, fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 2 },
  terms: { marginTop: 26, padding: 12, borderLeftWidth: 3, borderLeftColor: BRAND, backgroundColor: "#f8fafc", fontSize: 8.5, color: "#334155", lineHeight: 1.5 },
  sign: { marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  signLine: { width: 240, borderTopWidth: 0.7, borderTopColor: INK, paddingTop: 5, fontSize: 8, color: MUTED },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
});

const GROUPS: Record<ComputedLine["group"], string> = {
  devices: "Devices & installation",
  lighting: "Lighting",
  wire: "Cabling",
  labor: "Labor",
  infrastructure: "Infrastructure",
  custom: "Additional items",
};

export interface EstimatePdfProps {
  project: Project;
  business: BusinessSettings;
  estimate: Estimate;
  currency: string;
  taxPct: number;
  date?: Date;
  /** Short scope summary, e.g. [{label: "Floors", value: "4"}, …]. */
  scope?: { label: string; value: string }[];
  /** Hide lines priced at $0 (e.g. closets, unpriced cable) from the client copy. */
  hideZero?: boolean;
  validDays?: number;
}

function Table({ lines, currency }: { lines: ComputedLine[]; currency: string }) {
  const groups = (Object.keys(GROUPS) as ComputedLine["group"][]).map((g) => ({ g, lines: lines.filter((l) => l.group === g) })).filter((x) => x.lines.length);
  return (
    <View>
      <View style={s.th} fixed>
        <Text style={s.cDesc}>Description</Text>
        <Text style={s.cQty}>Qty</Text>
        <Text style={s.cUnit}>Unit</Text>
        <Text style={s.cPrice}>Unit price</Text>
        <Text style={s.cTotal}>Amount</Text>
      </View>
      {groups.map(({ g, lines: ls }) => (
        <View key={g}>
          <Text style={s.group}>{GROUPS[g]}</Text>
          {ls.map((l) => (
            <View style={s.row} key={l.key} wrap={false}>
              <Text style={s.cDesc}>{l.description.replace(" — installed", "").replace(" (optional — marked ?)", "")}</Text>
              <Text style={s.cQty}>{Number(l.qty.toFixed(2))}</Text>
              <Text style={s.cUnit}>{l.unit}</Text>
              <Text style={s.cPrice}>{formatMoney(l.unitPrice, currency)}</Text>
              <Text style={s.cTotal}>{formatMoney(l.total, currency)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function estimateNumber(project: Project, date: Date) {
  const ymd = date.toISOString().slice(2, 10).replace(/-/g, "");
  return `EST-${ymd}-${project.id.slice(0, 4).toUpperCase()}`;
}

export function EstimateDocument({ project, business, estimate, currency, taxPct, date = new Date(), scope, hideZero = true, validDays = 30 }: EstimatePdfProps) {
  const keep = (l: ComputedLine) => !hideZero || l.total !== 0;
  const included = estimate.lines.filter((l) => l.included && keep(l));
  const optional = estimate.lines.filter((l) => !l.included && keep(l));
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const valid = new Date(date.getTime() + validDays * 86400000);
  const installed = estimate.lines.some((l) => l.description.endsWith("— installed"));
  return (
    <Document title={`Estimate — ${project.address}`} author={business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <View style={s.header}>
          <View style={{ maxWidth: 280 }}>
            <Text style={s.biz}>{business.name || "Estimate"}</Text>
            {[business.address, business.phone, business.email, business.website].filter(Boolean).map((t) => (
              <Text key={t} style={s.muted}>
                {t}
              </Text>
            ))}
          </View>
          <View>
            <Text style={s.title}>ESTIMATE</Text>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Number</Text>
              <Text style={s.metaValue}>{estimateNumber(project, date)}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{fmt(date)}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Valid until</Text>
              <Text style={s.metaValue}>{fmt(valid)}</Text>
            </View>
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.strong}>{project.clientName || "—"}</Text>
            {project.clientEmail ? <Text style={s.muted}>{project.clientEmail}</Text> : null}
            {project.clientPhone ? <Text style={s.muted}>{project.clientPhone}</Text> : null}
          </View>
          <View style={[s.party, { marginRight: 0 }]}>
            <Text style={s.label}>Job site</Text>
            <Text style={s.strong}>{project.address || "—"}</Text>
            {scope?.length ? (
              <View style={s.scope}>
                {scope.map((x) => (
                  <Text key={x.label} style={[s.muted, s.scopeItem]}>
                    {x.label}: <Text style={{ color: INK }}>{x.value}</Text>
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <Table lines={included} currency={currency} />
        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: MUTED }}>Subtotal</Text>
            <Text>{formatMoney(estimate.subtotal, currency)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: MUTED }}>Tax ({taxPct}%)</Text>
            <Text>{formatMoney(estimate.tax, currency)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Total</Text>
            <Text>{formatMoney(estimate.total, currency)}</Text>
          </View>
        </View>
        {installed && <Text style={[s.muted, { marginTop: 8, fontSize: 8 }]}>Device prices include supply and installation.</Text>}
        {optional.length > 0 && (
          <View wrap={false}>
            <Text style={s.section}>Optional items</Text>
            <Text style={[s.muted, { marginBottom: 4, fontSize: 8 }]}>To be confirmed on site — not included in the total above.</Text>
            <Table lines={optional} currency={currency} />
          </View>
        )}
        {business.estimateTerms ? (
          <View style={s.terms} wrap={false}>
            <Text style={[s.label, { color: BRAND }]}>Terms</Text>
            <Text>{business.estimateTerms}</Text>
          </View>
        ) : null}
        <View style={s.sign} wrap={false}>
          <Text style={s.signLine}>Client approval (signature)</Text>
          <Text style={[s.signLine, { width: 150 }]}>Date</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>
            {business.name || ""}
            {business.name ? " · " : ""}
            {project.address}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderEstimatePdf(props: EstimatePdfProps): Promise<Blob> {
  return pdf(<EstimateDocument {...props} />).toBlob();
}
