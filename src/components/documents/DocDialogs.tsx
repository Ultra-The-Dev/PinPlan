"use client";
// Dialogs for quotes / invoices: new quote from the job's pricing, quote → invoice, record a payment, email the client.
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { adjustAmount, canAddChangeOrders, docName, documentTotals, formatDocMoney, PAYMENT_METHODS, today } from "@/lib/documents";
import type { BillableChange, InvoiceMode } from "@/lib/documents";
import type { QuoteBuildOptions } from "@/lib/docFromEstimate";
import type { DocGrouping, DocumentSettings, PaymentMethod, SalesDoc } from "@/lib/types";
import { Modal, parseAmount } from "./ui";

const GROUPINGS: { id: DocGrouping; label: string; hint: string }[] = [
  { id: "category", label: "By category", hint: "Security, Network, Audio… then cabling and labor" },
  { id: "floor", label: "By floor", hint: "One section per plan, quantities split by floor" },
  { id: "room", label: "By room", hint: "One section per room (devices without a room go under “Other areas”)" },
  { id: "flat", label: "One list", hint: "No sections" },
];

/**
 * New quote from the job's pricing. `preview` builds the quote for the chosen options, so the dialog can show its total
 * (with tax) next to the pricing total and warn when they differ (different tax settings, or labor not taxed).
 */
