"use client";
// "Export for accountant" on /invoices: issued invoices and credit notes for a date range as a QuickBooks / Xero
// import file (format and account names under More), and, when an accounting app is connected, "Send to …".
import { FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ACCOUNTS, exportableDocs, exportFileName, iifExport, invoiceLinesCsv, type AccountNames } from "@/lib/accountingExport";
import { today } from "@/lib/documents";
import { downloadText } from "@/lib/download";
import { msg, useT } from "@/lib/i18n";
import type { DocPayment, SalesDoc } from "@/lib/types";
import { Modal } from "../documents/ui";
import { FORMATS, listIntegrations, loadAccounts, pushDocument, rememberFormat, saveAccounts, savedFormat, type ExportFormat, type ProviderStatus } from "./accountingClient";

const monthStart = (day: string) => `${day.slice(0, 8)}01`;
function lastMonth(day: string): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number);
  const first = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1));
  const last = new Date(Date.UTC(y, m - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const ACCOUNT_FIELDS: { key: keyof AccountNames; label: string; formats: ExportFormat[] }[] = [
  { key: "defaultItem", label: msg("Product/service for job lines"), formats: ["qbo", "iif"] },
  { key: "taxItem", label: msg("Sales tax item"), formats: ["qbo", "iif"] },
  { key: "incomeAccount", label: msg("Income account (Xero: account code)"), formats: ["xero", "iif"] },
  { key: "taxAccount", label: msg("Sales tax account (Xero: account code)"), formats: ["xero", "iif"] },
  { key: "arAccount", label: msg("Accounts receivable account"), formats: ["iif"] },
  { key: "depositAccount", label: msg("Payments go to"), formats: ["iif"] },
  { key: "xeroTaxType", label: msg("Xero tax type"), formats: ["xero"] },
];

export default function ExportForAccountant({ docs, payments }: { docs: SalesDoc[]; payments: DocPayment[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <FileSpreadsheet /> {t("Export for accountant")}
      </button>
      {open && <ExportDialog docs={docs} payments={payments} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExportDialog({ docs, payments, onClose }: { docs: SalesDoc[]; payments: DocPayment[]; onClose: () => void }) {
  const t = useT();
  const day = today();
  const [from, setFrom] = useState(monthStart(day));
  const [to, setTo] = useState(day);
  const [format, setFormat] = useState<ExportFormat>(() => savedFormat());
  const [more, setMore] = useState(false);
  const [accounts, setAccounts] = useState<AccountNames>(DEFAULT_ACCOUNTS);
  const [shared, setShared] = useState(false);
  const [connected, setConnected] = useState<ProviderStatus[]>([]);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadAccounts().then((a) => {
      if (!alive) return;
      setAccounts(a.accounts);
      setShared(a.shared);
    });
    listIntegrations()
      .then((l) => alive && setConnected(l.providers.filter((p) => p.auth === "oauth2" && p.enabled && p.connection?.status === "connected")))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const range = useMemo(() => ({ from, to }), [from, to]);
  const picked = useMemo(() => exportableDocs(docs, range), [docs, range]);
  // Sending also takes the void ones, so a document voided in PinPlan is voided in the accounting app too (one never
  // sent is skipped by the server).
  const sendable = useMemo(() => {
    const voided = docs.filter((d) => !d.deleted && (d.kind === "invoice" || d.kind === "credit_note") && d.status === "void" && !!d.issueDate && (!from || d.issueDate >= from) && (!to || d.issueDate <= to));
    return [...picked, ...voided];
  }, [docs, picked, from, to]);
  const drafts = docs.filter((d) => !d.deleted && (d.kind === "invoice" || d.kind === "credit_note") && d.status === "draft" && (!from || (d.issueDate ?? "") >= from) && (!to || (d.issueDate ?? "") <= to)).length;
  const fmt = FORMATS.find((f) => f.id === format)!;

  function download() {
    rememberFormat(format);
    const text = format === "iif" ? iifExport(docs, payments, { ...accounts, range }) : invoiceLinesCsv(docs, format, { range, accounts });
    downloadText(text, exportFileName(format, range, day), format === "iif" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8");
    setMessage({ ok: true, text: t.tn("Downloaded {n} document.", "Downloaded {n} documents.", picked.length) });
  }

  async function saveNames() {
    const ok = await saveAccounts(accounts);
    setShared(ok);
    setMessage({ ok: true, text: ok ? t("Saved for your company.") : t("Saved on this device (sign in to share it with your team).") });
  }

  async function send(p: ProviderStatus) {
    const voids = sendable.length - picked.length;
    const question = [
      t.tn("Send {n} document (invoices and credit notes) to {app}?", "Send {n} documents (invoices and credit notes) to {app}?", picked.length, { app: p.label }),
      voids ? t.tn("{n} void one is voided there too.", "{n} void ones are voided there too.", voids) : "",
      t("Ones already sent and unchanged are skipped."),
    ];
    if (!confirm(question.filter(Boolean).join(" "))) return;
    setMessage(null);
    setSending({ done: 0, total: sendable.length });
    const problems: string[] = [];
    let sent = 0;
    for (const [i, d] of sendable.entries()) {
      try {
        const r = await pushDocument(p.id, d, payments);
        if (r.status === "sent" || r.status === "voided") sent++;
        problems.push(...r.warnings, ...r.payments.filter((x) => x.status === "error").map((x) => `${d.number ?? t("Invoice")}: ${x.message}`));
      } catch (e) {
        problems.push(`${d.number ?? t("Invoice")}: ${(e as Error).message}`);
        if ((e as { status?: number }).status === 402 || (e as { status?: number }).status === 409) break;
      }
      setSending({ done: i + 1, total: sendable.length });
    }
    setSending(null);
    setMessage(
      problems.length
        ? { ok: false, text: `${t("{n} sent.", { n: sent })} ${problems.slice(0, 5).join(" ")}${problems.length > 5 ? ` ${t("(+{n} more)", { n: problems.length - 5 })}` : ""}` }
        : { ok: true, text: t("{n} sent to {app}; the rest were already up to date.", { n: sent, app: p.label }) },
    );
  }

  return (
    <Modal title={t("Export for accountant")} description={t("Issued invoices and credit notes (never drafts or void ones), one row per line. Totals match to the cent.")} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="label">{t("From")}</span>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="label">{t("To")}</span>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setFrom(monthStart(day)); setTo(day); }}>
              {t("This month")}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { const r = lastMonth(day); setFrom(r.from); setTo(r.to); }}>
              {t("Last month")}
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          {t.tn("{n} document in this range", "{n} documents in this range", picked.length)}
          {drafts > 0 && <span className="text-slate-400"> · {t.tn("{n} draft left out", "{n} drafts left out", drafts)}</span>}
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-brand" disabled={!picked.length} onClick={download}>
            <FileSpreadsheet /> {t("Download for {app}", { app: t(fmt.label).replace(/ \(.*\)$/, "") })}
          </button>
          {connected.map((p) => (
            <button key={p.id} className="btn" disabled={!sendable.length || !!sending} onClick={() => void send(p)}>
              {t("Send to {app}", { app: p.label })}
            </button>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setMore(!more)} aria-expanded={more}>
            {more ? t("Less") : t("More")}
          </button>
        </div>
        {sending && (
          <p className="text-sm text-slate-500" role="status">
            {t("Sending {done} of {total}…", { done: sending.done, total: sending.total })}
          </p>
        )}
        {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

        {more && (
          <div className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <fieldset>
              <legend className="label">{t("Format")}</legend>
              <div className="space-y-1.5">
                {FORMATS.map((f) => (
                  <label key={f.id} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="pp-export-format" className="mt-1" checked={format === f.id} onChange={() => setFormat(f.id)} />
                    <span>
                      <span className="font-medium">{t(f.label)}</span>
                      <span className="block text-xs text-slate-500">{t(f.hint)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {format !== "generic" && (
              <div>
                <div className="label">{t("Names in your books")}</div>
                <p className="mb-2 text-xs text-slate-500">{t("Use the names exactly as they appear in {app}. Tax is sent as its own line, so nothing is taxed twice.", { app: format === "xero" ? "Xero" : "QuickBooks" })}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ACCOUNT_FIELDS.filter((f) => f.formats.includes(format)).map((f) => (
                    <label key={f.key} className="text-sm">
                      <span className="label">{t(f.label)}</span>
                      <input className="input" value={accounts[f.key]} placeholder={DEFAULT_ACCOUNTS[f.key]} onChange={(e) => setAccounts({ ...accounts, [f.key]: e.target.value })} />
                    </label>
                  ))}
                  {format !== "iif" && (
                    <label className="text-sm">
                      <span className="label">{t("Date format")}</span>
                      <select className="input" value={accounts.dateStyle} onChange={(e) => setAccounts({ ...accounts, dateStyle: e.target.value as AccountNames["dateStyle"] })}>
                        <option value="mdy">MM/DD/YYYY</option>
                        <option value="dmy">DD/MM/YYYY</option>
                        <option value="iso">YYYY-MM-DD</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" className="btn btn-sm" onClick={() => void saveNames()}>
                    {t("Save names")}
                  </button>
                  <span className="text-xs text-slate-500">{shared ? t("Shared with your company.") : t("Kept on this device.")}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
