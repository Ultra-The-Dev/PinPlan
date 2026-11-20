"use client";
// Settings → Invoicing: titles, numbering, terms, taxes, payment details, layout and reminders for quotes, invoices and
// credit notes. Shared by the whole company (saved to the cloud when signed in).
import { Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { localNextNumber, setLocalNextNumber } from "@/lib/docActions";
import { fetchNumbering, getDocSettings, saveDocSettings, setNextNumber, type Numbering } from "@/lib/docSettings";
import { DOC_KINDS, formatDocNumber, lineId, numberFormatProblem, PAYMENT_TERMS, today } from "@/lib/documents";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { DocKind, DocumentSettings } from "@/lib/types";
import { parseAmount } from "./ui";
import { roundPct } from "@/lib/percent";

const KIND_NAMES: Record<DocKind, string> = { quote: "Quotes", invoice: "Invoices", credit_note: "Credit notes" };
const KIND_ONE: Record<DocKind, string> = { quote: "quote", invoice: "invoice", credit_note: "credit note" };

export default function DocSettingsPanel() {
  const [s, setS] = useState<DocumentSettings | null>(null);
  const [orig, setOrig] = useState("");
  const [nums, setNums] = useState<Record<DocKind, Numbering> | null>(null);
  const [kind, setKind] = useState<DocKind>("invoice");
  const signedIn = useSyncStatus((x) => x.signedIn);
  const cloud = supabaseConfigured && signedIn;

  useEffect(() => {
    void getDocSettings().then((x) => {
      setS(x);
      setOrig(JSON.stringify(x));
    });
  }, []);
  useEffect(() => {
    if (cloud) void fetchNumbering().then(setNums);
  }, [cloud]);
  if (!s) return <p className="text-sm text-slate-500">Loading…</p>;

  const dirty = JSON.stringify(s) !== orig;
  const set = (patch: Partial<DocumentSettings>) => setS({ ...s, ...patch });
  const k = s.kinds[kind];
  const setK = (patch: Partial<DocumentSettings["kinds"][DocKind]>) => set({ kinds: { ...s.kinds, [kind]: { ...k, ...patch } } });
  const problem = DOC_KINDS.map((x) => numberFormatProblem(s.kinds[x].format)).find(Boolean) ?? null;
  const next = cloud ? (nums?.[kind]?.next ?? null) : localNextNumber(kind, s);

  async function save() {
    if (!s || problem) return;
    const r = await saveDocSettings(s);
    setOrig(JSON.stringify(s));
    if (r.error) toast(`Saved on this device. The company copy didn't save: ${r.error}`, "error");
    else toast(r.cloud ? "Invoicing settings saved for your company" : "Invoicing settings saved");
    if (cloud) void fetchNumbering().then(setNums);
  }

  async function changeNext(v: string) {
    const n = Math.round(parseAmount(v) ?? 0);
    if (!(n >= 1)) return;
    try {
      if (cloud) setNums(await setNextNumber(kind, n));
      else setLocalNextNumber(kind, s!, n);
      toast(`Next ${KIND_ONE[kind]} number: ${formatDocNumber(k.format, n, today())}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Per kind */}
      <div>
        <div className="seg mb-3 max-w-full overflow-x-auto">
          {DOC_KINDS.map((x) => (
            <button key={x} type="button" className={`tab ${kind === x ? "tab-active" : ""}`} onClick={() => setKind(x)}>
              {KIND_NAMES[x]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="label">Title on the document</span>
            <input className="input" list={`doc-titles-${kind}`} value={k.label} onChange={(e) => setK({ label: e.target.value })} />
            <datalist id={`doc-titles-${kind}`}>
              {(kind === "quote" ? ["Quote", "Estimate", "Proposal"] : kind === "invoice" ? ["Invoice", "Tax invoice", "Bill"] : ["Credit note", "Credit memo"]).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <div className="text-sm">
            <span className="label">Number format</span>
            <input className="input font-mono" value={k.format} onChange={(e) => setK({ format: e.target.value })} aria-invalid={!!numberFormatProblem(k.format)} />
            <p className={`mt-1 text-xs ${numberFormatProblem(k.format) ? "text-red-600" : "text-slate-500"}`}>
              {numberFormatProblem(k.format) ?? (
                <>
                  Next: <strong className="font-mono">{formatDocNumber(k.format, next ?? 1, today())}</strong> · tokens {"{YYYY} {YY} {MM} {0000} {#}"}
                </>
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={k.yearlyReset} onChange={(e) => setK({ yearlyReset: e.target.checked })} /> Start again at 1 every January
          </label>
          <label className="text-sm">
            <span className="label">Next number</span>
            <input
              className="input w-32 text-right"
              inputMode="numeric"
              key={`${kind}-${next}`}
              defaultValue={next ?? ""}
              placeholder={cloud && !nums ? "…" : "1"}
              disabled={dirty}
              title={dirty ? "Save your changes first" : undefined}
              onBlur={(e) => e.target.value !== String(next ?? "") && void changeNext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <span className="mt-1 block text-xs text-slate-500">{cloud ? "Numbers are given by the cloud when a document is issued, so they never repeat." : "Numbered on this device."}</span>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="label">Default notes to the client</span>
            <textarea className="input min-h-16" value={k.notes} onChange={(e) => setK({ notes: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="label">Default terms</span>
            <textarea className="input min-h-20" value={k.terms} onChange={(e) => setK({ terms: e.target.value })} placeholder={kind === "quote" ? "50% deposit on approval, balance on completion…" : "Payment due within the terms above…"} />
          </label>
          <label className="text-sm">
            <span className="label">Default footer</span>
            <textarea className="input min-h-20" value={k.footer} onChange={(e) => setK({ footer: e.target.value })} placeholder="Licensed & insured · License #12345" />
          </label>
        </div>
      </div>

      {/* Money */}
      <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
        <label className="text-sm">
          <span className="label">Payment terms (invoices)</span>
          <select className="input" value={PAYMENT_TERMS.some((t) => t.days === s.paymentTermsDays) ? s.paymentTermsDays : "custom"} onChange={(e) => set({ paymentTermsDays: e.target.value === "custom" ? 10 : Number(e.target.value) })}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t.days} value={t.days}>
                {t.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {!PAYMENT_TERMS.some((t) => t.days === s.paymentTermsDays) && (
            <input className="input mt-1.5 w-24 text-right" inputMode="numeric" aria-label="Days to pay" value={s.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: Math.max(0, Math.round(parseAmount(e.target.value) ?? 0)) })} />
          )}
        </label>
        <label className="text-sm">
          <span className="label">Quotes valid for (days)</span>
          <input className="input text-right" inputMode="numeric" value={s.quoteValidDays} onChange={(e) => set({ quoteValidDays: Math.max(0, Math.round(parseAmount(e.target.value) ?? 0)) })} />
        </label>
        <label className="text-sm">
          <span className="label">Deposit on quotes (%)</span>
          <input className="input text-right" inputMode="decimal" value={s.depositPct} onChange={(e) => set({ depositPct: Math.min(100, Math.max(0, parseAmount(e.target.value) ?? 0)) })} />
        </label>
        <label className="text-sm">
          <span className="label">Currency</span>
          <input className="input" maxLength={3} value={s.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
        </label>
        <label className="text-sm">
          <span className="label">Number & date format</span>
          <select className="input" value={s.locale} onChange={(e) => set({ locale: e.target.value })}>
            {[
              ["en-US", "United States (1,234.56 · Nov 19, 2026)"],
              ["en-CA", "Canada (English)"],
              ["fr-CA", "Canada (français)"],
              ["en-GB", "United Kingdom"],
              ["en-AU", "Australia"],
              ["es-US", "Español (EE. UU.)"],
              ["de-DE", "Deutschland (1.234,56)"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Late payment text (invoices)</span>
          <input className="input" value={s.lateFee} onChange={(e) => set({ lateFee: e.target.value })} placeholder="1.5% per month on overdue balances" />
        </label>
      </div>

      {/* Taxes */}
      <div className="border-t border-slate-100 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Tax rates</h3>
            <p className="text-xs text-slate-500">Ticked rates are added to new documents. Each line can be taxable or not.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => set({ taxes: [...s.taxes, { id: lineId(), name: "Sales tax", rate: 0, default: s.taxes.length === 0 }] })}>
            <Plus /> Add rate
          </button>
        </div>
        {s.taxes.map((t, i) => (
          <div key={t.id} className="mb-2 flex flex-wrap items-center gap-2">
            <input className="input min-w-0 flex-1" aria-label="Tax name" value={t.name} placeholder="NY Sales Tax" onChange={(e) => set({ taxes: s.taxes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="input w-24 text-right" aria-label={`${t.name} %`} inputMode="decimal" value={t.rate} onChange={(e) => set({ taxes: s.taxes.map((x, j) => (j === i ? { ...x, rate: roundPct(parseAmount(e.target.value) ?? 0) } : x)) })} />
            <span className="text-sm text-slate-500">%</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-brand-600" checked={t.default} onChange={(e) => set({ taxes: s.taxes.map((x, j) => (j === i ? { ...x, default: e.target.checked } : x)) })} /> default
            </label>
            <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={`Remove ${t.name}`} onClick={() => set({ taxes: s.taxes.filter((_, j) => j !== i) })}>
              <X />
            </button>
          </div>
        ))}
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-600" checked={s.laborTaxable} onChange={(e) => set({ laborTaxable: e.target.checked })} /> Labor lines are taxable (quotes made from the job’s pricing)
        </label>
      </div>

      {/* Payment */}
      <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="font-semibold">How clients pay you</h3>
          <p className="text-xs text-slate-500">Shown on invoices under “How to pay”. Leave anything you don’t take blank.</p>
        </div>
        <label className="text-sm">
          <span className="label">Bank transfer / ACH details</span>
          <textarea className="input min-h-16" value={s.payment.bank} onChange={(e) => set({ payment: { ...s.payment, bank: e.target.value } })} placeholder="Bank, routing and account number" />
        </label>
        <label className="text-sm">
          <span className="label">Payment instructions</span>
          <textarea className="input min-h-16" value={s.payment.instructions} onChange={(e) => set({ payment: { ...s.payment, instructions: e.target.value } })} placeholder="We accept checks, ACH and Zelle." />
        </label>
        <label className="text-sm">
          <span className="label">Zelle</span>
          <input className="input" value={s.payment.zelle} onChange={(e) => set({ payment: { ...s.payment, zelle: e.target.value } })} placeholder="billing@yourcompany.com" />
        </label>
        <label className="text-sm">
          <span className="label">Checks payable to</span>
          <input className="input" value={s.payment.checkPayable} onChange={(e) => set({ payment: { ...s.payment, checkPayable: e.target.value } })} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="label">“Pay online” link (optional)</span>
          <input className="input font-mono text-xs" value={s.payment.payUrl} onChange={(e) => set({ payment: { ...s.payment, payUrl: e.target.value } })} placeholder="https://buy.stripe.com/…?amount={amount}&ref={number}" />
          <span className="mt-1 block text-xs text-slate-500">Your own Stripe, Square or PayPal payment link. {"{amount}"} becomes the balance due, {"{number}"} the invoice number.</span>
        </label>
      </div>

      {/* Layout */}
      <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="font-semibold">Look</h3>
          <p className="text-xs text-slate-500">Logo and colours come from Your business above. Each document can change these.</p>
        </div>
        <label className="text-sm">
          <span className="label">Layout</span>
          <select className="input" value={s.template} onChange={(e) => set({ template: e.target.value as DocumentSettings["template"] })}>
            <option value="classic">Classic</option>
            <option value="modern">Modern (colour header)</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Group pricing lines</span>
          <select className="input" value={s.grouping} onChange={(e) => set({ grouping: e.target.value as DocumentSettings["grouping"] })}>
            <option value="category">By category</option>
            <option value="floor">By floor</option>
            <option value="room">By room</option>
            <option value="flat">One list</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Prices shown</span>
          <select className="input" value={s.detail} onChange={(e) => set({ detail: e.target.value as "lines" | "sections" })}>
            <option value="lines">Every line</option>
            <option value="sections">Section totals only</option>
          </select>
        </label>
        <div className="text-sm sm:col-span-3">
          <span className="label">Columns</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(
              [
                ["qty", "Qty"],
                ["unit", "Unit"],
                ["unitPrice", "Unit price"],
                ["discount", "Discount"],
                ["tax", "Tax"],
                ["sku", "SKU"],
                ["lineTotal", "Line totals"],
              ] as const
            ).map(([c, l]) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-brand-600" checked={s.columns[c]} onChange={(e) => set({ columns: { ...s.columns, [c]: e.target.checked } })} />
                {l}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" className="accent-brand-600" checked={s.lineDetails} onChange={(e) => set({ lineDetails: e.target.checked })} /> Rooms and device labels under each pricing line
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" className="accent-brand-600" checked={s.signatureOnQuotes} onChange={(e) => set({ signatureOnQuotes: e.target.checked })} /> Clients sign to approve quotes online
        </label>
      </div>

      {/* Reminders */}
      <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h3 className="font-semibold">Payment reminders</h3>
          <p className="text-xs text-slate-500">Invoices due for a reminder are flagged on the Invoices page, ready to email in one click.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-600" checked={s.reminders.enabled} onChange={(e) => set({ reminders: { ...s.reminders, enabled: e.target.checked } })} /> Flag reminders
        </label>
        <label className="text-sm">
          <span className="label">Days before the due date</span>
          <input className="input w-24 text-right" inputMode="numeric" value={s.reminders.daysBeforeDue} onChange={(e) => set({ reminders: { ...s.reminders, daysBeforeDue: Math.max(0, Math.round(parseAmount(e.target.value) ?? 0)) } })} />
        </label>
        <label className="text-sm">
          <span className="label">Days after (comma separated)</span>
          <input
            className="input"
            defaultValue={s.reminders.daysAfterDue.join(", ")}
            onBlur={(e) =>
              set({
                reminders: {
                  ...s.reminders,
                  daysAfterDue: e.target.value
                    .split(/[,\s]+/)
                    .map((x) => Math.round(Number(x)))
                    .filter((x) => x > 0)
                    .sort((a, b) => a - b),
                },
              })
            }
          />
        </label>
      </div>

      <div className={`sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl px-4 py-3 transition ${dirty ? "bg-ink/95 shadow-pop backdrop-blur" : ""}`}>
        {dirty && <span className="mr-auto text-sm text-white/80">{problem ?? "Unsaved invoicing changes"}</span>}
        <button type="button" className={`btn ${dirty ? "btn-brand" : ""}`} disabled={!dirty || !!problem} onClick={() => void save()}>
          <Save /> Save invoicing
        </button>
      </div>
    </div>
  );
}
