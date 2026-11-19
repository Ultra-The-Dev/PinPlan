"use client";
// Change order PDFs (@react-pdf/renderer), branded like the estimate PDF: one change order with a signature block,
// and the job's change order log. Load with a dynamic import (keeps react-pdf out of the page bundle).
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { changeOrderTotals, coCode, reasonLabel, sellLines, type ContractSummary } from "@/lib/changeOrders";
import { formatMoney } from "@/lib/estimate";
import type { BusinessSettings, ChangeOrder, Project } from "@/lib/types";

const INK = "#161616";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  bar: { height: 6, marginHorizontal: -44, marginBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  biz: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  logo: { height: 40, maxWidth: 180, objectFit: "contain", marginBottom: 6 },
  muted: { color: MUTED, lineHeight: 1.45 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1.2 },
  meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 5 },
  metaLabel: { color: MUTED, width: 80, textAlign: "right", marginRight: 8 },
  metaValue: { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" },
  box: { padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, marginBottom: 16 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  strong: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 5, fontFamily: "Helvetica-Bold", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 40, textAlign: "right", color: MUTED },
  cPrice: { width: 72, textAlign: "right" },
  cTotal: { width: 78, textAlign: "right" },
  cCode: { width: 54 },
  cStatus: { width: 64 },
  cDate: { width: 62 },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 13, borderTopWidth: 1.2, borderTopColor: INK, paddingTop: 7, marginTop: 4 },
  sign: { marginTop: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  signBox: { width: 240 },
  signImg: { height: 48, width: 180, objectFit: "contain", marginBottom: 2 },
  signLine: { borderTopWidth: 0.7, borderTopColor: INK, paddingTop: 5, fontSize: 8, color: MUTED },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
});

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "");
const brandOf = (b: BusinessSettings) => (b.brandColor && /^#[0-9a-f]{3,8}$/i.test(b.brandColor) ? b.brandColor : "#0a1b54");
/** react-pdf can draw data URLs and absolute URLs; site paths need the origin. */
const logoSrc = (logo: string | undefined) => (!logo ? null : logo.startsWith("/") ? (typeof window !== "undefined" ? window.location.origin + logo : null) : logo);

function Letterhead({ business, title, meta }: { business: BusinessSettings; title: string; meta: [string, string][] }) {
  const brand = brandOf(business);
  const logo = logoSrc(business.logo);
  return (
    <>
      <View style={[s.bar, { backgroundColor: brand }]} fixed />
      <View style={s.header}>
        <View style={{ maxWidth: 260 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={[s.biz, { color: brand }]}>{business.name || " "}</Text>}
          <Text style={s.muted}>{[business.address, business.phone, business.email, business.website].filter(Boolean).join("\n")}</Text>
        </View>
        <View>
          <Text style={[s.title, { color: brand }]}>{title}</Text>
          {meta.map(([k, v]) => (
            <View key={k} style={s.meta}>
              <Text style={s.metaLabel}>{k}</Text>
              <Text style={s.metaValue}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function Footer({ business, label }: { business: BusinessSettings; label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{[business.name, label].filter(Boolean).join(" · ")}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export interface ChangeOrderPdfProps {
  co: ChangeOrder;
  project: Project;
  business: BusinessSettings;
  currency: string;
  /** Signature PNG as a data URL, when signed. */
  signature?: string | null;
}

export function ChangeOrderDoc({ co, project, business, currency, signature }: ChangeOrderPdfProps) {
  const code = coCode(co.number);
  const t = changeOrderTotals(co);
  const lines = sellLines(co);
  const fm = (n: number) => formatMoney(n, currency);
  const days = co.scheduleDays ? `${co.scheduleDays > 0 ? "+" : ""}${co.scheduleDays} working day${Math.abs(co.scheduleDays) === 1 ? "" : "s"}` : "None";
  return (
    <Document title={`Change order ${code}`} author={business.name}>
      <Page size="LETTER" style={s.page}>
        <Letterhead
          business={business}
          title="CHANGE ORDER"
          meta={[
            ["Number", code],
            ["Date", day(co.sentAt ?? co.createdAt)],
            ["Status", co.status === "approved" ? "Approved" : co.status === "rejected" ? "Rejected" : co.status === "void" ? "Void" : co.status === "sent" ? "Awaiting approval" : "Draft"],
          ]}
        />
        <View style={[s.box, { flexDirection: "row" }]}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={s.label}>Client / project</Text>
            <Text style={s.strong}>{project.clientName || "—"}</Text>
            <Text style={s.muted}>{project.address || ""}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Reason · schedule impact</Text>
            <Text style={s.strong}>{reasonLabel(co.reason)}</Text>
            <Text style={s.muted}>{days}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{co.title || "Change order"}</Text>
        {co.description ? <Text style={[s.muted, { marginBottom: 12 }]}>{co.description}</Text> : <View style={{ marginBottom: 8 }} />}
        <View style={s.th} fixed>
          <Text style={s.cDesc}>Description</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cUnit}>Unit</Text>
          <Text style={s.cPrice}>Unit price</Text>
          <Text style={s.cTotal}>Amount</Text>
        </View>
        {lines.map((l) => (
          <View key={l.id} style={s.row} wrap={false}>
            <Text style={s.cDesc}>{l.description || "—"}</Text>
            <Text style={s.cQty}>{l.qty}</Text>
            <Text style={s.cUnit}>{l.unit}</Text>
            <Text style={s.cPrice}>{fm(l.unitPrice)}</Text>
            <Text style={s.cTotal}>{fm(l.total)}</Text>
          </View>
        ))}
        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{fm(t.subtotal + t.markup)}</Text>
          </View>
          {t.tax !== 0 && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Tax ({co.taxPct ?? 0}%)</Text>
              <Text>{fm(t.tax)}</Text>
            </View>
          )}
          <View style={[s.totalRow, s.grand]}>
            <Text>Change order total</Text>
            <Text>{fm(t.total)}</Text>
          </View>
        </View>
        <View style={s.sign} wrap={false}>
          <View style={s.signBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {signature ? <Image src={signature} style={s.signImg} /> : <View style={{ height: 50 }} />}
            <Text style={s.signLine}>
              Client approval{co.status === "approved" && co.approvedName ? ` — ${co.approvedName}` : ""}
            </Text>
          </View>
          <View style={{ width: 140 }}>
            <Text style={{ marginBottom: 2 }}>{co.status === "approved" ? day(co.respondedAt) : " "}</Text>
            <Text style={s.signLine}>Date</Text>
          </View>
        </View>
        {co.status === "approved" && co.clientComment ? <Text style={[s.muted, { marginTop: 10 }]}>Note: {co.clientComment}</Text> : null}
        <Footer business={business} label={`Change order ${code}`} />
      </Page>
    </Document>
  );
}

export async function renderChangeOrderPdf(props: ChangeOrderPdfProps): Promise<Blob> {
  return pdf(<ChangeOrderDoc {...props} />).toBlob();
}

export interface ChangeOrderLogProps {
  project: Project;
  business: BusinessSettings;
  currency: string;
  cos: ChangeOrder[];
  summary: ContractSummary & { basis?: "quote" | "pricing" };
}

export function ChangeOrderLogDoc({ project, business, currency, cos, summary }: ChangeOrderLogProps) {
  const fm = (n: number) => formatMoney(n, currency);
  const list = cos.filter((c) => !c.deleted).sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt));
  const status = (c: ChangeOrder) => ({ draft: "Draft", sent: "Pending", approved: "Approved", rejected: "Rejected", void: "Void" })[c.status] ?? c.status;
  return (
    <Document title="Change order log" author={business.name}>
      <Page size="LETTER" style={s.page}>
        <Letterhead business={business} title="CHANGE ORDER LOG" meta={[["Project", project.address || project.clientName || "—"], ["Date", day(new Date().toISOString())]]} />
        <View style={s.th} fixed>
          <Text style={s.cCode}>No.</Text>
          <Text style={s.cDesc}>Title</Text>
          <Text style={s.cStatus}>Status</Text>
          <Text style={s.cDate}>Date</Text>
          <Text style={s.cTotal}>Amount</Text>
        </View>
        {list.map((c) => (
          <View key={c.id} style={s.row} wrap={false}>
            <Text style={s.cCode}>{coCode(c.number)}</Text>
            <Text style={s.cDesc}>
              {c.title || "Change order"}
              {c.status === "approved" && c.approvedName ? ` — approved by ${c.approvedName}` : ""}
            </Text>
            <Text style={s.cStatus}>{status(c)}</Text>
            <Text style={s.cDate}>{day(c.respondedAt ?? c.sentAt ?? c.createdAt)}</Text>
            <Text style={[s.cTotal, c.status === "void" || c.status === "rejected" ? { color: MUTED } : {}]}>{fm(changeOrderTotals(c).total)}</Text>
          </View>
        ))}
        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>{summary.basis === "pricing" ? "Job pricing (not approved yet)" : "Approved quote"}</Text>
            <Text>{fm(summary.original)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Approved change orders</Text>
            <Text>{fm(summary.approved)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>{summary.basis === "pricing" ? "Total if approved" : "New contract total"}</Text>
            <Text>{fm(summary.revised)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Waiting on client (not included)</Text>
            <Text style={s.muted}>{fm(summary.pending)}</Text>
          </View>
        </View>
        <Footer business={business} label="Change order log" />
      </Page>
    </Document>
  );
}

export async function renderChangeOrderLogPdf(props: ChangeOrderLogProps): Promise<Blob> {
  return pdf(<ChangeOrderLogDoc {...props} />).toBlob();
}