export function NewQuoteDialog({ settings, pricingTotal, preview, onClose, onCreate }: { settings: DocumentSettings; pricingTotal: number; preview: (o: QuoteBuildOptions) => SalesDoc | null; onClose: () => void; onCreate: (o: QuoteBuildOptions) => void }) {
  const [o, setO] = useState<QuoteBuildOptions>({ grouping: settings.grouping, details: settings.lineDetails, detail: settings.detail, includeOptional: true });
  const label = settings.kinds.quote.label.toLowerCase();
  const money = (n: number) => formatDocMoney(n, settings.currency, settings.locale);
  const quote = useMemo(() => preview(o), [preview, o]);
  const quoteTotal = quote ? documentTotals(quote).total : null;
  const diff = quoteTotal == null ? 0 : Math.round((quoteTotal - pricingTotal) * 100) / 100;
  return (
    <Modal title={`New ${label}`} description="Built from the job's pricing. Edit it freely: changes here never change the job's pricing." onClose={onClose}>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Job pricing (with tax)</dt>
          <dd className="font-semibold tabular-nums">{money(pricingTotal)}</dd>
        </div>
        <div className={`rounded-lg px-3 py-2 ${diff ? "bg-amber-50" : "bg-slate-50"}`}>
          <dt className="text-xs text-slate-500">This {label} (with tax)</dt>
          <dd className="font-semibold tabular-nums">{quoteTotal == null ? "—" : money(quoteTotal)}</dd>
        </div>
      </dl>
      {diff !== 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200" role="status">
          This {label} comes to {money(Math.abs(diff))} {diff > 0 ? "more" : "less"} than the job’s pricing. {Math.abs(diff) < 0.05 ? "That’s rounding from splitting quantities over floors or rooms." : "Your taxes in Settings → Invoicing differ from the job’s tax % (or labor isn’t taxed there). Check the taxes on the " + label + " before sending it."}
        </p>
      )}
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
          <input type="checkbox" className="accent-brand-600" checked={o.includeOptional} onChange={(e) => setO({ ...o, includeOptional: e.target.checked })} /> List optional items (the client can add them; not counted in the total)
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

type Mode = InvoiceMode["mode"];

/**
 * Quote → invoice. Deposit · Remaining balance · Custom amount; Progress (%) and Selected lines under "More options".
 * Approved change orders not billed yet can go on it ("Include approved change orders", on by default for the
 * remaining balance), each as its own section, recorded so it's billed once.
 */
export function ConvertDialog({ quote, prior, settings, changes = [], initialMode, onClose, onCreate }: { quote: SalesDoc; prior: SalesDoc[]; settings: DocumentSettings; changes?: BillableChange[]; initialMode?: Mode; onClose: () => void; onCreate: (m: InvoiceMode, changes: BillableChange[]) => void }) {
  const total = documentTotals(quote).total;
  const money = (n: number) => formatDocMoney(n, quote.currency, settings.locale);
  const depositDefault = quote.deposit?.type === "pct" ? quote.deposit.value : quote.deposit?.type === "fixed" && total > 0 ? Math.round((quote.deposit.value / total) * 10000) / 100 : settings.depositPct || 50;
  const [mode, setMode] = useState<Mode>(initialMode ?? (prior.length ? "final" : quote.deposit ? "deposit" : "final"));
  const [more, setMore] = useState(mode === "progress" || mode === "lines");
  const [pct, setPct] = useState(String(depositDefault));
  const [amount, setAmount] = useState("");
  const [coChoice, setCoChoice] = useState<boolean | null>(null);
  const items = quote.lines.filter((l) => (l.kind ?? "item") === "item" && !l.optional);
  const [chosen, setChosen] = useState<Set<string>>(new Set(items.map((l) => l.id)));
  // What's been invoiced against the quote itself (change orders billed on those invoices aren't part of it).
  const invoiced = Math.round(prior.reduce((s, d) => s + d.total - (d.options?.changeOrderAmount ?? 0), 0) * 100) / 100;
  const left = Math.max(0, Math.round((total - invoiced) * 100) / 100);
  const p = parseAmount(pct) ?? 0;
  const a = parseAmount(amount) ?? 0;
  const pctMode = mode === "deposit" || mode === "progress";
  // The remaining balance keeps the quote's discount; change orders can't share it (they'd be discounted too).
  const discounted = !canAddChangeOrders(quote);
  const coBlocked = changes.length > 0 && mode === "final" && discounted;
  const coAllowed = changes.length > 0 && !pctMode && !coBlocked;
  const withCos = coAllowed && (coChoice ?? mode === "final");
  const coTotal = withCos ? changes.reduce((s, c) => s + c.total, 0) : 0;
  const how: InvoiceMode = pctMode ? { mode, pct: p } : mode === "amount" ? { mode, amount: a } : mode === "lines" ? { mode, lineIds: [...chosen] } : ({ mode } as InvoiceMode);
  const base = pctMode ? adjustAmount({ type: "pct", value: p }, total) : mode === "final" ? left : mode === "amount" ? a : mode === "lines" ? documentTotals({ ...quote, lines: quote.lines.filter((l) => (l.kind ?? "item") !== "item" || chosen.has(l.id)), discount: null, fees: [] }).total : total;
  const preview = Math.round((base + coTotal) * 100) / 100;
  const choose = (m: Mode) => setMode(m);
  const main: { id: Mode; label: string; hint: string }[] = [
    { id: "deposit", label: "Deposit", hint: `${depositDefault}% of the ${settings.kinds.quote.label.toLowerCase()} = ${money(adjustAmount({ type: "pct", value: depositDefault }, total))}` },
    { id: "final", label: "Remaining balance", hint: prior.length ? `${money(left)} left after ${prior.length} invoice${prior.length > 1 ? "s" : ""} (${money(invoiced)})` : `Every line — ${money(total)}` },
    { id: "amount", label: "Custom amount", hint: "Bill a set amount now" },
  ];
  const extra: { id: Mode; label: string; hint: string }[] = [
    { id: "progress", label: "Progress (%)", hint: "Bill a percentage of the job" },
    { id: "lines", label: "Selected lines", hint: "Bill some of the lines" },
  ];
  const option = (o: { id: Mode; label: string; hint: string }) => (
    <label key={o.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 ring-1 ${mode === o.id ? "bg-brand-50 ring-brand-200" : "ring-slate-200 hover:bg-slate-50"}`}>
      <input type="radio" name="mode" className="mt-0.5 accent-brand-600" checked={mode === o.id} onChange={() => choose(o.id)} />
      <span className="text-sm">
        <span className="font-medium">{o.label}</span>
        <span className="block text-xs text-slate-500">{o.hint}</span>
      </span>
    </label>
  );
  const invalid = (mode === "lines" && !chosen.size) || (pctMode && !(p > 0 && p <= 100)) || (mode === "amount" && !(a > 0)) || !(preview > 0);
  return (
    <Modal title={`Invoice from ${docName(quote, settings)}`} description={`${settings.kinds.quote.label} total ${money(total)}${prior.length ? ` · invoiced so far ${money(invoiced)}` : ""}`} onClose={onClose} wide>
      <div className="grid gap-1.5 sm:grid-cols-3">{main.map(option)}</div>
      <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} /> More options
      </button>
      {more && <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{extra.map(option)}</div>}
      {pctMode && (
        <label className="mt-4 block text-sm">
          <span className="label">Percent of the {settings.kinds.quote.label.toLowerCase()}</span>
          <input className="input w-28 text-right" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} autoFocus />
        </label>
      )}
      {mode === "amount" && (
        <label className="mt-4 block text-sm">
          <span className="label">Amount to bill</span>
          <input className="input w-36 text-right tabular-nums" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} autoFocus />
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
      {coAllowed && (
        <div className="mt-4 rounded-lg p-3 ring-1 ring-slate-200">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="accent-brand-600" checked={withCos} onChange={(e) => setCoChoice(e.target.checked)} /> Include approved change orders
          </label>
          <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-slate-500">
            {changes.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span className="truncate">
                  {c.code} — {c.title || "Change order"}
                </span>
                <span className="tabular-nums">{money(c.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {coBlocked && (
        <p className="mt-4 text-xs text-slate-500">
          This {settings.kinds.quote.label.toLowerCase()} has a discount, so its {changes.length} approved change order{changes.length > 1 ? "s" : ""} go on their own invoice: open each one under Change orders and press “Bill this change”.
        </p>
      )}
      <p className="mt-4 text-sm text-slate-600">
        This invoice: <strong className="tabular-nums">{money(preview)}</strong>
        {pctMode || mode === "amount" ? " (taxes included, not taxed again)" : ""}
      </p>
      <div className="mt-5 flex gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-brand flex-1" disabled={invalid} onClick={() => onCreate(how, withCos ? changes : [])}>
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
