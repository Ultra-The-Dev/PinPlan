"use client";
// The line editor: items and section headings, fast to fill in from the keyboard.
//   Enter → next line (adds one at the end) · ⌘/Ctrl+Enter → new line below · Alt+↑/↓ → move · ⌘/Ctrl+⌫ on an empty line → delete
import { ArrowDown, ArrowUp, ChevronDown, Heading, Plus, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { formatDocMoney, lineAmounts, lineId } from "@/lib/documents";
import { useT } from "@/lib/i18n";
import type { DocLine, DocTaxRate } from "@/lib/types";
import { parseAmount } from "./ui";
import { fmtPct } from "@/lib/percent";

type Col = "desc" | "qty" | "unit" | "price";

function NumCell({ value, onValue, label, className = "", row, col, onKey, money }: { value: number; onValue: (n: number) => void; label: string; className?: string; row: number; col: Col; onKey: (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: Col) => void; money?: boolean }) {
  const show = (n: number) => (money ? n.toFixed(2) : String(+Number(n).toFixed(4)));
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(value);
  if (!focused && prev !== value) {
    setPrev(value);
    setText(show(value));
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      data-row={row}
      data-col={col}
      className={`w-full rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-right tabular-nums hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none ${className}`}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseAmount(e.target.value);
        if (n != null) {
          setPrev(n);
          onValue(n);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseAmount(text);
        setText(show(n ?? value));
      }}
      onKeyDown={(e) => onKey(e, row, col)}
    />
  );
}

