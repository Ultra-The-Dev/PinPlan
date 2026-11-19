"use client";
// The job's quotes, invoices and credit notes ("Billing" tab): list, totals, and the editor for one document.
import { FilePlus2, FileText, Plus, Receipt, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { saveDoc, useJobDocs } from "@/lib/docActions";
import { quoteFromEstimate, type QuoteBuildOptions } from "@/lib/docFromEstimate";
import { useDocSettings } from "@/lib/docSettings";
import { creditNoteFor, displayStatus, docName, duplicateDocument, formatDocDate, formatDocMoney, invoiceFromQuote, invoicesFromQuote, newDocument, normalizeDocSettings, today, type InvoiceMode } from "@/lib/documents";
import { projectEstimate } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import type { DocKind, SalesDoc } from "@/lib/types";
import { ConvertDialog, NewQuoteDialog } from "./DocDialogs";
import DocEditor from "./DocEditor";
import { KindChip, Menu, StatusChip } from "./ui";

export default function DocumentsTab() {
  const router = useRouter();
  const params = useSearchParams();
  const docId = params.get("doc");
  const { project, sheets, markers, runs, closets, catalog, products, settings, estimateLines, updateProject } = useEditor();
  const liveSettings = useDocSettings();
  const ds = useMemo(() => liveSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency), [liveSettings, settings]);
  const { docs, payments } = useJobDocs(project?.id);
  const [dialog, setDialog] = useState<null | "quote" | { convert: SalesDoc }>(null);

  const pricing = useMemo(() => (settings ? { ...settings.pricing, ...(project?.pricing ?? {}) } : null), [settings, project?.pricing]);
  const estimate = useMemo(() => {
    if (!project || !pricing) return null;
    const takeoff = computeTakeoff({ sheets, markers, runs, closets });
    return projectEstimate({ project, sheets, markers, runs, closets, estimateLines }, catalog, products, pricing, takeoff);
  }, [project, pricing, sheets, markers, runs, closets, estimateLines, catalog, products]);

  // A client accepted a quote online: approve the job (once per quote), as with proposals.
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
    void updateProject({ status: "approved" }).then(() => toast(`${accepted.signerName ?? "The client"} accepted ${accepted.number ?? "the quote"} — job marked approved`, "success"));
  }, [accepted, project, updateProject]);

  if (!project || !settings) return <div className="p-6 text-slate-500">Loading…</div>;
  const base = `/project?id=${encodeURIComponent(project.id)}&tab=billing`;
  const open = (id: string) => router.push(`${base}&doc=${encodeURIComponent(id)}`);
  const back = () => router.push(base);
  const ctx = () => ({ id: newId(), now: nowIso(), day: today(), settings: ds });

  async function create(doc: SalesDoc) {
    const saved = await saveDoc(doc);
    open(saved.id);
  }
  const newBlank = (kind: DocKind) => void create(newDocument({ ...ctx(), kind, project: project! }));
  const fromEstimate = (o: QuoteBuildOptions) => {
    if (!estimate) return;
    const base = newDocument({ ...ctx(), kind: "quote", project: project!, settings: ds });
    setDialog(null);
    void create(quoteFromEstimate(base, estimate, { project: project!, sheets, markers, runs, closets, catalog, products }, o, ds));
  };
  const all = docs ?? [];
  const actions = {
    open,
    duplicate: (d: SalesDoc) => void create(duplicateDocument(d, ctx())),
    convert: (d: SalesDoc) => setDialog({ convert: d }),
    credit: (d: SalesDoc) => void create(creditNoteFor(d, ctx())),
  };
  const convert = (q: SalesDoc, how: InvoiceMode) => {
    setDialog(null);
    void create(invoiceFromQuote(q, how, { ...ctx(), prior: invoicesFromQuote(q.id, all) }));
  };

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
        {dialog && typeof dialog === "object" && <ConvertDialog quote={dialog.convert} prior={invoicesFromQuote(dialog.convert.id, all)} settings={ds} onClose={() => setDialog(null)} onCreate={(m) => convert(dialog.convert, m)} />}
      </>
    );

  const money = (n: number) => formatDocMoney(n, ds.currency, ds.locale);
  const live = all.filter((d) => d.status !== "void");
  const quoted = live.filter((d) => d.kind === "quote" && d.status === "accepted").reduce((s, d) => s + d.total, 0);
  const invoiced = live.filter((d) => d.kind === "invoice" && d.status !== "draft").reduce((s, d) => s + d.total, 0);
  const credited = live.filter((d) => d.kind === "credit_note" && d.status !== "draft").reduce((s, d) => s + d.total, 0);
  const balance = live.filter((d) => d.kind === "invoice" && d.status !== "draft").reduce((s, d) => s + d.balanceDue, 0);
  const paid = invoiced - credited - balance;
  const label = (k: DocKind) => ds.kinds[k].label;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="page-title">Quotes & invoices</h2>
          <p className="mt-1 text-sm text-slate-500">
            {label("quote")}s, invoices and payments for this job.{" "}
            <Link href="/settings#invoicing" className="font-medium text-brand-600 hover:underline">
              Invoicing settings
            </Link>
          </p>
        </div>
        <button className="btn btn-brand" onClick={() => setDialog("quote")} disabled={!estimate?.lines.length} title={estimate?.lines.length ? undefined : "Place devices and price the estimate first"}>
          <FilePlus2 /> New {label("quote").toLowerCase()} from job pricing
        </button>
        <Menu
          label="New"
          icon={<Plus />}
          items={[
            { label: `Blank ${label("quote").toLowerCase()}`, icon: <FileText />, onClick: () => newBlank("quote") },
            { label: "Blank invoice", icon: <Receipt />, onClick: () => newBlank("invoice") },
          ]}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accepted quotes" value={money(quoted)} />
        <Stat label="Invoiced" value={money(invoiced)} />
        <Stat label="Paid" value={money(Math.max(0, paid))} />
        <Stat label="Balance due" value={money(balance)} strong={balance > 0} />
      </div>

      {docs === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : all.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Receipt className="h-6 w-6" />
          </div>
          <p className="font-semibold">No {label("quote").toLowerCase()}s or invoices yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Turn the estimate into a {label("quote").toLowerCase()} the client can accept and sign online, then invoice the deposit and the balance and record payments.</p>
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
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50" onClick={() => open(d.id)}>
                  <KindChip kind={d.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{docName(d, ds)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[d.title, d.client?.name, d.issueDate ? formatDocDate(d.issueDate, ds.locale) : null, d.kind === "invoice" && d.dueDate ? `due ${formatDocDate(d.dueDate, ds.locale)}` : null, d.invoiceType && d.invoiceType !== "standard" ? d.invoiceType : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <StatusChip status={st} />
                  <span className="w-28 text-right">
                    <span className="block font-semibold tabular-nums">{formatDocMoney(d.total, d.currency, ds.locale)}</span>
                    {d.kind === "invoice" && d.status !== "draft" && d.status !== "void" && d.balanceDue !== d.total ? <span className="block text-xs text-slate-500 tabular-nums">due {formatDocMoney(d.balanceDue, d.currency, ds.locale)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {dialog === "quote" && estimate && <NewQuoteDialog settings={ds} estimateTotal={money(estimate.subtotal)} onClose={() => setDialog(null)} onCreate={fromEstimate} />}
      {dialog && typeof dialog === "object" && <ConvertDialog quote={dialog.convert} prior={invoicesFromQuote(dialog.convert.id, all)} settings={ds} onClose={() => setDialog(null)} onCreate={(m) => convert(dialog.convert, m)} />}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${strong ? "text-brand-700" : ""}`}>{value}</div>
    </div>
  );
}
