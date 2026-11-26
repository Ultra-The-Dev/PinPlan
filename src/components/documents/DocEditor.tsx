"use client";
// Edit a quote / invoice / credit note: client, dates, lines, discounts, taxes, notes; live preview; issue, link, email,
// PDF, payments, conversions. Saves on this device as you type (and syncs like the rest of the job).
import {
  ArrowLeft,
  Ban,
  Check,
  CircleCheck,
  CircleX,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileMinus,
  FilePlus2,
  HandCoins,
  Link as LinkIcon,
  Mail,
  Plus,
  Send,
  Trash,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DOCS_EVENT, deleteDraft, issueDoc, linkIsStale, markSent, publishLink, recordPayment, saveDoc, voidDoc, voidPayment } from "@/lib/docActions";
import { buildDocSnapshot, clientDirectory, displayStatus, docName, documentTotals, documentUrl, dueDateFor, formatDocDate, formatDocMoney, invoicesFromQuote, lineId, PAYMENT_METHODS, PAYMENT_TERMS, payUrl, termsLabel, today, wasSent, type InvoiceMode } from "@/lib/documents";
import { isOnlinePayment } from "@/lib/onlinePay";
import { safeSignature } from "@/lib/signatureImage";
import { downloadBlob, slug } from "@/lib/download";
import { emailEnabled } from "@/lib/emailClient";
import { fmtDate, useT } from "@/lib/i18n";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { BusinessSettings, DocClient, DocPayment, DocumentSettings, Project, SalesDoc } from "@/lib/types";
import { EmailDialog, PaymentDialog, type EmailKind } from "./DocDialogs";
import DocView from "./DocView";
import LineEditor from "./LineEditor";
import { KindChip, Menu, Modal, parseAmount, StatusChip } from "./ui";
import BaseModal from "../ui/Modal";
import { fmtPct, roundPct } from "@/lib/percent";

export interface EditorActions {
  duplicate(doc: SalesDoc): void;
  /** Open the invoice dialog for a quote (optionally on a mode: "Bill the deposit"). */
  convert(doc: SalesDoc, mode?: InvoiceMode["mode"]): void;
  credit(doc: SalesDoc): void;
  open(id: string): void;
}

const blankClient: DocClient = { name: "" };

