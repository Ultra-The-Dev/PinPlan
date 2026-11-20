// Task / punch report PDF (@react-pdf/renderer), same look as the daily log PDF: the company header, then the filtered
// tasks grouped by sheet or assignee, each with a plan crop around its pin, its first photo and a checklist summary.
// Loaded with a dynamic import so it stays out of SSR. No prices, ever.
import { docBrand } from "@/lib/brandDefaults";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { BusinessSettings } from "@/lib/types";

export interface TaskPdfEntry {
  number: number;
  title: string;
  status: string;
  statusColor: string;
  priority?: string | null;
  category?: string | null;
  assignee?: string | null;
  due?: string | null;
  overdue?: boolean;
  where: string;
  description?: string | null;
  checklist?: { done: number; total: number; items: { text: string; done: boolean }[] } | null;
  tags?: string[];
  meta: string;
  /** Plan crop around the pin (data URL), if pinned. */
  crop?: string | null;
  /** First photo (data URL) and its size. */
  photo?: { src: string; width: number; height: number } | null;
}

export interface TaskPdfData {
  title: string;
  business: BusinessSettings;
  clientName: string;
  address: string;
  /** "Open, In progress · Mike · Overdue", or "All tasks". */
  filterText: string;
  generated: string;
  counts: { label: string; color: string; n: number }[];
  groups: { name: string; tasks: TaskPdfEntry[] }[];
}

const MUTED = "#64748b";
const IMG = 150;

export function TaskReportDocument({ d }: { d: TaskPdfData }) {
  const brand = docBrand(d.business.brandColor);
  const s = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 42, paddingHorizontal: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#0F2340" },
    bar: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: brand },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
    muted: { color: MUTED, fontSize: 9, lineHeight: 1.4 },
    group: { fontFamily: "Helvetica-Bold", color: brand, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 10, marginBottom: 4 },
    task: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 10, paddingBottom: 10 },
    badge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 10 },
    pill: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginRight: 4 },
    footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
  });
  const fit = (p: { width: number; height: number }) => {
    const k = Math.min(IMG / Math.max(1, p.width), IMG / Math.max(1, p.height));
    return { width: p.width * k, height: p.height * k };
  };
  const total = d.groups.reduce((n, g) => n + g.tasks.length, 0);
  return (
    <Document title={d.title} author={d.business.name || undefined}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        <View style={s.head}>
          <View style={{ maxWidth: 330 }}>
            <Text style={s.title}>{d.title}</Text>
            <Text style={s.muted}>{[d.clientName, d.address].filter(Boolean).join(" · ")}</Text>
            <Text style={s.muted}>{[`${total} task${total === 1 ? "" : "s"}`, d.filterText, d.generated].filter(Boolean).join(" · ")}</Text>
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
          {d.counts
            .filter((c) => c.n)
            .map((c) => (
              <Text key={c.label} style={[s.pill, { backgroundColor: c.color, fontSize: 8.5, paddingHorizontal: 7, paddingVertical: 3 }]}>
                {c.label}: {c.n}
              </Text>
            ))}
        </View>
        {d.groups.map((g) => (
          <View key={g.name}>
            <Text style={s.group} minPresenceAhead={90}>
              {g.name} · {g.tasks.length}
            </Text>
            {g.tasks.map((t, i) => (
              <View key={`${t.number}-${i}`} style={s.task} wrap={false}>
                <View style={[s.badge, { backgroundColor: t.statusColor }]}>
                  <Text style={{ color: "#fff", fontFamily: "Helvetica-Bold", fontSize: String(t.number).length > 2 ? 8 : 10 }}>{t.number}</Text>
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11.5 }}>{t.title}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
                    <Text style={[s.pill, { backgroundColor: t.statusColor }]}>{t.status}</Text>
                    {t.priority ? <Text style={[s.pill, { backgroundColor: "#334155" }]}>{t.priority}</Text> : null}
                    {t.category ? <Text style={[s.pill, { backgroundColor: "#64748b" }]}>{t.category}</Text> : null}
                  </View>
                  <Text style={[s.muted, { marginTop: 4 }]}>
                    {[t.where, t.assignee ? `Assigned: ${t.assignee}` : "Unassigned", t.due ? `Due ${t.due}${t.overdue ? " (overdue)" : ""}` : ""].filter(Boolean).join(" · ")}
                  </Text>
                  {t.description ? <Text style={{ marginTop: 5, lineHeight: 1.45 }}>{t.description}</Text> : null}
                  {t.checklist && t.checklist.total > 0 ? (
                    <View style={{ marginTop: 5 }}>
                      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>
                        Checklist {t.checklist.done}/{t.checklist.total}
                      </Text>
                      {t.checklist.items.map((c, k) => (
                        <Text key={k} style={{ fontSize: 8.5, color: c.done ? MUTED : "#0F2340", marginTop: 1 }}>
                          {c.done ? "[x]" : "[  ]"} {c.text}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {t.tags?.length ? <Text style={[s.muted, { marginTop: 4, fontSize: 8 }]}>{t.tags.map((x) => `#${x}`).join("  ")}</Text> : null}
                  <Text style={[s.muted, { marginTop: 4, fontSize: 7.5 }]}>{t.meta}</Text>
                </View>
                {t.crop ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                  <Image src={t.crop} style={{ width: IMG * 0.8, height: IMG * 0.8, marginLeft: 6, borderRadius: 3 }} />
                ) : null}
                {t.photo ? (
                  <View style={{ width: IMG, height: IMG, marginLeft: 6, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: 3 }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                    <Image src={t.photo.src} style={fit(t.photo)} />
                  </View>
                ) : null}
              </View>
            ))}
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

export async function renderTaskReportPdf(d: TaskPdfData): Promise<Blob> {
  const logo = d.business.logo?.startsWith("/") ? window.location.origin + d.business.logo : d.business.logo;
  return pdf(<TaskReportDocument d={{ ...d, business: { ...d.business, logo } }} />).toBlob();
}
