"use client";
// The job's quotes, invoices and credit notes (Money tab): list, totals, and the editor for one document.
import { FilePlus2, FileText, Plus, Receipt, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { billableChanges, contractSummary } from "@/lib/changeOrders";
import { newId, nowIso } from "@/lib/db";
import { saveDoc, useJobDocs } from "@/lib/docActions";
import { quoteFromEstimate, type QuoteBuildOptions } from "@/lib/docFromEstimate";
import { useDocSettings } from "@/lib/docSettings";
import {
  billedChangeOrderIds,
  creditNoteFor,
  displayStatus,
  docName,
  documentTotals,
  duplicateDocument,
  formatDocDate,
  formatDocMoney,
  invoiceFromQuote,
  invoicesFromQuote,
  jobBilling,
  newDocument,
  normalizeDocSettings,
  today,
  type BillableChange,
  type InvoiceMode,
} from "@/lib/documents";
import { projectEstimate } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import type { DocKind, SalesDoc } from "@/lib/types";
import { useChangeOrders } from "../changeOrders/useChangeOrders";
import { ConvertDialog, NewQuoteDialog } from "./DocDialogs";
import DocEditor from "./DocEditor";
import { KindChip, Menu, StatusChip } from "./ui";

type ConvertMode = InvoiceMode["mode"];

export default function DocumentsTab() {
  const router = useRouter();
  const params = useSearchParams();
  const docId = params.get("doc");
  // "&bill=deposit" (from "Bill the deposit" on an approved quote): open the invoice dialog on that quote.
  const billAsk = params.get("bill");
  const { project, sheets, markers, runs, closets, catalog, products, settings, estimateLines, updateProject } = useEditor();
  const liveSettings = useDocSettings();
  const ds = useMemo(() => liveSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency), [liveSettings, settings]);
  const { docs, payments } = useJobDocs(project?.id);
  const { rows: changeOrders } = useChangeOrders(project?.id);
  const [dialog, setDialog] = useState<null | "quote" | { convert: SalesDoc; mode?: ConvertMode }>(null);

  const pricing = useMemo(() => (settings ? { ...settings.pricing, ...(project?.pricing ?? {}) } : null), [settings, project?.pricing]);
  const estimate = useMemo(() => {
    if (!project || !pricing) return null;
    const takeoff = computeTakeoff({ sheets, markers, runs, closets });
    return projectEstimate({ project, sheets, markers, runs, closets, estimateLines }, catalog, products, pricing, takeoff);
  }, [project, pricing, sheets, markers, runs, closets, estimateLines, catalog, products]);

  // A client approved a quote online: approve the job (once per quote), as with proposals.
  const accepted = docs?.find((d) => d.kind === "quote" && d.status === "accepted" && d.respondedAt);
  useEffect(() => {
    if (!accepted || !project || project.status !== "estimate") return;
    const key = `pinplan.doc.applied.${accepted.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: the status check above still stops repeats */
    }
    void updateProject({ status: "approved" }).then(() => toast(`${accepted.signerName ?? "The client"} approved ${accepted.number ?? "the quote"} — job marked approved`, "success"));
  }, [accepted, project, updateProject]);

  const all = useMemo(() => docs ?? [], [docs]);
  // Approved change orders not on an invoice yet (each is billed once).
  const unbilled: BillableChange[] = useMemo(() => billableChanges(changeOrders ?? [], billedChangeOrderIds(all)), [changeOrders, all]);
  const approvedChanges = useMemo(() => contractSummary(0, changeOrders ?? []).approved, [changeOrders]);

  // Open the invoice dialog asked for in the link, once the quote is here; then drop the ask from the address.
  const asked = billAsk && docId ? all.find((d) => d.id === docId && d.kind === "quote") : null;
  useEffect(() => {
    if (!asked || !project) return;
    const t = window.setTimeout(() => {
      setDialog({ convert: asked, mode: billAsk === "deposit" ? "deposit" : billAsk === "balance" ? "final" : undefined });
      router.replace(`/project?id=${encodeURIComponent(project.id)}&tab=billing&doc=${encodeURIComponent(asked.id)}`);
    }, 0);
    return () => window.clearTimeout(t);
  }, [asked, billAsk, project, router]);

  const ctx = useCallback(() => ({ id: newId(), now: nowIso(), day: today(), settings: ds }), [ds]);
  const buildQuote = useCallback(
    (o: QuoteBuildOptions): SalesDoc | null => {
      if (!estimate || !project) return null;
      const base = newDocument({ ...ctx(), kind: "quote", project, settings: ds });
      return quoteFromEstimate(base, estimate, { project, sheets, markers, runs, closets, catalog, products }, o, ds, pricing?.taxPct ?? 0);
    },
    [estimate, project, ctx, ds, sheets, markers, runs, closets, catalog, products, pricing?.taxPct],
  );

  if (!project || !settings) return <div className="p-6 text-slate-500">Loading…</div>;
  const base = `/project?id=${encodeURIComponent(project.id)}&tab=billing`;
  const open = (id: string) => router.push(`${base}&doc=${encodeURIComponent(id)}`);
  const back = () => router.push(base);

  async function create(doc: SalesDoc) {
    const saved = await saveDoc(doc);
    open(saved.id);
  }
  const newBlank = (kind: DocKind) => void create(newDocument({ ...ctx(), kind, project: project! }));
  const fromEstimate = (o: QuoteBuildOptions) => {
    const q = buildQuote(o);
    setDialog(null);
    if (q) void create(q);
  };
  const actions = {
    open,
    duplicate: (d: SalesDoc) => void create(duplicateDocument(d, ctx())),
    convert: (d: SalesDoc, mode?: ConvertMode) => setDialog({ convert: d, mode }),
    credit: (d: SalesDoc) => void create(creditNoteFor(d, ctx())),
  };
  const convert = (q: SalesDoc, how: InvoiceMode, changes: BillableChange[]) => {
    setDialog(null);
    void create(invoiceFromQuote(q, how, { ...ctx(), prior: invoicesFromQuote(q.id, all), changes }));
  };
  const convertDialog = dialog && typeof dialog === "object" && (
    <ConvertDialog
      key={dialog.convert.id + (dialog.mode ?? "")}
      quote={dialog.convert}
      prior={invoicesFromQuote(dialog.convert.id, all)}
      settings={ds}
      changes={unbilled}
      initialMode={dialog.mode}
      onClose={() => setDialog(null)}
      onCreate={(m, changes) => convert(dialog.convert, m, changes)}
    />
  );

  const current = docId ? all.find((d) => d.id === docId) : null;
  if (docId && docs && !current)
    return (
      <div className="p-6 text-slate-500">
        That document isn’t on this device.{" "}
        <button className="underline" onClick={back}>
          Back to the list
        </button>
      </div>
    );
  if (current)
    return (
      <>
        <DocEditor key={current.id} doc={current} payments={payments} allDocs={all} settings={ds} business={settings.business} project={project} onBack={back} actions={actions} />
        {convertDialog}
      </>
    );

  const money = (n: number) => formatDocMoney(n, ds.currency, ds.locale);
  const b = jobBilling(all, approvedChanges);
  const label = (k: DocKind) => ds.kinds[k].label;
  const quoteLabel = label("quote").toLowerCase();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="page-title">Money</h2>
          <p className="mt-1 text-sm text-slate-500">
            {label("quote")}s, invoices and payments for this job.{" "}
            <Link href="/settings#invoicing" className="font-medium text-brand-600 hover:underline">
              Invoicing settings
            </Link>
          </p>
        </div>
        <button className="btn btn-brand" onClick={() => setDialog("quote")} disabled={!estimate?.lines.length} title={estimate?.lines.length ? undefined : "Place devices and price the job first"}>
          <FilePlus2 /> New {quoteLabel} from job pricing
        </button>
        <Menu
          label="New"
          icon={<Plus />}
          items={[
            { label: `Blank ${quoteLabel}`, icon: <FileText />, onClick: () => newBlank("quote") },
            { label: "Blank invoice", icon: <Receipt />, onClick: () => newBlank("invoice") },
          ]}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={`Approved ${quoteLabel}`}
          value={b.quote ? money(b.contract ?? 0) : "Not yet"}
          sub={b.quote ? `${docName(b.quote, ds)}${approvedChanges ? ` + ${money(approvedChanges)} in changes` : ""}` : undefined}
          onClick={b.quote ? () => open(b.quote!.id) : undefined}
        />
        <Stat label="Billed" value={money(b.billed)} sub={b.paid ? `${money(b.paid)} paid` : undefined} />
        <Stat label="Left to bill" value={b.leftToBill == null ? "—" : money(b.leftToBill)} strong={!!b.leftToBill} />
        <Stat label="Unpaid" value={money(b.unpaid)} strong={b.unpaid > 0} />
      </div>
      {b.quote && b.leftToBill && b.leftToBill > 0 && !invoicesFromQuote(b.quote.id, all).length ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <span className="min-w-0 flex-1">
            {docName(b.quote, ds)} is approved. {b.quote.deposit ? "Next: bill the deposit." : "Next: bill the client."}
          </span>
          <button className="btn btn-sm btn-brand" onClick={() => actions.convert(b.quote!, b.quote!.deposit ? "deposit" : "final")}>
            <Receipt /> {b.quote.deposit ? `Bill the deposit (${money(documentTotals(b.quote).deposit ?? 0)})` : "Create invoice"}
          </button>
        </div>
      ) : null}

      {docs === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : all.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Receipt className="h-6 w-6" />
          </div>
          <p className="font-semibold">No {quoteLabel}s or invoices yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Turn the job’s pricing into a {quoteLabel} the client can approve and sign online, then bill the deposit and the balance and record payments.</p>
          <p className="mt-3 text-xs text-slate-400">
            <Settings className="mr-1 inline h-3.5 w-3.5" />
            Set your numbering, terms, taxes and payment details in{" "}
            <Link href="/settings#invoicing" className="underline">
              Settings → Invoicing
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {all.map((d) => {
            const st = displayStatus(d);
            return (
              <li key={d.id}>
                <button className="flex w-full items-center gap-x-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => open(d.id)}>
                  <span className="hidden sm:inline-flex">
                    <KindChip kind={d.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{docName(d, ds)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[d.title, d.client?.name, d.issueDate ? formatDocDate(d.issueDate, ds.locale) : null, d.kind === "invoice" && d.dueDate ? `due ${formatDocDate(d.dueDate, ds.locale)}` : null, d.invoiceType && d.invoiceType !== "standard" ? d.invoiceType : null, d.options?.changeOrderIds?.length ? "change orders" : null].filter(Boolean).join(" · ")}
                    </span>
                    {/* Phones: type and status under the name, so the number isn't cut off. */}
                    <span className="mt-1 flex gap-1.5 sm:hidden">
                      <KindChip kind={d.kind} />
                      <StatusChip status={st} />
                    </span>
                  </span>
                  <span className="hidden sm:inline-flex">
                    <StatusChip status={st} />
                  </span>
                  <span className="w-28 shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{formatDocMoney(d.total, d.currency, ds.locale)}</span>
                    {d.kind === "invoice" && d.status !== "draft" && d.status !== "void" && d.balanceDue !== d.total ? <span className="block text-xs text-slate-500 tabular-nums">due {formatDocMoney(d.balanceDue, d.currency, ds.locale)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {dialog === "quote" && estimate && <NewQuoteDialog settings={ds} pricingTotal={estimate.total} preview={buildQuote} onClose={() => setDialog(null)} onCreate={fromEstimate} />}
      {convertDialog}
    </div>
  );
}

function Stat({ label, value, sub, strong, onClick }: { label: string; value: string; sub?: string; strong?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`card px-4 py-3 text-left ${onClick ? "hover:ring-brand-200" : ""}`} onClick={onClick}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${strong ? "text-brand-700" : ""}`}>{value}</div>
      {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
    </Tag>
  );
}
