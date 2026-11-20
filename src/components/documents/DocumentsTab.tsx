"use client";
// The job's quotes, invoices and credit notes (Money tab): list, totals, and the editor for one document. The Quote
// step lists the quotes; the Invoices & payments step lists invoices, credit notes and payments (?step=).
import { FilePlus2, FileText, Receipt, Settings } from "lucide-react";
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
  docsForStep,
  docStepFor,
  documentTotals,
  duplicateDocument,
  formatDocDate,
  formatDocMoney,
  invoiceFromQuote,
  invoicesFromQuote,
  jobBilling,
  newDocument,
  normalizeDocSettings,
  PAYMENT_METHODS,
  today,
  type BillableChange,
  type DocStep,
  type InvoiceMode,
} from "@/lib/documents";
import { projectEstimate } from "@/lib/estimate";
import { useT } from "@/lib/i18n";
import { isOnlinePayment } from "@/lib/onlinePay";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import type { DocKind, SalesDoc } from "@/lib/types";
import { useChangeOrders } from "../changeOrders/useChangeOrders";
import { ConvertDialog, NewQuoteDialog } from "./DocDialogs";
import DocEditor from "./DocEditor";
import { KindChip, StatusChip } from "./ui";

type ConvertMode = InvoiceMode["mode"];

