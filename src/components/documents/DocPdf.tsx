"use client";
// Quote / invoice / credit note PDF (@react-pdf/renderer) in three looks: classic, modern, compact.
// Load with `renderDocPdf` (dynamic import keeps it out of SSR and the first page load).
import { docBrand } from "@/lib/brandDefaults";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { formatDocDate, formatDocMoney, lineAmounts, type DocSnapshot } from "@/lib/documents";
import type { DocLive } from "./DocView";

const INK = "#161616";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";

function styles(compact: boolean) {
  const f = compact ? 0.9 : 1;
  return StyleSheet.create({
    page: { paddingTop: 32, paddingBottom: 56, paddingHorizontal: compact ? 34 : 44, fontSize: 9.5 * f, fontFamily: "Helvetica", color: INK },
    header: { flexDirection: "row", justifyContent: "space-between", marginBottom: compact ? 14 : 22 },
    biz: { fontSize: 16 * f, fontFamily: "Helvetica-Bold", marginBottom: 4 },
    muted: { color: MUTED, lineHeight: 1.45 },
    title: { fontSize: (compact ? 18 : 22) * f, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1.5 },
    meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
    metaLabel: { color: MUTED, width: 64, textAlign: "right", marginRight: 8 },
    metaValue: { minWidth: 80, textAlign: "right", fontFamily: "Helvetica-Bold" },
    parties: { flexDirection: "row", marginBottom: compact ? 12 : 20 },
    party: { flex: 1, padding: compact ? 0 : 10, backgroundColor: compact ? undefined : SOFT, borderRadius: 5, marginRight: 10 },
    label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
    strong: { fontFamily: "Helvetica-Bold" },
    th: { flexDirection: "row", borderBottomWidth: 1.2, paddingBottom: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.5 },
    section: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, paddingTop: compact ? 7 : 10, paddingBottom: 3 },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: compact ? 3.5 : 5.5 },
    cDesc: { flex: 1, paddingRight: 6 },
    cSku: { width: 58, color: MUTED },
    cQty: { width: 40, textAlign: "right" },
    cUnit: { width: 34, textAlign: "right", color: MUTED },
    cPrice: { width: 64, textAlign: "right" },
    cDisc: { width: 44, textAlign: "right", color: MUTED },
    cTax: { width: 22, textAlign: "center", color: MUTED },
    cTotal: { width: 70, textAlign: "right" },
    details: { color: MUTED, fontSize: 7.8 * f, marginTop: 1.5 },
    totals: { marginTop: 12, alignSelf: "flex-end", width: 230 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.2 },
    grand: { fontFamily: "Helvetica-Bold", fontSize: 12.5 * f, borderTopWidth: 1.2, paddingTop: 6, marginTop: 4 },
    box: { marginTop: compact ? 12 : 18, padding: 10, borderWidth: 0.7, borderColor: LINE, borderRadius: 5 },
    text: { marginTop: compact ? 10 : 16, fontSize: 8.5 * f, color: "#334155", lineHeight: 1.5 },
    sign: { marginTop: 34, flexDirection: "row", justifyContent: "space-between" },
    signLine: { width: 230, borderTopWidth: 0.7, borderTopColor: INK, paddingTop: 5, fontSize: 8, color: MUTED },
    footer: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
  });
}

export interface DocPdfProps {
  snap: DocSnapshot;
  live?: DocLive;
  payLink?: string | null;
  /** Signed quote: the client's signature image and name. */
  signature?: { name: string | null; image: string | null; at: string | null } | null;
}