export default function LineEditor({ lines, onChange, taxes, currency, locale, defaultTaxable, readOnly }: { lines: DocLine[]; onChange: (lines: DocLine[]) => void; taxes: DocTaxRate[]; currency: string; locale: string; defaultTaxable: boolean; readOnly?: boolean }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const money = (n: number) => formatDocMoney(n, currency, locale);

  const focus = (row: number, col: Col = "desc") =>
    requestAnimationFrame(() => {
      const el = box.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`) ?? box.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="desc"]`);
      el?.focus();
    });
  const set = (i: number, patch: Partial<DocLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const insert = (at: number, line: DocLine) => {
    onChange([...lines.slice(0, at), line, ...lines.slice(at)]);
    focus(at);
  };
  const newItem = (): DocLine => ({ id: lineId(), kind: "item", description: "", qty: 1, unit: "each", unitPrice: 0, taxable: defaultTaxable });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    return j;
  };
  const del = (i: number) => {
    onChange(lines.filter((_, j) => j !== i));
    focus(Math.max(0, i - 1));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: Col) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (mod || row === lines.length - 1) insert(row + 1, newItem());
      else focus(row + 1, (lines[row + 1].kind ?? "item") === "section" ? "desc" : col);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const j = move(row, e.key === "ArrowUp" ? -1 : 1);
      if (j != null) focus(j, col);
    } else if (mod && e.key === "Backspace" && !lines[row].description && lines.length > 1) {
      e.preventDefault();
      del(row);
    }
  };

  const toggle = (id: string) => setOpen((s) => new Set(s.has(id) ? [...s].filter((x) => x !== id) : [...s, id]));

  return (
    <div ref={box} className="@container text-sm">
      <div className="hidden grid-cols-[minmax(0,1fr)_72px_64px_100px_40px_100px_96px] gap-1 border-b border-slate-200 px-2 pb-1.5 text-[11px] font-semibold text-slate-500 @3xl:grid">
        <span className="pl-1.5">{t("Description")}</span>
        <span className="pr-1.5 text-right">{t("Qty")}</span>
        <span className="pl-1.5">{t("Unit")}</span>
        <span className="pr-1.5 text-right">{t("Price")}</span>
        <span className="text-center" title={t("Taxable")}>
          {t("Tax")}
        </span>
        <span className="pr-1.5 text-right">{t("Amount")}</span>
        <span />
      </div>
      {lines.length === 0 && <p className="px-2 py-6 text-center text-slate-500">{t("No lines yet. Add an item or a section heading.")}</p>}
      {lines.map((l, i) => {
        const section = (l.kind ?? "item") === "section";
        const a = lineAmounts(l);
        const item = l.description || t("line");
        const actions = !readOnly && (
          <div className="flex items-center justify-end gap-0.5 text-slate-400">
            <button type="button" className="btn btn-sm btn-icon btn-ghost" aria-label={t("Move up: {item}", { item })} title={t("Move up (Alt+↑)")} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp />
            </button>
            <button type="button" className="btn btn-sm btn-icon btn-ghost" aria-label={t("Move down: {item}", { item })} title={t("Move down (Alt+↓)")} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </button>
            <button type="button" className="btn btn-sm btn-icon btn-ghost hover:text-red-600" aria-label={t("Delete: {item}", { item })} title={t("Delete line")} onClick={() => del(i)}>
              <Trash />
            </button>
          </div>
        );
        if (section)
          return (
            <div key={l.id} className="mt-2 flex items-center gap-2 border-b border-slate-100 px-2 py-1.5">
              <Heading className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                aria-label={t("Section heading")}
                data-row={i}
                data-col="desc"
                readOnly={readOnly}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-xs font-bold tracking-wider uppercase hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none"
                placeholder={t("Section heading (e.g. 1st Floor)")}
                value={l.description}
                onChange={(e) => set(i, { description: e.target.value })}
                onKeyDown={(e) => onKey(e, i, "desc")}
              />
              {actions}
            </div>
          );
        const more = open.has(l.id);
        return (
          <div key={l.id} className={`border-b border-slate-100 px-2 py-1.5 ${l.optional ? "bg-amber-50/40" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 @3xl:grid-cols-[minmax(0,1fr)_72px_64px_100px_40px_100px_96px]">
              <div className="col-span-2 flex min-w-0 items-center gap-1 @3xl:col-span-1">
                <button type="button" className={`btn btn-sm btn-icon btn-ghost shrink-0 text-slate-400 ${more ? "rotate-180" : ""}`} aria-label={t("More for: {item}", { item })} aria-expanded={more} title={t("Details, SKU, discount, optional")} onClick={() => toggle(l.id)}>
                  <ChevronDown />
                </button>
                <input
                  aria-label={t("Description")}
                  data-row={i}
                  data-col="desc"
                  readOnly={readOnly}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 font-medium hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none"
                  placeholder={t("Item or service")}
                  value={l.description}
                  onChange={(e) => set(i, { description: e.target.value })}
                  onKeyDown={(e) => onKey(e, i, "desc")}
                />
              </div>
              <div className="col-span-2 grid grid-cols-[64px_56px_minmax(0,1fr)_36px_minmax(0,1fr)] items-center gap-1 @3xl:contents">
                <NumCell label={t("Quantity: {item}", { item })} value={l.qty} onValue={(n) => set(i, { qty: n })} row={i} col="qty" onKey={onKey} />
                <input
                  aria-label={t("Unit: {item}", { item })}
                  data-row={i}
                  data-col="unit"
                  readOnly={readOnly}
                  className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-slate-600 hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none"
                  value={l.unit ?? ""}
                  placeholder="each"
                  onChange={(e) => set(i, { unit: e.target.value })}
                  onKeyDown={(e) => onKey(e, i, "unit")}
                />
                <NumCell money label={t("Unit price: {item}", { item })} value={l.unitPrice} onValue={(n) => set(i, { unitPrice: n })} row={i} col="price" onKey={onKey} />
                <label className="tap flex justify-center" title={taxes.length ? t("Taxable") : t("Taxable (add a tax rate below)")}>
                  <input type="checkbox" className="h-4 w-4 accent-brand-600 pointer-coarse:h-5 pointer-coarse:w-5" aria-label={t("Taxable: {item}", { item })} disabled={readOnly} checked={l.taxable} onChange={(e) => set(i, { taxable: e.target.checked })} />
                </label>
                <div className={`pr-1.5 text-right font-medium tabular-nums ${l.optional ? "text-slate-400" : ""}`}>
                  {money(a.net)}
                  {a.discount ? <div className="text-[11px] font-normal text-emerald-700">−{money(a.discount)}</div> : null}
                </div>
                <div className="hidden @3xl:block">{actions}</div>
              </div>
            </div>
            {l.details && !more ? <p className="truncate pl-10 text-xs text-slate-500">{l.details}</p> : null}
            {more && (
              <div className="mt-1.5 grid gap-2 rounded-lg bg-slate-50 p-2.5 sm:ml-9 sm:grid-cols-2">
                <label className="text-xs sm:col-span-2">
                  <span className="label">{t("Details (second line)")}</span>
                  <textarea className="input min-h-14 text-sm" readOnly={readOnly} value={l.details ?? ""} placeholder={t("Rooms, model, what's included…")} onChange={(e) => set(i, { details: e.target.value })} />
                </label>
                <label className="text-xs">
                  <span className="label">{t("Item code / SKU")}</span>
                  <input className="input" readOnly={readOnly} value={l.sku ?? ""} onChange={(e) => set(i, { sku: e.target.value || null })} />
                </label>
                <div className="text-xs">
                  <span className="label">{t("Line discount")}</span>
                  <div className="flex gap-1.5">
                    <input
                      className="input w-24 text-right"
                      inputMode="decimal"
                      aria-label={t("Line discount")}
                      readOnly={readOnly}
                      defaultValue={l.discount?.value ? String(l.discount.value) : ""}
                      placeholder="0"
                      onBlur={(e) => {
                        const n = parseAmount(e.target.value);
                        set(i, { discount: n ? { type: l.discount?.type ?? "pct", value: n } : null });
                      }}
                    />
                    <select className="input w-20" aria-label={t("Line discount type")} disabled={readOnly} value={l.discount?.type ?? "pct"} onChange={(e) => set(i, { discount: { type: e.target.value as "pct" | "fixed", value: l.discount?.value ?? 0 } })}>
                      <option value="pct">%</option>
                      <option value="fixed">{currency}</option>
                    </select>
                  </div>
                </div>
                {taxes.length > 1 && l.taxable && (
                  <div className="text-xs sm:col-span-2">
                    <span className="label">{t("Taxes on this line")}</span>
                    <div className="flex flex-wrap gap-3">
                      {taxes.map((tx) => {
                        const on = !l.taxIds || l.taxIds.includes(tx.id);
                        return (
                          <label key={tx.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              className="accent-brand-600"
                              disabled={readOnly}
                              checked={on}
                              onChange={(e) => {
                                const cur = l.taxIds ?? taxes.map((x) => x.id);
                                const next = e.target.checked ? [...cur, tx.id] : cur.filter((x) => x !== tx.id);
                                set(i, { taxIds: next.length === taxes.length ? null : next });
                              }}
                            />
                            {tx.name} ({fmtPct(tx.rate)}%)
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="accent-brand-600" disabled={readOnly} checked={!!l.optional} onChange={(e) => set(i, { optional: e.target.checked })} />
                  {t("Optional — show it, but don’t count it in the total")}
                </label>
                <div className="@3xl:hidden">{actions}</div>
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-2 pt-3">
          <button type="button" className="btn btn-sm" onClick={() => insert(lines.length, newItem())}>
            <Plus /> {t("Add item")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => insert(lines.length, { id: lineId(), kind: "section", description: "", qty: 0, unitPrice: 0, taxable: false })}>
            <Heading /> {t("Add section")}
          </button>
          <span className="ml-auto hidden text-xs text-slate-400 lg:inline">{t("Enter: next line · ⌘/Ctrl+Enter: insert · Alt+↑↓: move")}</span>
        </div>
      )}
    </div>
  );
}
