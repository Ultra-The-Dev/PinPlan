// A quote / invoice / credit note as the client sees it (the client link, and the live preview in the editor).
// Renders a DocSnapshot in one of three looks: classic, modern, compact. No browser APIs: safe to prerender.
import { clientTheme } from "@/lib/clientTheme";
import { formatDocDate, formatDocMoney, lineAmounts, type DocSnapshot } from "@/lib/documents";
import { fmtPct } from "@/lib/percent";

export interface DocLive {
  status?: string;
  number?: string | null;
  amountPaid?: number;
  balanceDue?: number;
  paidAt?: string | null;
  overdue?: boolean;
  expired?: boolean;
}

const pctText = (n: number) => `${fmtPct(n)}%`;

export default function DocView({ snap, live, payLink, className = "" }: { snap: DocSnapshot; live?: DocLive; payLink?: string | null; className?: string }) {
  const money = (n: number) => formatDocMoney(n, snap.currency, snap.locale);
  const date = (d: string | null | undefined) => formatDocDate(d, snap.locale);
  // Contrast-checked colours from the company's brand (src/lib/clientTheme.ts): `brand` for rules and fills,
  // `ink` wherever the brand colour is text, so a pale brand (yellow, sky blue) stays readable.
  const theme = clientTheme(snap.business.brandColor, snap.business.accentColor);
  const brand = theme.brand;
  const ink = theme.brandInk;
  const accent = snap.business.accentColor || brand;
  const c = snap.columns;
  const sections = snap.detail === "sections";
  const t = snap.template;
  const compact = t === "compact";
  const modern = t === "modern";
  const number = live?.number ?? snap.number;
  const isInvoice = snap.kind === "invoice";
  const paid = live?.amountPaid ?? 0;
  const balance = live?.balanceDue ?? (isInvoice ? snap.totals.total : 0);
  const counted = snap.lines.filter((l) => !l.optional);
  const optional = snap.lines.filter((l) => l.optional && (l.kind ?? "item") === "item");
  const sectionTotal = new Map(snap.sections.map((s) => [s.id, s.total]));
  const showPriceCols = !sections;
  const pad = compact ? "px-5 py-5 sm:px-7" : "px-5 py-7 sm:px-10 sm:py-10";

  const meta: [string, string][] = [
    ["Number", number ?? "—"],
    ["Date", date(snap.issueDate)],
    ...(snap.dueDate ? ([["Due", date(snap.dueDate)]] as [string, string][]) : []),
    ...(snap.termsLabel ? ([["Terms", snap.termsLabel]] as [string, string][]) : []),
    ...(snap.validUntil ? ([["Valid until", date(snap.validUntil)]] as [string, string][]) : []),
  ];

  const lineRow = (l: DocSnapshot["lines"][number], muted = false) => {
    const a = lineAmounts(l);
    return (
      <div key={l.id} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-slate-100 ${compact ? "py-1.5" : "py-2.5"} ${muted ? "text-slate-500" : ""}`}>
        <div className="min-w-0">
          <div className="font-medium break-words">
            {l.description || "—"}
            {c.sku && l.sku ? <span className="ml-2 text-xs font-normal text-slate-400">{l.sku}</span> : null}
          </div>
          {l.details ? <div className="mt-0.5 text-xs break-words whitespace-pre-line text-slate-500">{l.details}</div> : null}
          {(c.qty || c.unitPrice || (c.discount && l.discount?.value) || (c.tax && l.taxable)) && (
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {c.qty && `${+Number(l.qty).toFixed(2)}${c.unit && l.unit ? ` ${l.unit}` : ""}`}
              {showPriceCols && c.unitPrice ? `${c.qty ? " × " : ""}${money(l.unitPrice)}` : ""}
              {showPriceCols && c.discount && a.discount ? ` · less ${l.discount?.type === "pct" ? pctText(l.discount.value) : money(a.discount)}` : ""}
              {c.tax && l.taxable && snap.totals.taxLines.length ? " · taxable" : ""}
            </div>
          )}
        </div>
        {showPriceCols && c.lineTotal ? <div className="text-right font-medium tabular-nums">{money(l.net)}</div> : <div />}
      </div>
    );
  };

  return (
    <article
      className={`doc-view overflow-hidden bg-white text-[#111a33] ${compact ? "text-[13px]" : "text-sm"} ${className}`}
      style={{ "--doc-brand": brand, "--doc-accent": accent } as React.CSSProperties}
    >
      {!modern && <div className="h-1.5" style={{ background: brand }} />}
      <header className={modern ? "px-5 py-7 sm:px-10" : pad} style={modern ? { background: theme.band, color: theme.onBand } : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-sm">
            {snap.business.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snap.business.logo} alt={snap.business.name} className={`mb-2 h-12 w-auto max-w-[220px] object-contain ${modern ? "rounded bg-white p-1" : ""}`} />
            ) : (
              <div className="text-xl font-extrabold tracking-tight" style={modern ? undefined : { color: ink }}>
                {snap.business.name || "Your company"}
              </div>
            )}
            <div className={`mt-1 space-y-0.5 text-xs leading-relaxed ${modern ? "" : "text-slate-500"}`} style={modern ? { color: theme.onBandMuted } : undefined}>
              {snap.business.logo && snap.business.name ? <div className={`font-semibold ${modern ? "" : "text-slate-700"}`} style={modern ? { color: theme.onBand } : undefined}>{snap.business.name}</div> : null}
              {[snap.business.address, snap.business.phone, snap.business.email, snap.business.website].filter(Boolean).map((x) => (
                <div key={x} className="break-words whitespace-pre-line">
                  {x}
                </div>
              ))}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className={`font-extrabold tracking-tight ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`} style={modern ? undefined : { color: ink }}>
              {snap.title}
            </div>
            <dl className="mt-2 space-y-0.5 text-xs">
              {meta.map(([k, v]) => (
                <div key={k} className="flex justify-end gap-3">
                  <dt className={modern ? "" : "text-slate-500"} style={modern ? { color: theme.onBandMuted } : undefined}>
                    {k}
                  </dt>
                  <dd className="min-w-24 font-semibold tabular-nums">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </header>

      <div className={pad + (modern ? "" : " pt-0 sm:pt-0")}>
        <div className={`grid gap-3 sm:grid-cols-2 ${compact ? "mb-4" : "mb-7"}`}>
          <div className={compact ? "" : "rounded-xl bg-slate-50 p-4"}>
            <div className="mb-1 text-xs font-semibold text-slate-500">{isInvoice ? "Bill to" : "Prepared for"}</div>
            <div className="font-semibold">{snap.client.name || "—"}</div>
            {snap.client.company ? <div>{snap.client.company}</div> : null}
            {[snap.client.billingAddress, snap.client.email, snap.client.phone].filter(Boolean).map((x) => (
              <div key={x} className="break-words whitespace-pre-line text-slate-600">
                {x}
              </div>
            ))}
          </div>
          {snap.client.siteAddress && snap.client.siteAddress !== snap.client.billingAddress ? (
            <div className={compact ? "" : "rounded-xl bg-slate-50 p-4"}>
              <div className="mb-1 text-xs font-semibold text-slate-500">Job site</div>
              <div className="font-semibold break-words whitespace-pre-line">{snap.client.siteAddress}</div>
            </div>
          ) : null}
        </div>

        {(live?.status === "paid" || live?.status === "void" || live?.overdue || live?.expired) && (
          <div
            className={`mb-5 rounded-lg px-4 py-2.5 text-sm font-semibold ${live.status === "paid" ? "bg-emerald-50 text-emerald-800" : live.status === "void" ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700"}`}
          >
            {live.status === "paid" ? `Paid in full${live.paidAt ? ` on ${date(live.paidAt)}` : ""} — thank you!` : live.status === "void" ? "This document was voided." : live.expired ? "This quote has expired." : "This invoice is past due."}
          </div>
        )}

        <div className="flex items-end justify-between border-b-2 pb-1.5 text-xs font-semibold text-slate-500" style={{ borderColor: brand }}>
          <span>Description</span>
          {showPriceCols && c.lineTotal ? <span>Amount</span> : sections ? <span>Amount</span> : null}
        </div>
        {counted.map((l) =>
          (l.kind ?? "item") === "section" ? (
            <div key={l.id} className={`flex items-baseline justify-between gap-3 ${compact ? "pt-3 pb-1" : "pt-5 pb-1.5"}`}>
              <div className="text-sm font-bold" style={{ color: ink }}>
                {l.description}
              </div>
              {sections && <div className="font-semibold tabular-nums">{money(sectionTotal.get(l.id) ?? 0)}</div>}
            </div>
          ) : (
            lineRow(l)
          ),
        )}
        {sections && sectionTotal.get(null) ? (
          <div className="flex justify-between pt-2 font-semibold">
            <span>Other items</span>
            <span className="tabular-nums">{money(sectionTotal.get(null) ?? 0)}</span>
          </div>
        ) : null}

        <div className="mt-5 ml-auto w-full max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={money(snap.totals.subtotal)} />
          {snap.totals.discountTotal ? <Row label={`Discount${snap.discount?.type === "pct" ? ` (${pctText(snap.discount.value)})` : ""}`} value={`−${money(snap.totals.discountTotal)}`} /> : null}
          {snap.fees.map((f) => (
            <Row key={f.id} label={f.label || "Fee"} value={money(f.amount)} />
          ))}
          {snap.totals.taxLines.map((x) => (
            <Row key={x.id} label={`${x.name || "Tax"} (${pctText(x.rate)})`} value={money(x.amount)} />
          ))}
          {snap.deductions?.length ? (
            <>
              <Row label="Job total" value={money(snap.totals.grossTotal)} strong />
              {snap.deductions.map((d) => (
                <Row key={d.id} label={d.label} value={`−${money(d.amount)}`} />
              ))}
            </>
          ) : null}
          <div className="flex items-baseline justify-between border-t-2 pt-2" style={{ borderColor: brand }}>
            <span className="font-semibold">{snap.deductions?.length ? "This invoice" : "Total"}</span>
            <span className="text-xl font-extrabold tabular-nums" style={{ color: ink }}>
              {money(snap.totals.total)}
            </span>
          </div>
          {snap.totals.deposit != null && snap.kind === "quote" ? <Row label="Deposit due on approval" value={money(snap.totals.deposit)} strong /> : null}
          {isInvoice && paid ? <Row label="Paid" value={`−${money(paid)}`} /> : null}
          {isInvoice ? (
            <div className="mt-1 flex items-baseline justify-between rounded-lg px-3 py-2" style={{ background: theme.brandTint }}>
              <span className="font-semibold">Balance due</span>
              <span className="text-lg font-extrabold tabular-nums">{money(balance)}</span>
            </div>
          ) : null}
        </div>

        {optional.length > 0 && (
          <section className="mt-7">
            <div className="mb-1 text-sm font-bold text-slate-600">Optional items (not included in the total)</div>
            {optional.map((l) => lineRow(l, true))}
          </section>
        )}

        {isInvoice && (snap.payment.instructions || snap.payment.bank || snap.payment.zelle || snap.payment.checkPayable || payLink) && balance > 0 && live?.status !== "void" && (
          <section className="mt-7 rounded-xl p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-bold" style={{ color: ink }}>
              How to pay
            </div>
            <div className="space-y-1.5 text-sm text-slate-700">
              {snap.payment.instructions ? <p className="whitespace-pre-line">{snap.payment.instructions}</p> : null}
              {snap.payment.bank ? (
                <p className="whitespace-pre-line">
                  <span className="font-semibold">Bank transfer / ACH: </span>
                  {snap.payment.bank}
                </p>
              ) : null}
              {snap.payment.zelle ? (
                <p>
                  <span className="font-semibold">Zelle: </span>
                  {snap.payment.zelle}
                </p>
              ) : null}
              {snap.payment.checkPayable ? (
                <p>
                  <span className="font-semibold">Checks payable to: </span>
                  {snap.payment.checkPayable}
                </p>
              ) : null}
              {number ? <p className="text-xs text-slate-500">Please include {number} with your payment.</p> : null}
            </div>
            {payLink ? (
              <a href={payLink} target="_blank" rel="noreferrer noopener" className="btn mt-3 h-12 rounded-[10px] px-6 font-bold print:hidden" style={{ background: theme.action, color: theme.onAction, borderColor: theme.actionEdge }}>
                Pay {money(balance)} online
              </a>
            ) : null}
          </section>
        )}

        {snap.plansUrl ? (
          <p className="mt-5 text-sm">
            <a href={snap.plansUrl} target="_blank" rel="noreferrer noopener" className="font-semibold underline" style={{ color: ink }}>
              View the plans (PDF)
            </a>
          </p>
        ) : null}
        <TextBlock title="Notes" body={snap.notes} />
        <TextBlock title="Terms" body={snap.terms} />
        {snap.lateFee ? <TextBlock title="Late payments" body={snap.lateFee} /> : null}
        {snap.footer ? <p className="mt-8 border-t border-slate-100 pt-4 text-center text-xs whitespace-pre-line text-slate-500">{snap.footer}</p> : null}
      </div>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-slate-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TextBlock({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null;
  return (
    <section className="mt-6 text-sm leading-relaxed text-slate-600">
      <h3 className="mb-1 text-sm font-bold text-slate-700">{title}</h3>
      <p className="whitespace-pre-line">{body}</p>
    </section>
  );
}

