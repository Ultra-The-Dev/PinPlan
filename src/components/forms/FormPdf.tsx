// Branded form PDF (@react-pdf/renderer): every field, tables with totals, calcs, photos and signatures with times and
// "signed on behalf" text, and the template version. Same header as the daily log PDF. Loaded with a dynamic import.
import { docBrand } from "@/lib/brandDefaults";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { answerText, columnTotals, computeCalcs, formatNumber, formHistory, tableRows } from "@/lib/forms/forms";
import { signatureLines } from "@/lib/forms/signature";
import type { BusinessSettings, FormField, JobForm } from "@/lib/types";

export interface FormPdfPhoto {
  /** Data URL, or null when the photo was deleted / isn't on this device. */
  src: string | null;
  width: number;
  height: number;
  caption?: string | null;
}

export interface FormPdfData {
  form: JobForm;
  business: BusinessSettings;
  clientName: string;
  address: string;
  /** Photos per photo field id. */
  photos: Record<string, FormPdfPhoto[]>;
  /** Signature images by image id (data URLs). */
  signatures: Record<string, string>;
  /** "First floor · Camera 3" when the form is pinned to the plan. */
  place?: string | null;
  /** Formats an ISO time for people ("Nov 19, 2026, 3:04 PM"). */
  when: (iso: string) => string;
}

const MUTED = "#64748b";
const LINE = "#e2e8f0";
const CONTENT_W = 612 - 72;
const CELL_W = (CONTENT_W - 12) / 2;
const IMG_H = 170;

