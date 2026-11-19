"use client";
// Dialogs for quotes / invoices: new quote from the estimate, quote → invoice, record a payment, email the client.
import { useMemo, useState } from "react";
import { adjustAmount, docName, documentTotals, formatDocMoney, PAYMENT_METHODS, today } from "@/lib/documents";
import type { InvoiceMode } from "@/lib/documents";
import type { QuoteBuildOptions } from "@/lib/docFromEstimate";
import type { DocGrouping, DocumentSettings, PaymentMethod, SalesDoc } from "@/lib/types";
import { Modal, parseAmount } from "./ui";

const GROUPINGS: { id: DocGrouping; label: string; hint: string }[] = [
  { id: "category", label: "By category", hint: "Security, Network, Audio… then cabling and labor" },
  { id: "floor", label: "By floor", hint: "One section per plan sheet, quantities split by floor" },
  { id: "room", label: "By room", hint: "One section per room (devices without a room go under “Other areas”)" },
  { id: "flat", label: "One list", hint: "No sections" },
];

export function NewQuoteDialog({ settings, estimateTotal, onClose, onCreate }: { settings: DocumentSettings; estimateTotal: string; onClose: () => void; onCreate: (o: QuoteBuildOptions) => void }) {
  const [o, setO] = useState<QuoteBuildOptions>({ grouping: settings.grouping, details: settings.lineDetails, detail: settings.detail, includeOptional: true });
  const label = settings.kinds.quote.label.toLowerCase();
  return (
    <Modal title={`New ${label} from the estimate`} description={`A copy of the job's estimate (${estimateTotal} before tax) you can edit and send. Changing it never changes the estimate.`} onClose={onClose}>
      <fieldset className="space-y-1.5">
        <legend className="label">Group the lines</legend>
        {GROUPINGS.map((g) => (
          <label key={g.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 ring-1 ${o.grouping === g.id ? "bg-brand-50 ring-brand-200" : "ring-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="grouping" className="mt-0.5 accent-brand-600" checked={o.grouping === g.id} onChange={() => setO({ ...o, grouping: g.id })} />
            <span className="text-sm">
              <span className="font-medium">{g.label}</span>
              <span className="block text-xs text-slate-500">{g.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-brand-600" checked={o.details} onChange={(e) => setO({ ...o, details: e.target.checked })} /> Device details under each line (rooms, labels)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-brand-600" checked={o.detail === "sections"} onChange={(e) => setO({ ...o, detail: e.target.checked ? "sections" : "lines" })} /> Hide unit prices — show section totals only
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-brand-600" checked={o.includeOptional} onChange={(e) => setO({ ...o, includeOptional: e.target.checked })} /> List optional “?” items (not counted in the total)
        </label>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-brand flex-1" onClick={() => onCreate(o)}>
          Create {label}
        </button>
      </div>
    </Modal>
  );
}

export function ConvertDialog({ quote, prior, settings, onClose, onCreate }: { quote: SalesDoc; prior: SalesDoc[]; settings: DocumentSettings; onClose: () => void; onCreate: (m: InvoiceMode) => void }) {
  const total = documentTotals(quote).total;
  const money = (n: number) => formatDocMoney(n, quote.currency, settings.locale);
  const depositDefault = quote.deposit?.type === "pct" ? quote.deposit.value : settings.depositPct || 50;
  const [mode, setMode] = useState<InvoiceMode["mode"]>(prior.length ? "final" : quote.deposit ? "deposit" : "full");
  const [pct, setPct] = useState(String(depositDefault));
  const items = quote.lines.filter((l) => (l.kind ?? "item") === "item" && !l.optional);
  const [chosen, setChosen] = useState<Set<string>>(new Set(items.map((l) => l.id)));
  const invoiced = prior.reduce((s, d) => s + d.total, 0);
  const p = parseAmount(pct) ?? 0;
  const how: InvoiceMode = mode === "deposit" || mode === "progress" ? { mode, pct: p } : mode === "lines" ? { mode, lineIds: [...chosen] } : { mode } as InvoiceMode;
  const preview = mode === "deposit" || mode === "progress" ? adjustAmount({ type: "pct", value: p }, total) : mode === "final" ? total - invoiced : mode === "lines" ? null : total;
  const options: { id: InvoiceMode["mode"]; label: string; hint: string }[] = [
    { id: "full", label: "Full invoice", hint: `Every line — ${money(total)}` },
    { id: "deposit", label: "Deposit invoice", hint: "A % of the quote total, as one line" },
    { id: "progress", label: "Progress invoice", hint: "Bill a % of the job now" },
    { id: "lines", label: "Selected lines", hint: "Bill some of the lines" },
    { id: "final", label: "Final invoice", hint: prior.length ? `Every line, less the ${prior.length} invoice${prior.length > 1 ? "s" : ""} already made (${money(invoiced)})` : "Every line (nothing invoiced yet)" },
  ];
  return (
    <Modal title={`Invoice from ${docName(quote, settings)}`} description={`Quote total ${money(total)}${prior.length ? ` · invoiced so far ${money(invoiced)}` : ""}`} onClose={onClose} wide>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 ring-1 ${mode === o.id ? "bg-brand-50 ring-brand-200" : "ring-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="mode" className="mt-0.5 accent-brand-600" checked={mode === o.id} onChange={() => setMode(o.id)} />
            <span className="text-sm">
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {(mode === "deposit" || mode === "progress") && (
        <label className="mt-4 block text-sm">
          <span className="label">Percent of the quote</span>
          <input className="input w-28 text-right" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} autoFocus />
        </label>
      )}
      {mode === "lines" && (
        <div className="mt-4 max-h-64 space-y-1 overflow-auto rounded-lg p-2 ring-1 ring-slate-200">
          {items.map((l) => (
            <label key={l.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" className="accent-brand-600" checked={chosen.has(l.id)} onChange={(e) => setChosen((s) => new Set(e.target.checked ? [...s, l.id] : [...s].filter((x) => x !== l.id)))} />
              <span className="min-w-0 flex-1 truncate">{l.description}</span>
              <span className="text-slate-500 tabular-nums">{money(documentTotals({ lines: [l], taxes: [] }).subtotal)}</span>
            </label>
          ))}
        </div>
      )}
      {preview != null && <p className="mt-4 text-sm text-slate-600">This invoice: <strong className="tabular-nums">{money(preview)}</strong>{mode === "deposit" || mode === "progress" ? " (taxes included, not taxed again)" : ""}</p>}
      <div className="mt-5 flex gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-brand flex-1" disabled={(mode === "lines" && !chosen.size) || ((mode === "deposit" || mode === "progress") && !(p > 0 && p <= 100))} onClick={() => onCreate(how)}>
          Create invoice
        </button>
      </div>
    </Modal>
  );
}

export function PaymentDialog({ doc, settings, onClose, onSave }: { doc: SalesDoc; settings: DocumentSettings; onClose: () => void; onSave: (p: { amount: number; date: string; method: PaymentMethod; reference: string; note: string }) => void }) {
  const [refund, setRefund] = useState(false);
  const [amount, setAmount] = useState(doc.balanceDue > 0 ? doc.balanceDue.toFixed(2) : "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("check");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const n = parseAmount(amount);
  const money = (x: number) => formatDocMoney(x, doc.currency, settings.locale);
  return (
    <Modal title={refund ? "Record a refund" : "Record a payment"} description={`${docName(doc, settings)} · balance ${money(doc.balanceDue)}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (n == null || n <= 0) return;
          onSave({ amount: refund ? -n : n, date, method, reference: reference.trim(), note: note.trim() });
        }}
      >
        <div className="seg w-full">
          <button type="button" className={`tab flex-1 ${!refund ? "tab-active" : ""}`} onClick={() => setRefund(false)}>
            Payment
          </button>
          <button type="button" className={`tab flex-1 ${refund ? "tab-active" : ""}`} onClick={() => setRefund(true)}>
            Refund
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="label">Amount</span>
            <input className="input text-right tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="text-sm">
            <span className="label">Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>
        <label className="block text-sm">
          <span className="label">Method</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="label">{method === "check" ? "Check number" : "Reference"}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "check" ? "1042" : "Transaction id"} />
        </label>
        <label className="block text-sm">
          <span className="label">Note (internal)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-brand flex-1" disabled={n == null || n <= 0}>
            Save {refund ? "refund" : "payment"}
            {n ? ` · ${money(refund ? -n : n)}` : ""}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export type EmailKind = "document" | "reminder" | "receipt";

export function EmailDialog({ doc, settings, kind: initial, onClose, onSend }: { doc: SalesDoc; settings: DocumentSettings; kind: EmailKind; onClose: () => void; onSend: (r: { to: string; kind: EmailKind; message: string }) => Promise<void> }) {
  const [to, setTo] = useState(doc.client.email ?? "");
  const [kind, setKind] = useState<EmailKind>(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kinds = useMemo(() => {
    const out: { id: EmailKind; label: string }[] = [{ id: "document", label: `The ${settings.kinds[doc.kind].label.toLowerCase()}` }];
    if (doc.kind === "invoice" && doc.balanceDue > 0) out.push({ id: "reminder", label: "Payment reminder" });
    if (doc.kind === "invoice" && doc.amountPaid > 0) out.push({ id: "receipt", label: "Payment receipt" });
    return out;
  }, [doc, settings]);
  return (
    <Modal title="Email the client" description="They get a link to view it online and download the PDF." onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSend({ to: to.trim(), kind, message: message.trim() });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          <span className="label">To</span>
          <input className="input" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
        </label>
        {kinds.length > 1 && (
          <label className="block text-sm">
            <span className="label">What to send</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as EmailKind)}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="label">Message (optional)</span>
          <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks again — let us know if you have any questions." />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-brand flex-1" disabled={busy || !to.trim()}>
            {busy ? "Sending…" : "Send email"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