export default function DocumentsTab() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const docId = params.get("doc");
  // "&bill=deposit" (from "Bill the deposit" on an approved quote): open the invoice dialog on that quote.
  const billAsk = params.get("bill");
  // Old links (?tab=billing) carry no step until the job page rewrites them: those were quote links.
  const step: DocStep = params.get("step") === "invoices" ? "invoices" : "quote";
  const { project, sheets, markers, runs, closets, catalog, products, settings, estimateLines, updateProject } = useEditor();
  const liveSettings = useDocSettings();
  const ds = useMemo(() => liveSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency), [liveSettings, settings]);
  const { docs, payments } = useJobDocs(project?.id);
  // A client's approval becomes the approved quote in MoneyTab (useApprovedProposalQuote), on every step.
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
    void updateProject({ status: "approved" }).then(() =>
      toast(
        accepted.number
          ? t("{name} approved {number} — job marked approved", { name: accepted.signerName ?? t("The client"), number: accepted.number })
          : t("{name} approved the quote — job marked approved", { name: accepted.signerName ?? t("The client") }),
        "success",
      ),
    );
  }, [accepted, project, updateProject, t]);

  const all = useMemo(() => docs ?? [], [docs]);
  // Approved change orders not on an invoice yet (each is billed once).
  const unbilled: BillableChange[] = useMemo(() => billableChanges(changeOrders ?? [], billedChangeOrderIds(all)), [changeOrders, all]);
  const approvedChanges = useMemo(() => contractSummary(0, changeOrders ?? []).approved, [changeOrders]);

  // Open the invoice dialog asked for in the link, once the quote is here; then drop the ask from the address.
  const asked = billAsk && docId ? all.find((d) => d.id === docId && d.kind === "quote") : null;
  useEffect(() => {
    if (!asked || !project) return;
    const timer = window.setTimeout(() => {
      setDialog({ convert: asked, mode: billAsk === "deposit" ? "deposit" : billAsk === "balance" ? "final" : undefined });
      router.replace(`/project?id=${encodeURIComponent(project.id)}&tab=money&step=quote&doc=${encodeURIComponent(asked.id)}`);
    }, 0);
    return () => window.clearTimeout(timer);
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

  if (!project || !settings) return <div className="p-6 text-slate-500">{t("Loading…")}</div>;
  const stepHref = (st: DocStep) => `/project?id=${encodeURIComponent(project.id)}&tab=money&step=${st}`;
  // A document opens under its own step (quotes under Quote, invoices and credit notes under Invoices & payments).
  const openDoc = (d: Pick<SalesDoc, "id" | "kind">) => router.push(`${stepHref(docStepFor(d.kind))}&doc=${encodeURIComponent(d.id)}`);
  const open = (id: string) => {
    const d = all.find((x) => x.id === id);
    router.push(`${stepHref(d ? docStepFor(d.kind) : step)}&doc=${encodeURIComponent(id)}`);
  };

  async function create(doc: SalesDoc) {
    const saved = await saveDoc(doc);
    openDoc(saved);
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
  const back = () => router.push(stepHref(current ? docStepFor(current.kind) : step));
  if (docId && docs && !current)
    return (
      <div className="p-6 text-slate-500">
        {t("That document isn’t on this device.")}{" "}
        <button className="underline" onClick={back}>
          {t("Back to the list")}
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
  const label = (k: DocKind) => t(ds.kinds[k].label);
  const quoteLabel = label("quote").toLowerCase();

  const shown = docsForStep(all, step);
  const livePayments = payments.filter((p) => !p.deleted).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const docById = new Map(all.map((d) => [d.id, d]));
  const billQuote = b.quote && b.leftToBill && b.leftToBill > 0 ? b.quote : null;
  const firstBill = !!billQuote && !invoicesFromQuote(billQuote.id, all).length;
  const settingsLink = (
    <Link href="/settings#invoicing" className="font-medium text-brand-600 hover:underline">
      {t("Invoicing settings")}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {step === "quote" ? (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">{label("quote")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("What the client approves and signs online, built from the job’s pricing.")} {settingsLink}</p>
          </div>
          <button className="btn btn-brand" onClick={() => setDialog("quote")} disabled={!estimate?.lines.length} title={estimate?.lines.length ? undefined : t("Place devices and price the job first")}>
            <FilePlus2 /> {t("New {label} from job pricing", { label: quoteLabel })}
          </button>
          <button className="btn" onClick={() => newBlank("quote")}>
            <FileText /> {t("Blank {label}", { label: quoteLabel })}
          </button>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">{t("Invoices & payments")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("Bill the approved {label}, record payments and credit notes.", { label: quoteLabel })} {settingsLink}</p>
          </div>
          {/* The first bill has its own "Next: bill the …" banner below, so the button shows from the second bill on. */}
          {billQuote && !firstBill && (
            <button className="btn btn-brand" onClick={() => actions.convert(billQuote)}>
              <Receipt /> {t("Create invoice")}
            </button>
          )}
          <button className="btn" onClick={() => newBlank("invoice")}>
            <FileText /> {t("Blank invoice")}
          </button>
        </div>
      )}

      <div className={`mb-5 grid grid-cols-2 gap-3 ${step === "invoices" ? "sm:grid-cols-4" : ""}`}>
        <Stat
          label={t("Approved {label}", { label: quoteLabel })}
          value={b.quote ? money(b.contract ?? 0) : t("Not yet")}
          sub={b.quote ? (approvedChanges ? t("{name} + {amount} in changes", { name: docName(b.quote, ds), amount: money(approvedChanges) }) : docName(b.quote, ds)) : undefined}
          onClick={b.quote ? () => openDoc(b.quote!) : undefined}
        />
        {step === "quote" ? (
          <Stat label={t("Left to bill")} value={b.leftToBill == null ? "—" : money(b.leftToBill)} sub={b.billed ? t("{amount} billed", { amount: money(b.billed) }) : undefined} />
        ) : (
          <>
            <Stat label={t("Billed")} value={money(b.billed)} sub={b.paid ? t("{amount} paid", { amount: money(b.paid) }) : undefined} />
            <Stat label={t("Left to bill")} value={b.leftToBill == null ? "—" : money(b.leftToBill)} strong={!!b.leftToBill} />
            <Stat label={t("Unpaid")} value={money(b.unpaid)} strong={b.unpaid > 0} />
          </>
        )}
      </div>
      {billQuote && firstBill ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <span className="min-w-0 flex-1">
            {t("{name} is approved.", { name: docName(billQuote, ds) })} {billQuote.deposit ? t("Next: bill the deposit.") : t("Next: bill the client.")}
          </span>
          <button className="btn btn-sm btn-brand" onClick={() => actions.convert(billQuote, billQuote.deposit ? "deposit" : "final")}>
            <Receipt /> {billQuote.deposit ? t("Bill the deposit ({amount})", { amount: money(documentTotals(billQuote).deposit ?? 0) }) : t("Create invoice")}
          </button>
        </div>
      ) : null}

      {docs === null ? (
        <p className="text-slate-500">{t("Loading…")}</p>
      ) : shown.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {step === "quote" ? <FileText className="h-6 w-6" /> : <Receipt className="h-6 w-6" />}
          </div>
          {step === "quote" ? (
            <>
              <p className="font-semibold">{t("Nothing here yet: {label}", { label: quoteLabel })}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t("Turn the job’s pricing into a {label} the client can approve and sign online. Once it’s approved, bill it under Invoices & payments.", { label: quoteLabel })}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">{t("No invoices yet")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                {b.quote
                  ? t("Bill the deposit and the balance of {name}, then record payments here.", { name: docName(b.quote, ds) })
                  : t("Once the client approves a {label}, bill the deposit and the balance here and record payments.", { label: quoteLabel })}{" "}
                {!b.quote && (
                  <Link href={stepHref("quote")} className="font-medium text-brand-600 hover:underline">
                    {t("Go to {label}", { label: label("quote") })}
                  </Link>
                )}
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-slate-400">
            <Settings className="mr-1 inline h-3.5 w-3.5" />
            {t("Set your numbering, terms, taxes and payment details in Settings:")}{" "}
            <Link href="/settings#invoicing" className="underline">
              {t("Settings → Invoicing")}
            </Link>
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {shown.map((d) => {
            const st = displayStatus(d);
            return (
              <li key={d.id}>
                <button className="flex w-full items-center gap-x-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => openDoc(d)}>
                  <span className="hidden sm:inline-flex">
                    <KindChip kind={d.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{docName(d, ds)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[d.title, d.client?.name, d.issueDate ? formatDocDate(d.issueDate, ds.locale) : null, d.kind === "invoice" && d.dueDate ? t("due {date}", { date: formatDocDate(d.dueDate, ds.locale) }) : null, d.invoiceType && d.invoiceType !== "standard" ? t(d.invoiceType) : null, d.options?.changeOrderIds?.length ? t("change orders") : null].filter(Boolean).join(" · ")}
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
                    {d.kind === "invoice" && d.status !== "draft" && d.status !== "void" && d.balanceDue !== d.total ? <span className="block text-xs text-slate-500 tabular-nums">{t("due {amount}", { amount: formatDocMoney(d.balanceDue, d.currency, ds.locale) })}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {step === "invoices" && livePayments.length > 0 && (
        <section className="mt-6">
          <h3 className="section-title mb-2">{t("Payments")}</h3>
          <ul className="card divide-y divide-slate-100" aria-label={t("Payments")}>
            {livePayments.map((p) => {
              const inv = docById.get(p.documentId);
              return (
                <li key={p.id}>
                  <button className={`flex w-full items-center gap-x-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${p.voided ? "text-slate-400 line-through" : ""}`} onClick={() => inv && openDoc(inv)} disabled={!inv}>
                    <span className="w-24 shrink-0 tabular-nums text-slate-500">{formatDocDate(p.date, ds.locale)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {t(PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? p.method)}
                      {isOnlinePayment(p) ? ` · ${p.amount < 0 ? t("Refunded in Stripe") : t("Paid online")}` : p.reference ? ` · ${p.reference}` : ""}
                      {inv ? <span className="text-slate-500"> · {docName(inv, ds)}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatDocMoney(p.amount, inv?.currency ?? ds.currency, ds.locale)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
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