export function FormDocument({ d }: { d: FormPdfData }) {
  const brand = docBrand(d.business.brandColor);
  const f = d.form;
  const calcs = computeCalcs(f.template, f.values);
  const s = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827" },
    bar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: brand },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
    muted: { color: MUTED, fontSize: 9, lineHeight: 1.4 },
    section: { fontFamily: "Helvetica-Bold", color: brand, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12, marginBottom: 4 },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
    label: { width: 200, paddingRight: 10, color: "#334155" },
    value: { flex: 1, fontFamily: "Helvetica-Bold" },
    th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, paddingVertical: 4, paddingHorizontal: 4 },
    td: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 4 },
    footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
  });
  const ynColor = (v: unknown) => (v === "yes" ? "#047857" : v === "no" ? "#b91c1c" : undefined);
  const fit = (p: FormPdfPhoto) => {
    const k = Math.min(CELL_W / Math.max(1, p.width), IMG_H / Math.max(1, p.height));
    return { width: p.width * k, height: p.height * k };
  };

  const field = (x: FormField, i: number) => {
    const v = f.values[x.id];
    if (x.type === "heading") return <Text key={i} style={s.section} minPresenceAhead={40}>{x.label}</Text>;
    if (x.type === "calc") {
      const n = calcs[x.id];
      return (
        <View key={i} style={[s.row, { backgroundColor: "#f8fafc" }]} wrap={false}>
          <Text style={[s.label, { fontFamily: "Helvetica-Bold" }]}>{x.label}</Text>
          <Text style={[s.value, { fontSize: 11 }]}>{n == null ? "—" : `${formatNumber(n)}${x.unit ? ` ${x.unit}` : ""}`}</Text>
        </View>
      );
    }
    if (x.type === "table") {
      const rows = tableRows(v);
      const cols = x.columns ?? [];
      const totals = columnTotals(x, rows);
      return (
        <View key={i} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{x.label}</Text>
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", backgroundColor: "#f1f5f9" }}>
            <Text style={[s.th, { width: 22 }]}>#</Text>
            {cols.map((c) => (
              <Text key={c.id} style={[s.th, { flex: 1 }]}>
                {c.label}
                {c.unit ? ` (${c.unit})` : ""}
              </Text>
            ))}
          </View>
          {rows.length === 0 && <Text style={[s.td, { color: MUTED }]}>No rows</Text>}
          {rows.map((r, k) => (
            <View key={k} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE }} wrap={false}>
              <Text style={[s.td, { width: 22, color: MUTED }]}>{k + 1}</Text>
              {cols.map((c) => (
                <Text key={c.id} style={[s.td, { flex: 1, color: c.type === "yesno" ? ynColor(r[c.id]) : undefined }]}>
                  {answerText({ ...c, unit: undefined }, r[c.id]) || "—"}
                </Text>
              ))}
            </View>
          ))}
          {Object.keys(totals).length > 0 && rows.length > 0 && (
            <View style={{ flexDirection: "row" }}>
              <Text style={[s.td, { width: 22 }]} />
              {cols.map((c) => (
                <Text key={c.id} style={[s.td, { flex: 1, fontFamily: "Helvetica-Bold" }]}>
                  {c.id in totals ? `Total ${formatNumber(totals[c.id])}` : ""}
                </Text>
              ))}
            </View>
          )}
        </View>
      );
    }
    if (x.type === "photo") {
      const ps = d.photos[x.id] ?? [];
      return (
        <View key={i} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{x.label}</Text>
          {ps.length === 0 ? (
            <Text style={s.muted}>No photos</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              {ps.map((p, k) => (
                <View key={k} style={{ width: CELL_W, marginBottom: 8 }} wrap={false}>
                  <View style={{ height: IMG_H, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 4 }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                    {p.src ? <Image src={p.src} style={fit(p)} /> : <Text style={s.muted}>Photo missing (deleted or not on this device)</Text>}
                  </View>
                  {p.caption ? <Text style={[s.muted, { marginTop: 3, fontSize: 8 }]}>{p.caption}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }
    if (x.type === "signature") {
      const sg = (f.signatures ?? []).find((y) => y.fieldId === x.id);
      const img = sg ? d.signatures[sg.imageId] : undefined;
      return (
        <View key={i} style={{ marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, flexDirection: "row" }} wrap={false}>
          <View style={{ width: 200, height: 70, marginRight: 12, justifyContent: "center", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#94a3b8" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {img ? <Image src={img} style={{ maxWidth: 196, maxHeight: 66, objectFit: "contain" }} /> : <Text style={s.muted}>{sg ? "Signature image missing" : "Not signed"}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{x.label}</Text>
            {sg ? signatureLines(sg, d.when(sg.signedAt)).map((t, k) => <Text key={k} style={k === 0 ? { fontSize: 10 } : s.muted}>{t}</Text>) : <Text style={s.muted}>—</Text>}
          </View>
        </View>
      );
    }
    const text = answerText(x, v);
    if (x.type === "longtext")
      return (
        <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 }}>
          <Text style={{ color: "#334155", marginBottom: 2 }}>{x.label}</Text>
          <Text style={{ lineHeight: 1.45 }}>{text || "—"}</Text>
        </View>
      );
    return (
      <View key={i} style={s.row} wrap={false}>
        <Text style={s.label}>{x.label}</Text>
        <Text style={[s.value, { color: x.type === "yesno" ? ynColor(v) : undefined }]}>{text || "—"}</Text>
      </View>
    );
  };

  const history = formHistory(f);
  const status = f.status === "submitted" ? `Submitted${f.submittedAt ? ` ${d.when(f.submittedAt)}` : ""}${f.submittedBy ? ` by ${f.submittedBy}` : ""}` : "Draft — not submitted";
  return (
    <Document title={f.name} author={d.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <View style={s.head}>
          <View style={{ maxWidth: 330 }}>
            <Text style={s.title}>{f.name}</Text>
            <Text style={s.muted}>{[d.clientName, d.address].filter(Boolean).join(" · ")}</Text>
            <Text style={s.muted}>{status}</Text>
            {d.place ? <Text style={s.muted}>Plan location: {d.place}</Text> : null}
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
        {f.template.fields.map(field)}
        {history.length > 0 && (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={s.section}>History</Text>
            {history.map((h, k) => (
              <Text key={k} style={s.muted}>
                {d.when(h.at)} — {h.text}
                {h.by ? ` (${h.by})` : ""}
              </Text>
            ))}
          </View>
        )}
        <View style={s.footer} fixed>
          <Text>
            {f.template.name} · template v{f.template.version || 1}
          </Text>
          <Text>{d.business.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderFormPdf(d: FormPdfData): Promise<Blob> {
  const logo = d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo;
  return pdf(<FormDocument d={{ ...d, business: { ...d.business, logo } }} />).toBlob();
}