export function DocPdfDocument({ snap, live, payLink, signature }: DocPdfProps) {
  const compact = snap.template === "compact";
  const modern = snap.template === "modern";
  const s = styles(compact);
  const brand = docBrand(snap.business.brandColor);
  const money = (n: number) => formatDocMoney(n, snap.currency, snap.locale);
  const date = (d: string | null | undefined) => formatDocDate(d, snap.locale);
  const c = snap.columns;
  const sections = snap.detail === "sections";
  const number = live?.number ?? snap.number;
  const isInvoice = snap.kind === "invoice";
  const paid = live?.amountPaid ?? 0;
  const balance = live?.balanceDue ?? snap.totals.total;
  const sectionTotal = new Map(snap.sections.map((x) => [x.id, x.total]));
  const counted = snap.lines.filter((l) => !l.optional);
  const optional = snap.lines.filter((l) => l.optional && (l.kind ?? "item") === "item");
  const price = !sections;
  const pct = (n: number) => `${Number(n.toFixed(3))}%`;

  const head = (
    <View style={[s.th, { borderBottomColor: brand }]} fixed>
      <Text style={s.cDesc}>Description</Text>
      {c.sku && <Text style={s.cSku}>SKU</Text>}
      {c.qty && <Text style={s.cQty}>Qty</Text>}
      {c.qty && c.unit && <Text style={s.cUnit}>Unit</Text>}
      {price && c.unitPrice && <Text style={s.cPrice}>Price</Text>}
      {price && c.discount && <Text style={s.cDisc}>Disc.</Text>}
      {c.tax && <Text style={s.cTax}>Tax</Text>}
      {(price ? c.lineTotal : true) && <Text style={s.cTotal}>Amount</Text>}
    </View>
  );
  const row = (l: DocSnapshot["lines"][number]) => {
    const a = lineAmounts(l);
    return (
      <View style={s.row} key={l.id} wrap={false}>
        <View style={s.cDesc}>
          <Text>{l.description || "—"}</Text>
          {l.details ? <Text style={s.details}>{l.details}</Text> : null}
        </View>
        {c.sku && <Text style={s.cSku}>{l.sku ?? ""}</Text>}
        {c.qty && <Text style={s.cQty}>{+Number(l.qty).toFixed(2)}</Text>}
        {c.qty && c.unit && <Text style={s.cUnit}>{l.unit ?? ""}</Text>}
        {price && c.unitPrice && <Text style={s.cPrice}>{money(l.unitPrice)}</Text>}
        {price && c.discount && <Text style={s.cDisc}>{a.discount ? (l.discount?.type === "pct" ? pct(l.discount.value) : money(a.discount)) : ""}</Text>}
        {c.tax && <Text style={s.cTax}>{l.taxable ? "T" : ""}</Text>}
        {(price ? c.lineTotal : true) && <Text style={s.cTotal}>{price ? money(l.net) : ""}</Text>}
      </View>
    );
  };
  const meta: [string, string][] = [
    ["Number", number ?? "—"],
    ["Date", date(snap.issueDate)],
    ...(snap.dueDate ? ([["Due", date(snap.dueDate)]] as [string, string][]) : []),
    ...(snap.termsLabel ? ([["Terms", snap.termsLabel]] as [string, string][]) : []),
    ...(snap.validUntil ? ([["Valid until", date(snap.validUntil)]] as [string, string][]) : []),
  ];
  const onBrand = modern ? { color: "#ffffff" } : {};
  const mutedOnBrand = modern ? { color: "#e2e8f0" } : {};

  return (
    <Document title={`${snap.title} ${number ?? ""}`.trim()} author={snap.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        {!modern && <View style={{ height: 6, backgroundColor: brand, marginTop: -32, marginHorizontal: compact ? -34 : -44, marginBottom: compact ? 20 : 30 }} fixed />}
        <View style={[s.header, modern ? { backgroundColor: brand, marginTop: -32, marginHorizontal: -44, paddingHorizontal: 44, paddingTop: 28, paddingBottom: 22 } : {}]}>
          <View style={{ maxWidth: 270 }}>
            {snap.business.logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              <Image src={snap.business.logo} style={{ height: compact ? 34 : 42, maxWidth: 190, objectFit: "contain", marginBottom: 6, alignSelf: "flex-start", backgroundColor: modern ? "#ffffff" : undefined, padding: modern ? 3 : 0 }} />
            ) : (
              <Text style={[s.biz, modern ? onBrand : { color: brand }]}>{snap.business.name || " "}</Text>
            )}
            {snap.business.logo && snap.business.name ? <Text style={[s.strong, onBrand]}>{snap.business.name}</Text> : null}
            {[snap.business.address, snap.business.phone, snap.business.email, snap.business.website].filter(Boolean).map((x) => (
              <Text key={x} style={[s.muted, mutedOnBrand]}>
                {x}
              </Text>
            ))}
          </View>
          <View>
            <Text style={[s.title, { color: modern ? "#ffffff" : brand }]}>{snap.title.toUpperCase()}</Text>
            {meta.map(([k, v]) => (
              <View style={s.meta} key={k}>
                <Text style={[s.metaLabel, mutedOnBrand]}>{k}</Text>
                <Text style={[s.metaValue, onBrand]}>{v || "—"}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[s.parties, modern ? { marginTop: 16 } : {}]}>
          <View style={s.party}>
            <Text style={s.label}>{isInvoice ? "Bill to" : "Prepared for"}</Text>
            <Text style={s.strong}>{snap.client.name || "—"}</Text>
            {snap.client.company ? <Text>{snap.client.company}</Text> : null}
            {[snap.client.billingAddress, snap.client.email, snap.client.phone].filter(Boolean).map((x) => (
              <Text key={x} style={s.muted}>
                {x}
              </Text>
            ))}
          </View>
          <View style={[s.party, { marginRight: 0 }]}>
            {snap.client.siteAddress ? (
              <>
                <Text style={s.label}>Job site</Text>
                <Text style={s.strong}>{snap.client.siteAddress}</Text>
              </>
            ) : null}
            {live?.status === "paid" ? <Text style={{ marginTop: 6, color: "#047857", fontFamily: "Helvetica-Bold" }}>PAID{live.paidAt ? ` · ${date(live.paidAt)}` : ""}</Text> : null}
            {live?.status === "void" ? <Text style={{ marginTop: 6, color: "#b91c1c", fontFamily: "Helvetica-Bold" }}>VOID</Text> : null}
          </View>
        </View>

        <View>
        {head}
        {counted.map((l) =>
          (l.kind ?? "item") === "section" ? (
            <View key={l.id} style={s.section} wrap={false}>
              <Text style={{ color: brand }}>{l.description}</Text>
              {sections ? <Text>{money(sectionTotal.get(l.id) ?? 0)}</Text> : null}
            </View>
          ) : (
            row(l)
          ),
        )}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: MUTED }}>Subtotal</Text>
            <Text>{money(snap.totals.subtotal)}</Text>
          </View>
          {snap.totals.discountTotal ? (
            <View style={s.totalRow}>
              <Text style={{ color: MUTED }}>Discount{snap.discount?.type === "pct" ? ` (${pct(snap.discount.value)})` : ""}</Text>
              <Text>-{money(snap.totals.discountTotal)}</Text>
            </View>
          ) : null}
          {snap.fees.map((f) => (
            <View style={s.totalRow} key={f.id}>
              <Text style={{ color: MUTED }}>{f.label || "Fee"}</Text>
              <Text>{money(f.amount)}</Text>
            </View>
          ))}
          {snap.totals.taxLines.map((x) => (
            <View style={s.totalRow} key={x.id}>
              <Text style={{ color: MUTED }}>
                {x.name || "Tax"} ({pct(x.rate)})
              </Text>
              <Text>{money(x.amount)}</Text>
            </View>
          ))}
          {snap.deductions?.length ? (
            <>
              <View style={s.totalRow}>
                <Text style={s.strong}>Job total</Text>
                <Text style={s.strong}>{money(snap.totals.grossTotal)}</Text>
              </View>
              {snap.deductions.map((d) => (
                <View style={s.totalRow} key={d.id}>
                  <Text style={{ color: MUTED }}>{d.label}</Text>
                  <Text>-{money(d.amount)}</Text>
                </View>
              ))}
            </>
          ) : null}
          <View style={[s.totalRow, s.grand, { borderTopColor: brand }]}>
            <Text>{snap.deductions?.length ? "This invoice" : "Total"}</Text>
            <Text>{money(snap.totals.total)}</Text>
          </View>
          {snap.kind === "quote" && snap.totals.deposit != null ? (
            <View style={s.totalRow}>
              <Text style={s.strong}>Deposit due on approval</Text>
              <Text style={s.strong}>{money(snap.totals.deposit)}</Text>
            </View>
          ) : null}
          {isInvoice && paid ? (
            <View style={s.totalRow}>
              <Text style={{ color: MUTED }}>Paid</Text>
              <Text>-{money(paid)}</Text>
            </View>
          ) : null}
          {isInvoice ? (
            <View style={[s.totalRow, { backgroundColor: SOFT, paddingHorizontal: 6, paddingVertical: 5, marginTop: 3 }]}>
              <Text style={s.strong}>Balance due</Text>
              <Text style={s.strong}>{money(balance)}</Text>
            </View>
          ) : null}
        </View>

        {optional.length ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[s.label, { color: brand }]}>Optional items — not included in the total</Text>
            {optional.map(row)}
          </View>
        ) : null}

        {isInvoice && balance > 0 && (snap.payment.instructions || snap.payment.bank || snap.payment.zelle || snap.payment.checkPayable || payLink) ? (
          <View style={s.box} wrap={false}>
            <Text style={[s.label, { color: brand }]}>How to pay</Text>
            {snap.payment.instructions ? <Text style={{ marginBottom: 3 }}>{snap.payment.instructions}</Text> : null}
            {snap.payment.bank ? <Text style={{ marginBottom: 2 }}>Bank transfer / ACH: {snap.payment.bank}</Text> : null}
            {snap.payment.zelle ? <Text style={{ marginBottom: 2 }}>Zelle: {snap.payment.zelle}</Text> : null}
            {snap.payment.checkPayable ? <Text style={{ marginBottom: 2 }}>Checks payable to: {snap.payment.checkPayable}</Text> : null}
            {payLink ? <Text style={{ marginTop: 3, color: brand }}>Pay online: {payLink}</Text> : null}
            {number ? <Text style={[s.muted, { marginTop: 3 }]}>Please include {number} with your payment.</Text> : null}
          </View>
        ) : null}

        {snap.plansUrl ? <Text style={[s.text, { color: brand }]}>Plans: {snap.plansUrl}</Text> : null}
        {snap.notes ? (
          <View style={s.text} wrap={false}>
            <Text style={s.label}>Notes</Text>
            <Text>{snap.notes}</Text>
          </View>
        ) : null}
        {snap.terms ? (
          <View style={s.text}>
            <Text style={s.label}>Terms</Text>
            <Text>{snap.terms}</Text>
          </View>
        ) : null}
        {snap.lateFee ? (
          <View style={s.text} wrap={false}>
            <Text style={s.label}>Late payments</Text>
            <Text>{snap.lateFee}</Text>
          </View>
        ) : null}

        {snap.kind === "quote" && snap.requireSignature ? (
          signature?.image ? (
            <View style={{ marginTop: 24 }} wrap={false}>
              <Text style={s.label}>Approved</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={signature.image} style={{ height: 46, width: 160, objectFit: "contain" }} />
              <Text style={s.muted}>
                {signature.name ?? ""}
                {signature.at ? ` · ${new Date(signature.at).toLocaleDateString(snap.locale || "en-US")}` : ""}
              </Text>
            </View>
          ) : (
            <View style={s.sign} wrap={false}>
              <Text style={s.signLine}>Approved by (signature)</Text>
              <Text style={[s.signLine, { width: 140 }]}>Date</Text>
            </View>
          )
        ) : null}

        <View style={s.footer} fixed>
          <Text>{snap.footer || [snap.business.name, number].filter(Boolean).join(" · ")}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDocPdf(props: DocPdfProps): Promise<Blob> {
  // A site path like "/brand/logo.png" needs the full address for the PDF renderer.
  const logo = props.snap.business.logo?.startsWith("/") ? window.location.origin + props.snap.business.logo : props.snap.business.logo;
  return pdf(<DocPdfDocument {...props} snap={{ ...props.snap, business: { ...props.snap.business, logo } }} />).toBlob();
}