export default function DocEditor({ doc, payments, allDocs, settings, business, project, projects, onBack, actions }: { doc: SalesDoc; payments: DocPayment[]; allDocs: SalesDoc[]; settings: DocumentSettings; business: BusinessSettings; project: Project; projects?: Project[]; onBack: () => void; actions: EditorActions }) {
  const t = useT();
  const [draft, setDraft] = useState<SalesDoc>(doc);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [dialog, setDialog] = useState<null | "payment" | { email: EmailKind } | "client">(null);
  const [canEmail, setCanEmail] = useState(false);
  const online = useSyncStatus((s) => s.online && s.signedIn);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    void emailEnabled().then(setCanEmail);
  }, []);

  // A newer copy arrived (sync: the number, "viewed", the client's answer, payments): take it when nothing is being
  // edited, otherwise take only the fields the server owns.
  const [seen, setSeen] = useState(doc.updatedAt);
  if (doc.updatedAt !== seen) {
    setSeen(doc.updatedAt);
    if (!dirty) setDraft(doc);
    else
      setDraft((d) => ({
        ...d,
        number: doc.number,
        status: doc.status === "draft" ? d.status : doc.status,
        viewedAt: doc.viewedAt,
        respondedAt: doc.respondedAt,
        signerName: doc.signerName,
        signature: doc.signature,
        clientNote: doc.clientNote,
        amountPaid: doc.amountPaid,
        balanceDue: doc.balanceDue,
        paidAt: doc.paidAt,
        shareToken: doc.shareToken,
        shareHash: doc.shareHash,
      }));
  }

  const flush = useCallback(async (d: SalesDoc) => {
    setSaving(true);
    try {
      const out = await saveDoc(d);
      setDirty(false);
      return out;
    } finally {
      setSaving(false);
    }
  }, []);

  // Autosave shortly after the last change.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void flush(draft), 700);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, flush]);
  // And when leaving.
  const latest = useRef({ draft, dirty });
  useEffect(() => {
    latest.current = { draft, dirty };
  }, [draft, dirty]);
  useEffect(
    () => () => {
      if (latest.current.dirty) void saveDoc(latest.current.draft);
    },
    [],
  );

  const edit = (patch: Partial<SalesDoc>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const editClient = (patch: Partial<DocClient>) => edit({ client: { ...(draft.client ?? blankClient), ...patch } });

  const totals = useMemo(() => documentTotals(draft), [draft]);
  const snap = useMemo(() => buildDocSnapshot(draft, { settings, business, origin, now: draft.updatedAt }), [draft, settings, business, origin]);
  const money = (n: number) => formatDocMoney(n, draft.currency, settings.locale);
  const status = displayStatus(draft);
  const isInvoice = draft.kind === "invoice";
  const isQuote = draft.kind === "quote";
  // Void documents, and quotes the client approved (on its link or on a proposal), are read-only (duplicate to change).
  const approval = draft.options?.approval ?? null;
  const signerName = draft.signerName ?? approval?.signerName ?? null;
  const signature = safeSignature(draft.signature ?? approval?.signature ?? null);
  const respondedAt = draft.respondedAt ?? approval?.respondedAt ?? null;
  const clientNote = draft.clientNote ?? approval?.clientNote ?? null;
  const signed = isQuote && draft.status === "accepted" && !!respondedAt;
  const locked = draft.status === "void" || signed;
  const kindLabel = settings.kinds[draft.kind].label;
  // The kind's name on screen (the company's own label stays as typed; the default ones are translated).
  const kindText = t(kindLabel);
  const name = docName(draft, settings);
  const docPayments = payments.filter((p) => p.documentId === draft.id).sort((a, b) => a.date.localeCompare(b.date));
  const credits = allDocs.filter((d) => d.kind === "credit_note" && d.convertedFrom === draft.id && d.status !== "void");
  const madeFrom = draft.convertedFrom ? allDocs.find((d) => d.id === draft.convertedFrom) : null;
  const children = allDocs.filter((d) => d.convertedFrom === draft.id && d.id !== draft.id);
  const stale = linkIsStale(draft, settings, business, origin);
  const link = draft.shareToken ? documentUrl(origin, draft.shareToken) : null;
  const pay = isInvoice ? payUrl(settings.payment.payUrl, { number: draft.number, balanceDue: draft.balanceDue, currency: draft.currency }) : null;
  const directory = useMemo(() => clientDirectory(projects ?? [project], allDocs), [projects, project, allDocs]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const current = async () => (dirty ? await flush(draft) : draft);

  const issue = () =>
    run("issue", async () => {
      const d = await issueDoc(await current(), settings);
      setDraft(d);
      setDirty(false);
      toast(d.number ? t("{kind} {number} finalized — ready to send", { kind: kindText, number: d.number }) : t("{kind} finalized — its number comes on the next sync", { kind: kindText }), "success");
    });

  const sentByHand = () =>
    run("sent", async () => {
      const d = await markSent(await current(), settings);
      setDraft(d);
      setDirty(false);
      toast(t("Marked as sent"), "success");
    });

  const ensureLink = async (): Promise<{ url: string; doc: SalesDoc }> => {
    const d = await current();
    if (d.shareToken && !linkIsStale(d, settings, business, origin) && d.status !== "draft") return { url: documentUrl(origin, d.shareToken), doc: d };
    const r = await publishLink(d, { settings, business, origin });
    setDraft(r.doc);
    setDirty(false);
    return r;
  };

  const copyLink = () =>
    run("link", async () => {
      const { url } = await ensureLink();
      try {
        await navigator.clipboard.writeText(url);
        toast(t("Client link copied — paste it into a text or email"), "success");
      } catch {
        window.prompt(t("Copy this link:"), url);
      }
    });

  const sendEmail = async (r: { to: string; kind: EmailKind; message: string }) => {
    const { doc: d } = await ensureLink();
    const res = await apiFetch("/api/documents/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Our calendar day: the server words a reminder "past due" only once the due date has passed here.
      body: JSON.stringify({ documentId: d.id, token: d.shareToken, to: r.to, kind: r.kind, message: r.message, today: today() }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error || t("Couldn't send the email ({status}).", { status: res.status }));
    const sent = await saveDoc({ ...d, sentAt: d.sentAt ?? new Date().toISOString(), client: d.client.email || !r.to ? d.client : { ...d.client, email: r.to } });
    setDraft(sent);
    setDialog(null);
    toast(t("Emailed to {to}", { to: r.to }), "success");
  };

  const downloadPdf = () =>
    run("pdf", async () => {
      const { renderDocPdf } = await import("./DocPdf");
      const blob = await renderDocPdf({
        snap,
        live: { status: draft.status, number: draft.number, amountPaid: draft.amountPaid, balanceDue: draft.balanceDue, paidAt: draft.paidAt },
        payLink: pay,
        signature: signature ? { name: signerName, image: signature, at: respondedAt } : null,
      });
      downloadBlob(blob, `${slug(draft.number || `${kindLabel}-${project.address || project.clientName}`)}.pdf`);
    });

  const markAnswer = (accepted: boolean) => run("answer", async () => {
    const d = await flush({ ...(await current()), status: accepted ? "accepted" : "declined", issueDate: draft.issueDate || today() });
    setDraft(d);
    toast(accepted ? t("Marked approved") : t("Marked declined"), "success");
  });

  const unsent = draft.status === "draft";
  const handedOver = wasSent(draft);
  const primary = unsent
    ? { label: t("Finalize"), hint: t("Gives it a number and locks prices"), icon: <Check />, onClick: issue }
    : supabaseConfigured
      ? { label: link && !stale ? t("Copy client link") : stale ? t("Update client link") : t("Get client link"), hint: t("A link the client can open, approve and pay from"), icon: <LinkIcon />, onClick: copyLink }
      : !handedOver
        ? { label: t("Mark as sent"), hint: t("You gave the client the PDF yourself"), icon: <Send />, onClick: sentByHand }
        : null;
  const depositAmount = isQuote ? totals.deposit : null;
  const billedYet = isQuote && invoicesFromQuote(draft.id, allDocs).length > 0;

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-icon btn-ghost" onClick={onBack} aria-label={t("Back to the list")} title={t("Back")}>
          <ArrowLeft />
        </button>
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KindChip kind={draft.kind} label={kindText} />
            <h2 className="truncate text-lg font-semibold">{name}</h2>
            <StatusChip status={status} />
          </div>
          <p className="text-xs text-slate-500">
            {saving ? t("Saving…") : dirty ? t("Unsaved changes") : t("All changes saved")}
            {!draft.number && draft.status !== "draft" ? ` · ${t("number comes on the next sync")}` : ""}
            {madeFrom ? (
              <>
                {` · ${t("from")} `}
                <button className="font-medium text-brand-600 hover:underline" onClick={() => actions.open(madeFrom.id)}>
                  {docName(madeFrom, settings)}
                </button>
              </>
            ) : null}
          </p>
        </div>
        <button className="btn btn-sm xl:hidden" onClick={() => setPreview(true)}>
          <Eye /> {t("Preview")}
        </button>
        <button className="btn btn-sm hidden xl:inline-flex" onClick={() => setShowPreview((v) => !v)}>
          <Eye /> {showPreview ? t("Hide preview") : t("Preview")}
        </button>
        <button className="btn btn-sm" onClick={downloadPdf} disabled={!!busy}>
          <Download /> {busy === "pdf" ? "PDF…" : "PDF"}
        </button>
        {isInvoice && !unsent && !locked && draft.balanceDue > 0 && (
          <button className="btn btn-sm" onClick={() => setDialog("payment")} disabled={!!busy}>
            <HandCoins /> {t("Record payment")}
          </button>
        )}
        {primary && draft.status !== "void" && (
          <button className="btn btn-sm btn-brand" title={primary.hint} onClick={primary.onClick} disabled={!!busy || (!online && supabaseConfigured && !unsent)}>
            {primary.icon} {busy === "issue" || busy === "link" || busy === "sent" ? t("Working…") : primary.label}
          </button>
        )}
        <Menu
          label={<span className="sr-only sm:not-sr-only">{t("More")}</span>}
          icon={<Ellipsis />}
          className="btn btn-sm"
          items={[
            supabaseConfigured && canEmail && !unsent && !locked && { label: t("Email to client"), icon: <Mail />, onClick: () => setDialog({ email: "document" }) },
            !!link && { label: t("Open client page"), icon: <ExternalLink />, onClick: () => window.open(link, "_blank", "noopener") },
            !!link && !unsent && { label: t("Copy client link"), icon: <Copy />, onClick: copyLink },
            !unsent && !handedOver && draft.status !== "void" && { label: t("Mark as sent"), icon: <Send />, hint: t("You gave the client the PDF yourself"), onClick: sentByHand },
            isInvoice && !unsent && !locked && { label: t("Record payment"), icon: <HandCoins />, onClick: () => setDialog("payment") },
            isInvoice && !unsent && !locked && handedOver && draft.balanceDue > 0 && canEmail && { label: t("Send payment reminder"), icon: <Mail />, onClick: () => setDialog({ email: "reminder" }) },
            isQuote && !locked && draft.status !== "accepted" && { label: t("Mark approved"), icon: <CircleCheck />, onClick: () => markAnswer(true) },
            isQuote && !locked && draft.status !== "declined" && draft.status !== "accepted" && { label: t("Mark declined"), icon: <CircleX />, onClick: () => markAnswer(false) },
            isQuote && draft.status !== "void" && { label: t("Create invoice…"), icon: <FilePlus2 />, onClick: () => actions.convert(draft) },
            isInvoice && !unsent && !locked && { label: t("Credit note…"), icon: <FileMinus />, onClick: () => actions.credit(draft) },
            { label: t("Duplicate"), icon: <Copy />, onClick: () => actions.duplicate(draft) },
            !unsent && draft.status !== "void" && {
              label: t("Void: {kind}", { kind: kindText.toLowerCase() }),
              icon: <Ban />,
              danger: true,
              onClick: () => {
                if (!confirm(t("Void {name}? It stays on record (its number isn't reused) but no longer counts, and its client link stops working.", { name }))) return;
                void run("void", async () => setDraft(await voidDoc(await current())));
              },
            },
            unsent && {
              label: t("Delete draft"),
              icon: <Trash />,
              danger: true,
              onClick: () => {
                if (!confirm(t("Delete this draft?"))) return;
                void run("delete", async () => {
                  await deleteDraft(draft);
                  onBack();
                });
              },
            },
          ]}
        />
      </div>

      {/* Banners */}
      {draft.status === "void" && (
        <Banner tone="slate">
          {draft.voidedAt
            ? t("Voided {date}. It no longer counts toward totals.", { date: formatDocDate(draft.voidedAt.slice(0, 10), settings.locale) })
            : t("Voided. It no longer counts toward totals.")}
        </Banner>
      )}
      {stale && !locked && (
        <Banner tone="amber" action={{ label: t("Update link"), onClick: copyLink }}>
          {t("You changed this after sending it. The client’s link still shows the earlier version.")}
        </Banner>
      )}
      {isQuote && draft.status === "accepted" && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {signerName ? t("Approved by {name}", { name: signerName }) : t("Approved")}
              {respondedAt ? ` ${t("on {date}", { date: fmtDate(respondedAt) })}` : ` ${t("(marked by the office)")}`}
              {approval?.source === "proposal" ? ` ${t("on the client link")}` : ""}
            </div>
            {clientNote && <div className="mt-0.5">“{clientNote}”</div>}
            {signed && <div className="mt-0.5 text-xs text-emerald-800/80">{t("The approved copy can’t be edited. Duplicate it to make changes.")}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {signature && <img src={signature} alt={t("Signature of {name}", { name: signerName ?? t("the client") })} className="h-12 rounded bg-white ring-1 ring-emerald-200" />}
          {!billedYet && depositAmount ? (
            <button className="btn btn-sm btn-brand" onClick={() => actions.convert(draft, "deposit")}>
              <HandCoins /> {t("Bill the deposit ({amount})", { amount: money(depositAmount) })}
            </button>
          ) : (
            <button className="btn btn-sm btn-brand" onClick={() => actions.convert(draft, billedYet ? "final" : undefined)}>
              <FilePlus2 /> {billedYet ? t("Bill the rest") : t("Create invoice")}
            </button>
          )}
        </div>
      )}
      {isQuote && draft.status === "declined" && (
        <Banner tone="red">
          {draft.signerName ? t("Declined by {name}", { name: draft.signerName }) : t("Declined")}
          {draft.clientNote ? `: “${draft.clientNote}”` : "."}
        </Banner>
      )}

      <div className={`grid gap-5 ${showPreview ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]" : ""}`}>
        <div className="min-w-0 space-y-5">
          {/* Client + dates */}
          <section className="card grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="section-title">{isInvoice ? t("Bill to") : t("Client")}</h3>
                {!locked && directory.length > 1 && (
                  <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setDialog("client")}>
                    {t("Pick a client")}
                  </button>
                )}
              </div>
              <Field label={t("Name")} value={draft.client?.name ?? ""} onChange={(v) => editClient({ name: v })} readOnly={locked} autoComplete="off" />
              <Field label={t("Company")} value={draft.client?.company ?? ""} onChange={(v) => editClient({ company: v })} readOnly={locked} />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label={t("Email")} type="email" value={draft.client?.email ?? ""} onChange={(v) => editClient({ email: v })} readOnly={locked} />
                <Field label={t("Phone")} type="tel" value={draft.client?.phone ?? ""} onChange={(v) => editClient({ phone: v })} readOnly={locked} />
              </div>
              <Field label={t("Billing address")} multiline value={draft.client?.billingAddress ?? ""} onChange={(v) => editClient({ billingAddress: v })} readOnly={locked} />
              <Field label={t("Job site")} value={draft.client?.siteAddress ?? ""} onChange={(v) => editClient({ siteAddress: v })} readOnly={locked} />
            </div>
            <div className="space-y-2.5">
              <h3 className="section-title">{t("Details")}</h3>
              <Field label={t("Title")} placeholder={kindLabel} value={draft.title ?? ""} onChange={(v) => edit({ title: v || null })} readOnly={locked} />
              <div className="grid grid-cols-2 gap-2.5">
                <Field
                  label={t("Date")}
                  type="date"
                  value={draft.issueDate ?? ""}
                  readOnly={locked}
                  onChange={(v) => edit({ issueDate: v || null, ...(isInvoice && draft.termsDays != null && v ? { dueDate: dueDateFor(v, draft.termsDays) } : {}) })}
                />
                {isInvoice && <Field label={t("Due")} type="date" value={draft.dueDate ?? ""} onChange={(v) => edit({ dueDate: v || null })} readOnly={locked} />}
                {isQuote && <Field label={t("Valid until")} type="date" value={draft.validUntil ?? ""} onChange={(v) => edit({ validUntil: v || null })} readOnly={locked} />}
              </div>
              {isInvoice && (
                <label className="block text-sm">
                  <span className="label">{t("Payment terms")}</span>
                  <select
                    className="input"
                    disabled={locked}
                    value={PAYMENT_TERMS.some((pt) => pt.days === draft.termsDays) ? String(draft.termsDays) : "custom"}
                    onChange={(e) => {
                      const days = e.target.value === "custom" ? (draft.termsDays ?? 10) : Number(e.target.value);
                      edit({ termsDays: days, dueDate: dueDateFor(draft.issueDate || today(), days) });
                    }}
                  >
                    {PAYMENT_TERMS.map((pt) => (
                      <option key={pt.days} value={pt.days}>
                        {t(pt.label)}
                      </option>
                    ))}
                    <option value="custom">{t("Custom ({terms})", { terms: t(termsLabel(draft.termsDays)) })}</option>
                  </select>
                  {!PAYMENT_TERMS.some((pt) => pt.days === draft.termsDays) && (
                    <input
                      className="input mt-1.5 w-28 text-right"
                      inputMode="numeric"
                      aria-label={t("Days to pay")}
                      defaultValue={draft.termsDays ?? ""}
                      onBlur={(e) => {
                        const d = Math.max(0, Math.round(parseAmount(e.target.value) ?? 0));
                        edit({ termsDays: d, dueDate: dueDateFor(draft.issueDate || today(), d) });
                      }}
                    />
                  )}
                </label>
              )}
              {draft.invoiceType && draft.invoiceType !== "standard" && (
                <p className="text-xs text-slate-500">
                  {draft.invoiceType === "deposit" ? t("Deposit invoice") : draft.invoiceType === "progress" ? t("Progress invoice") : t("Final invoice")}
                  {draft.billedPct ? ` · ${t("{pct}% of the quote", { pct: draft.billedPct })}` : ""}
                </p>
              )}
              {children.length > 0 && (
                <div className="text-xs text-slate-500">
                  {t("Made from this:")}{" "}
                  {children.map((c, i) => (
                    <span key={c.id}>
                      {i ? ", " : ""}
                      <button className="font-medium text-brand-600 hover:underline" onClick={() => actions.open(c.id)}>
                        {docName(c, settings)}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Lines */}
          <section className="card p-2 sm:p-3">
            <LineEditor
              lines={draft.lines}
              onChange={(lines) => edit({ lines })}
              taxes={draft.taxes}
              currency={draft.currency}
              locale={settings.locale}
              defaultTaxable
              readOnly={locked}
            />
          </section>

          {/* Adjustments + totals */}
          <section className="card grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <AdjustRow label={t("Discount")} value={draft.discount} currency={draft.currency} readOnly={locked} onChange={(discount) => edit({ discount })} />
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label mb-0">{t("Taxes")}</span>
                  {!locked && (
                    <Menu
                      label={t("Add tax")}
                      icon={<Plus />}
                      className="btn btn-sm btn-ghost text-brand-600"
                      items={[
                        ...settings.taxes.filter((tx) => !draft.taxes.some((x) => x.id === tx.id)).map((tx) => ({ label: `${tx.name} (${fmtPct(tx.rate)}%)`, onClick: () => edit({ taxes: [...draft.taxes, { id: tx.id, name: tx.name, rate: tx.rate }] }) })),
                        { label: t("Custom tax rate…"), onClick: () => edit({ taxes: [...draft.taxes, { id: lineId(), name: "Sales tax", rate: 0 }] }) },
                      ]}
                    />
                  )}
                </div>
                {draft.taxes.length === 0 && <p className="text-xs text-slate-500">{t("No tax. Add a rate (set your usual ones in Settings → Invoicing).")}</p>}
                {draft.taxes.map((tx, i) => (
                  <div key={tx.id} className="mb-1.5 flex items-center gap-2">
                    <input className="input min-w-0 flex-1" aria-label={t("Tax name")} readOnly={locked} value={tx.name} onChange={(e) => edit({ taxes: draft.taxes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input
                      className="input w-24 text-right"
                      aria-label={t("{name} rate %", { name: tx.name })}
                      inputMode="decimal"
                      readOnly={locked}
                      defaultValue={tx.rate}
                      onBlur={(e) => edit({ taxes: draft.taxes.map((x, j) => (j === i ? { ...x, rate: roundPct(parseAmount(e.target.value) ?? 0) } : x)) })}
                    />
                    <span className="text-sm text-slate-500">%</span>
                    {!locked && (
                      <button className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove {name}", { name: tx.name })} onClick={() => edit({ taxes: draft.taxes.filter((_, j) => j !== i), lines: draft.lines.map((l) => (l.taxIds ? { ...l, taxIds: l.taxIds.filter((x) => x !== tx.id) } : l)) })}>
                        <X />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label mb-0">{t("Fees (shipping, permits…)")}</span>
                  {!locked && (
                    <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => edit({ fees: [...(draft.fees ?? []), { id: lineId(), label: "Shipping", amount: 0, taxable: false }] })}>
                      <Plus /> {t("Add fee")}
                    </button>
                  )}
                </div>
                {(draft.fees ?? []).map((f, i) => (
                  <div key={f.id} className="mb-1.5 flex items-center gap-2">
                    <input className="input min-w-0 flex-1" aria-label={t("Fee")} readOnly={locked} value={f.label} onChange={(e) => edit({ fees: (draft.fees ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <input
                      className="input w-28 text-right"
                      aria-label={t("{name} amount", { name: f.label })}
                      inputMode="decimal"
                      readOnly={locked}
                      defaultValue={f.amount.toFixed(2)}
                      onBlur={(e) => edit({ fees: (draft.fees ?? []).map((x, j) => (j === i ? { ...x, amount: parseAmount(e.target.value) ?? 0 } : x)) })}
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-500" title={t("Taxable")}>
                      <input type="checkbox" className="accent-brand-600" checked={!!f.taxable} disabled={locked} onChange={(e) => edit({ fees: (draft.fees ?? []).map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)) })} /> {t("tax")}
                    </label>
                    {!locked && (
                      <button className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove {name}", { name: f.label })} onClick={() => edit({ fees: (draft.fees ?? []).filter((_, j) => j !== i) })}>
                        <X />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {draft.kind !== "credit_note" && <AdjustRow label={isQuote ? t("Deposit on approval") : t("Deposit requested")} value={draft.deposit} currency={draft.currency} readOnly={locked} onChange={(deposit) => edit({ deposit })} />}
            </div>
            <dl className="space-y-1.5 self-start rounded-xl bg-slate-50 p-4 text-sm">
              <Total label={t("Subtotal")} value={money(totals.subtotal)} />
              {totals.discountTotal ? <Total label={t("Discount")} value={`−${money(totals.discountTotal)}`} /> : null}
              {totals.feeTotal ? <Total label={t("Fees")} value={money(totals.feeTotal)} /> : null}
              {totals.taxLines.map((tx) => (
                <Total key={tx.id} label={t("{name} {rate}% on {base}", { name: tx.name, rate: fmtPct(tx.rate), base: money(tx.base) })} value={money(tx.amount)} />
              ))}
              {(draft.deductions ?? []).length > 0 && (
                <>
                  <Total label={t("Job total")} value={money(totals.grossTotal)} />
                  {(draft.deductions ?? []).map((d) => (
                    <div key={d.id} className="flex justify-between gap-3">
                      <dt className="text-slate-500">
                        {d.label}
                        {!locked && (
                          <button className="ml-1.5 text-xs text-slate-400 hover:text-red-600" aria-label={t("Remove {name}", { name: d.label })} onClick={() => edit({ deductions: (draft.deductions ?? []).filter((x) => x.id !== d.id) })}>
                            {t("remove")}
                          </button>
                        )}
                      </dt>
                      <dd className="tabular-nums">−{money(d.amount)}</dd>
                    </div>
                  ))}
                </>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold">{(draft.deductions ?? []).length ? t("This invoice") : t("Total")}</dt>
                <dd className="text-xl font-bold tabular-nums">{money(totals.total)}</dd>
              </div>
              {totals.deposit != null && <Total label={t("Deposit")} value={money(totals.deposit)} />}
              {totals.optionalTotal ? <Total label={t("Optional (not counted)")} value={money(totals.optionalTotal)} /> : null}
              {isInvoice && (
                <>
                  <Total label={t("Paid & credited")} value={money(draft.amountPaid)} />
                  <div className="flex items-baseline justify-between">
                    <dt className="font-semibold">{t("Balance due")}</dt>
                    <dd className={`text-lg font-bold tabular-nums ${draft.balanceDue > 0 && status === "overdue" ? "text-red-600" : ""}`}>{money(draft.balanceDue)}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {/* Payments */}
          {isInvoice && !unsent && (
            <section className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="section-title">{t("Payments")}</h3>
                {!locked && (
                  <button className="btn btn-sm btn-brand" onClick={() => setDialog("payment")}>
                    <HandCoins /> {t("Record payment")}
                  </button>
                )}
              </div>
              {docPayments.length === 0 && credits.length === 0 && <p className="text-sm text-slate-500">{t("No payments yet.")}</p>}
              <ul className="divide-y divide-slate-100">
                {docPayments.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm ${p.voided ? "text-slate-400 line-through" : ""}`}>
                    <span className="w-24 tabular-nums">{formatDocDate(p.date, settings.locale)}</span>
                    <span className="min-w-0 flex-1">
                      {p.amount < 0 ? `${t("Refund")} · ` : ""}
                      {t(PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? p.method)}
                      {isOnlinePayment(p) ? (
                        <span className="chip ml-2 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" title={p.reference ?? undefined}>
                          {p.amount < 0 ? t("Refunded in Stripe") : t("Paid online")}
                        </span>
                      ) : (
                        <>
                          {p.reference ? ` #${p.reference}` : ""}
                          {p.note ? <span className="text-slate-500"> — {p.note}</span> : null}
                        </>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">{money(p.amount)}</span>
                    {!locked && (
                      <button className="btn btn-sm btn-ghost text-slate-500" onClick={() => {
                          // Voiding here never moves money: an online payment is refunded in Stripe (it then shows here by itself).
                          if (isOnlinePayment(p) && !p.voided && !confirm(t("This payment was made online through Stripe. Voiding it here doesn't refund the client: refund it in your Stripe dashboard and the refund shows here by itself. Void it anyway?"))) return;
                          void run("pay", () => voidPayment(p, !p.voided));
                        }} title={p.voided ? t("Count it again") : t("Void this payment")}>
                        {p.voided ? <Undo2 /> : <Ban />} {p.voided ? t("Restore") : t("Void payment")}
                      </button>
                    )}
                  </li>
                ))}
                {credits.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24">{formatDocDate(c.issueDate, settings.locale)}</span>
                    <button className="min-w-0 flex-1 text-left text-brand-600 hover:underline" onClick={() => actions.open(c.id)}>
                      {c.status === "draft"
                        ? t("Credit note {name} (draft — not counted yet)", { name: docName(c, settings) })
                        : t("Credit note {name}", { name: docName(c, settings) })}
                    </button>
                    <span className="font-medium tabular-nums">{money(c.total)}</span>
                  </li>
                ))}
              </ul>
              {canEmail && draft.amountPaid > 0 && !locked && (
                <button className="btn btn-sm mt-3" onClick={() => setDialog({ email: "receipt" })}>
                  <Send /> {t("Email a receipt")}
                </button>
              )}
            </section>
          )}

          {/* Notes and options */}
          <section className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
            <Field label={t("Notes to the client")} multiline value={draft.notes ?? ""} onChange={(v) => edit({ notes: v })} readOnly={locked} />
            <Field label={t("Terms")} multiline value={draft.terms ?? ""} onChange={(v) => edit({ terms: v })} readOnly={locked} />
            <Field label={t("Footer")} value={draft.footer ?? ""} onChange={(v) => edit({ footer: v })} readOnly={locked} />
            <Field label={t("Internal notes (never shown to the client)")} multiline value={draft.internalNotes ?? ""} onChange={(v) => edit({ internalNotes: v })} readOnly={locked} />
            <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
              <label className="text-sm">
                <span className="label">{t("Prices shown")}</span>
                <select className="input" disabled={locked} value={draft.options?.detail ?? settings.detail} onChange={(e) => edit({ options: { ...draft.options, detail: e.target.value as "lines" | "sections" } })}>
                  <option value="lines">{t("Every line")}</option>
                  <option value="sections">{t("Section totals only")}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="label">{t("Layout")}</span>
                <select className="input" disabled={locked} value={draft.options?.template ?? settings.template} onChange={(e) => edit({ options: { ...draft.options, template: e.target.value as DocumentSettings["template"] } })}>
                  <option value="classic">{t("Classic")}</option>
                  <option value="modern">{t("Modern")}</option>
                  <option value="compact">{t("Compact")}</option>
                </select>
              </label>
              {isQuote && (
                <label className="flex items-end gap-2 pb-2.5 text-sm">
                  <input type="checkbox" className="accent-brand-600" disabled={locked} checked={draft.options?.requireSignature ?? settings.signatureOnQuotes} onChange={(e) => edit({ options: { ...draft.options, requireSignature: e.target.checked } })} />
                  {t("Client signs to approve")}
                </label>
              )}
            </div>
            <div className="lg:col-span-2">
              <span className="label">{t("Columns")}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    ["qty", t("Qty")],
                    ["unit", t("Unit")],
                    ["unitPrice", t("Unit price")],
                    ["discount", t("Discount")],
                    ["tax", t("Tax")],
                    ["sku", t("SKU")],
                    ["lineTotal", t("Line totals")],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="tap flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      disabled={locked}
                      checked={snap.columns[k]}
                      onChange={(e) => edit({ options: { ...draft.options, columns: { ...(draft.options?.columns ?? {}), [k]: e.target.checked } } })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <Field label={t("Plans link (optional)")} placeholder="https://…" value={draft.options?.plansUrl ?? ""} onChange={(v) => edit({ options: { ...draft.options, plansUrl: v.trim() || null } })} readOnly={locked} />
          </section>
        </div>

        {showPreview && (
          <aside className="hidden xl:block">
            <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto rounded-2xl shadow-pop ring-1 ring-slate-200">
              <DocView snap={snap} live={{ status: draft.status, number: draft.number, amountPaid: draft.amountPaid, balanceDue: draft.balanceDue, paidAt: draft.paidAt }} payLink={pay} />
            </div>
          </aside>
        )}
      </div>

      {preview && (
        <BaseModal onClose={() => setPreview(false)} label={t("Preview")} className="fixed inset-0 z-50 overflow-auto bg-slate-900/40 p-2 backdrop-blur-[2px] sm:p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex justify-end">
              <button className="btn btn-sm" onClick={() => setPreview(false)}>
                <X /> {t("Close preview")}
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl shadow-pop">
              <DocView snap={snap} live={{ status: draft.status, number: draft.number, amountPaid: draft.amountPaid, balanceDue: draft.balanceDue, paidAt: draft.paidAt }} payLink={pay} />
            </div>
          </div>
        </BaseModal>
      )}

      {dialog === "payment" && (
        <PaymentDialog
          doc={draft}
          settings={settings}
          onClose={() => setDialog(null)}
          onSave={(p) =>
            void run("pay", async () => {
              const d = await current();
              await recordPayment(d, { amount: p.amount, date: p.date, method: p.method, reference: p.reference || null, note: p.note || null });
              setDialog(null);
              toast(p.amount < 0 ? t("Refund recorded") : t("Payment recorded"), "success");
              window.dispatchEvent(new Event(DOCS_EVENT));
            })
          }
        />
      )}
      {dialog && typeof dialog === "object" && "email" in dialog && <EmailDialog doc={draft} settings={settings} kind={dialog.email} onClose={() => setDialog(null)} onSend={sendEmail} />}
      {dialog === "client" && (
        <Modal title={t("Pick a client")} description={t("From your jobs and earlier documents.")} onClose={() => setDialog(null)}>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
            {directory.map((c) => (
              <li key={`${c.email}-${c.name}`}>
                <button
                  className="w-full px-2 py-2.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    editClient({ name: c.name, company: c.company ?? null, email: c.email ?? null, phone: c.phone ?? null, billingAddress: c.billingAddress ?? null });
                    setDialog(null);
                  }}
                >
                  <div className="font-medium">{c.name || c.email}</div>
                  <div className="text-xs text-slate-500">{[c.company, c.email, c.phone].filter(Boolean).join(" · ")}</div>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Banner({ tone, children, action }: { tone: "amber" | "red" | "slate"; children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  const cls = { amber: "bg-amber-50 text-amber-900 ring-amber-200", red: "bg-red-50 text-red-800 ring-red-200", slate: "bg-slate-100 text-slate-600 ring-slate-200" }[tone];
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5 text-sm ring-1 ${cls}`}>
      {tone === "amber" && <TriangleAlert className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button className="btn btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Field({ label, value, onChange, multiline, readOnly, type = "text", placeholder, autoComplete }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; readOnly?: boolean; type?: string; placeholder?: string; autoComplete?: string }) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      {multiline ? (
        <textarea className="input min-h-20" value={value} readOnly={readOnly} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" type={type} value={value} readOnly={readOnly} placeholder={placeholder} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function AdjustRow({ label, value, currency, onChange, readOnly }: { label: string; value: SalesDoc["discount"]; currency: string; onChange: (v: SalesDoc["discount"]) => void; readOnly?: boolean }) {
  const t = useT();
  const [text, setText] = useState(value?.value ? String(value.value) : "");
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value?.value ? String(value.value) : "");
  }
  const type = value?.type ?? "pct";
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input
          className="input w-28 text-right"
          inputMode="decimal"
          aria-label={label}
          readOnly={readOnly}
          placeholder={t("none")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = parseAmount(text);
            onChange(n ? { type, value: n } : null);
          }}
        />
        <select className="input w-24" aria-label={t("{name} type", { name: label })} disabled={readOnly} value={type} onChange={(e) => onChange({ type: e.target.value as "pct" | "fixed", value: value?.value ?? 0 })}>
          <option value="pct">%</option>
          <option value="fixed">{currency}</option>
        </select>
      </div>
    </div>
  );
}
