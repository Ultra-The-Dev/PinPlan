"use client";
// Job → Changes (office only): the change order log, with the contract value it adds up to.
import { CalendarClock, ChevronRight, Download, FilePlus2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { baseContractMarkers, changeOrderTotals, coCode, contractFromQuote, nextCoNumber, reasonLabel, type CoPricing } from "@/lib/changeOrders";
import { db, newId, nowIso } from "@/lib/db";
import { useJobDocs } from "@/lib/docActions";
import { latestApprovedQuote } from "@/lib/documents";
import { downloadBlob, slug } from "@/lib/download";
import { formatMoney, projectEstimate } from "@/lib/estimate";
import { fmtDate, useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { ChangeOrder } from "@/lib/types";
import ChangeOrderEditor from "./ChangeOrderEditor";
import StatusChip from "./StatusChip";
import { useChangeOrders } from "./useChangeOrders";

const shortDate = (iso: string | null | undefined) => (iso ? fmtDate(iso, { month: "short", day: "numeric" }) : "");

export default function ChangeOrdersTab() {
  const t = useT();
  const project = useEditor((s) => s.project);
  const sheets = useEditor((s) => s.sheets);
  const markers = useEditor((s) => s.markers);
  const runs = useEditor((s) => s.runs);
  const closets = useEditor((s) => s.closets);
  const catalog = useEditor((s) => s.catalog);
  const products = useEditor((s) => s.products);
  const settings = useEditor((s) => s.settings);
  const estimateLines = useEditor((s) => s.estimateLines);
  const email = useSyncStatus((s) => s.email);
  const { rows, save, reload } = useChangeOrders(project?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pricing: CoPricing | null = useMemo(() => (settings ? { ...settings.pricing, ...(project?.pricing ?? {}) } : null), [settings, project?.pricing]);
  // The original contract leaves out devices priced on change orders, so confirming them on the plan doesn't count them twice.
  const baseMarkers = useMemo(() => baseContractMarkers(markers, rows ?? []), [markers, rows]);
  const estimate = useMemo(
    () => (pricing && project ? projectEstimate({ project, sheets, markers: baseMarkers, runs, closets, estimateLines }, catalog, products, pricing) : null),
    [pricing, project, sheets, baseMarkers, runs, closets, estimateLines, catalog, products],
  );
  // Changes add to the approved quote (the newest one). Without one, the live pricing stands in, marked "Not approved yet".
  const { docs } = useJobDocs(project?.id);
  const approvedQuote = useMemo(() => latestApprovedQuote(docs ?? []), [docs]);
  const summary = useMemo(() => contractFromQuote(approvedQuote?.total ?? null, estimate?.total ?? 0, rows ?? []), [approvedQuote?.total, estimate?.total, rows]);

  if (!project || !settings || !pricing || !rows) return <div className="p-6 text-slate-500">{t("Loading…")}</div>;
  const cur = pricing.currency;
  const open = openId ? rows.find((c) => c.id === openId) : null;
  if (open)
    return (
      <ChangeOrderEditor
        key={open.id}
        co={open}
        all={rows}
        pricing={pricing}
        onSave={save}
        onReload={reload}
        onOpen={setOpenId}
        onClose={() => {
          setOpenId(null);
          void reload();
        }}
      />
    );

  async function create() {
    if (!project || !pricing) return;
    const now = nowIso();
    const co: ChangeOrder = {
      id: newId(),
      projectId: project.id,
      // Deleted change orders keep their numbers too (the list hides them).
      number: nextCoNumber(await db().changeOrders.where("projectId").equals(project.id).toArray()),
      title: "",
      reason: "client_request",
      description: "",
      status: "draft",
      lines: [],
      markupPct: pricing.markupPct,
      taxPct: pricing.taxPct,
      scheduleDays: null,
      photoIds: [],
      sheetIds: [],
      markerIds: [],
      createdBy: email ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await save(co);
    setOpenId(co.id);
  }

  async function logPdf() {
    if (!project || !settings || !pricing) return;
    setBusy(true);
    try {
      const { renderChangeOrderLogPdf } = await import("./ChangeOrderPdf");
      const blob = await renderChangeOrderLogPdf({ project, business: settings.business, currency: cur, cos: rows ?? [], summary });
      downloadBlob(blob, `${slug(project.address || project.clientName || "job")}-change-orders.pdf`);
    } catch (e) {
      toast(t("Couldn't make the PDF: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  }

  const quoted = summary.basis === "quote";
  const tiles: { label: string; value: number; hint?: string; strong?: boolean; testId: string }[] = [
    quoted
      ? { label: t("Approved quote"), value: summary.original, hint: approvedQuote?.number ?? undefined, testId: "co-original" }
      : { label: t("Job pricing"), value: summary.original, hint: t("Not approved yet"), testId: "co-original" },
    { label: t("Approved changes"), value: summary.approved, testId: "co-approved" },
    { label: t("Waiting on client"), value: summary.pending, hint: t("drafts and sent"), testId: "co-pending" },
    { label: quoted ? t("New contract total") : t("Total if approved"), value: summary.revised, strong: true, testId: "co-revised" },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="page-title">{t("Change orders")}</h1>
            <p className="text-sm text-slate-500">{t("Extras priced from your catalog, signed by the client before the work.")}</p>
          </div>
          {rows.length > 0 && (
            <button className="btn" onClick={() => void logPdf()} disabled={busy}>
              <Download /> {t("Log PDF")}
            </button>
          )}
          <button className="btn btn-brand" onClick={() => void create()}>
            <Plus /> {t("New change order")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.testId} className={`card px-3 py-2.5 ${tile.strong ? "ring-2 ring-brand-200" : ""}`}>
              <div className="text-xs text-slate-500">{tile.label}</div>
              <div className={`tabular-nums ${tile.strong ? "text-lg font-bold text-brand-700" : "text-base font-semibold"}`} data-testid={tile.testId}>
                {formatMoney(tile.value, cur)}
              </div>
              {tile.hint && <div className="text-[11px] text-slate-400">{tile.hint}</div>}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FilePlus2 className="h-6 w-6" />
            </div>
            <p className="font-semibold">{t("No change orders yet")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {t("Client asked for two more cameras? Price them from the catalog — or straight from the devices you added on the plan — and send a link they sign on their phone.")}
            </p>
            <button className="btn btn-brand mt-4" onClick={() => void create()}>
              <Plus /> {t("New change order")}
            </button>
          </div>
        ) : (
          <ul className="card divide-y divide-slate-100 overflow-hidden" aria-label={t("Change orders")}>
            {rows.map((c) => {
              const totals = changeOrderTotals(c);
              return (
                <li key={c.id}>
                  <button className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 sm:px-4" onClick={() => setOpenId(c.id)}>
                    <div className="hidden w-16 shrink-0 font-mono sm:block text-xs font-semibold text-slate-500">{coCode(c.number)}</div>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate font-medium ${c.status === "void" ? "text-slate-400 line-through" : ""}`}>{c.title || t("Untitled change")}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold sm:hidden">{coCode(c.number)}</span>
                        <span>{t(reasonLabel(c.reason))}</span>
                        <span>
                          ·{" "}
                          {c.status === "approved"
                            ? c.approvedName
                              ? t("approved {date} by {name}", { date: shortDate(c.respondedAt), name: c.approvedName })
                              : t("approved {date}", { date: shortDate(c.respondedAt) })
                            : c.sentAt
                              ? t("sent {date}", { date: shortDate(c.sentAt) })
                              : t("created {date}", { date: shortDate(c.createdAt) })}
                        </span>
                        {!!c.scheduleDays && (
                          <span className="inline-flex items-center gap-0.5">
                            · <CalendarClock className="h-3 w-3" /> {c.scheduleDays > 0 ? "+" : ""}
                            {t("{n}d", { n: c.scheduleDays })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <StatusChip status={c.status} />
                    </div>
                    <div className={`w-24 shrink-0 text-right font-semibold tabular-nums ${c.status === "void" || c.status === "rejected" ? "text-slate-400" : ""}`}>{formatMoney(totals.total, cur)}</div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                  <div className="-mt-2 px-3 pb-2 sm:hidden">
                    <StatusChip status={c.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
