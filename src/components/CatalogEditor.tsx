"use client";
import { Archive, ArchiveArrowUp, Download, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { applyPriceList, catalogToCsv, type PriceImportResult } from "@/lib/catalogCsv";
import { downloadText } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { categoryOf, MOUNTS, WIRE_TYPES } from "@/lib/catalog";
import { allCategoriesFor, hasTrade, tradeCategories, tradeWireTypes, typeVisible } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { getCatalog, newId, nowIso, put, putMany } from "@/lib/db";
import { toast } from "@/lib/toast";
import type { Category, DeviceType, Mount, Shape, Unit } from "@/lib/types";
import SymbolIcon from "./editor/SymbolIcon";
import Modal from "./ui/Modal";
import { DEVICE_ICONS } from "@/lib/deviceIcons";
import { iconFor } from "@/lib/symbols";
import { createElement } from "react";

/** A device pictogram as inline SVG (for pickers). */
function IconSvg({ name, size = 18 }: { name: string; size?: number }) {
  const icon = DEVICE_ICONS[name];
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icon.node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

const SHAPES: Shape[] = ["circle", "square", "triangle", "diamond", "hexagon", "star"];

/** Price input that commits on blur/Enter. */
function PriceInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-500">$</span>
      <input
        aria-label={label}
        className={`input h-9 w-28 pl-6 text-right tabular-nums ${value === 0 ? "text-slate-500" : ""}`}
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const n = Number(v.replace(/[$,]/g, ""));
          if (Number.isFinite(n) && n !== value) onCommit(Math.max(0, n));
          else setV(String(value));
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

export default function CatalogEditor() {
  const [types, setTypes] = useState<DeviceType[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<DeviceType | null>(null);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<PriceImportResult | null>(null);
  // Sections follow the company's trades; items from trade packs it doesn't use are tucked away (never deleted).
  const trades = useTrades();
  const [otherTrades, setOtherTrades] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    getCatalog().then(setTypes);
    // A trade's starting catalog was added (Settings → Trades).
    const reload = () => void getCatalog().then(setTypes);
    window.addEventListener("pinplan:catalog", reload);
    return () => window.removeEventListener("pinplan:catalog", reload);
  }, []);

  async function save(t: DeviceType, quiet = false) {
    const saved = await put("deviceTypes", t);
    setTypes((ts) => (ts!.some((x) => x.id === t.id) ? ts!.map((x) => (x.id === t.id ? saved : x)) : [...ts!, saved]));
    if (!quiet) toast(`Saved ${t.name}`);
  }

  function newType(category: Category) {
    const cat = categoryOf(category);
    setEditing({
      id: newId(),
      name: "",
      category,
      symbol: "X",
      abbrev: "DEV",
      shape: "circle",
      color: cat.color,
      unit: "each",
      unitPrice: 0,
      laborPrice: 0,
      defaultWire: "Cat6",
      defaultMount: "ceiling",
      kind: "device",
      billduProductId: null,
      sort: (types?.length ?? 0) + 1,
      updatedAt: nowIso(),
    });
  }

  async function onPriceFile(file: File | undefined) {
    if (!file || !types) return;
    const res = applyPriceList(await file.text(), types, { createMissing: true, newId });
    setPreview(res);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function applyPreview() {
    if (!preview) return;
    const rows = [...preview.updated, ...preview.created];
    if (rows.length) await putMany("deviceTypes", rows);
    setTypes(await getCatalog());
    toast(`Price list applied: ${preview.updated.length} updated, ${preview.created.length} added`);
    setPreview(null);
  }

  if (!types) return <p className="p-6 text-slate-500">Loading…</p>;
  const inTrades = (t: DeviceType) => typeVisible({ ...t, archived: false }, trades);
  const hiddenOther = types.filter((t) => !t.archived && !inTrades(t)).length;
  const unpriced = types.filter((t) => !t.archived && t.unitPrice === 0 && inTrades(t)).length;
  const mine = tradeCategories(trades);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Device catalog</h1>
          <p className="mt-1 text-sm text-slate-500">Symbols and prices used on the plan, the takeoff and the estimate. Prices are per unit — each, or per linear foot for LED.</p>
        </div>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search" aria-label="Search device types" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" aria-label="Price list file" onChange={(e) => onPriceFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => downloadText(catalogToCsv(types), "pinplan-price-list.csv")} title="Download the catalog as a CSV price list">
          <Download /> Price list
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Import prices from a CSV (id or name, price, labor)">
          <Upload /> Import prices
        </button>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        {hiddenOther > 0 && (
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600" title="Starting items of trades your company doesn't use (Settings → Trades)">
            <input type="checkbox" className="accent-brand-600" checked={otherTrades} onChange={(e) => setOtherTrades(e.target.checked)} /> Other trades ({hiddenOther})
          </label>
        )}
      </div>
      {unpriced > 0 && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          {unpriced} device type{unpriced === 1 ? "" : "s"} still at $0. Type the price and labor right in the list — it saves as you go.
        </p>
      )}
      {allCategoriesFor(trades).map((cat) => {
        const rows = types
          .filter((t) => t.category === cat.id && (showArchived || !t.archived) && (otherTrades || inTrades(t) || t.archived) && (!q || t.name.toLowerCase().includes(q.toLowerCase())))
          .sort((a, b) => a.sort - b.sort);
        // The company's own sections always show (to add types); other categories only when they have items.
        if (!rows.length && (q || !mine.some((m) => m.id === cat.id))) return null;
        return (
          <section key={cat.id} className="mb-6">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
              <h2 className="font-semibold">{cat.name}</h2>
              <span className="text-xs text-slate-500">{rows.length}</span>
              <button className="btn btn-sm btn-ghost ml-auto text-brand-600" onClick={() => newType(cat.id)}>
                <Plus /> Add type
              </button>
            </div>
            <div className="card divide-y divide-slate-100">
              <div className="hidden grid-cols-[40px_1fr_70px_120px_120px_140px_80px] items-center gap-3 px-4 py-2 text-[11px] font-semibold text-slate-500 sm:grid">
                <span />
                <span>Device</span>
                <span>Unit</span>
                <span className="text-right">Price</span>
                <span className="text-right">Labor</span>
                <span>Default wire</span>
                <span />
              </div>
              {rows.map((t) => (
                <div key={t.id} className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[40px_1fr_70px_120px_120px_140px_80px] ${t.archived ? "opacity-50" : ""}`}>
                  {t.kind === "led" ? <span className="mx-auto block h-1.5 w-7 rounded" style={{ background: t.color }} /> : <SymbolIcon type={t} size={32} />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {t.abbrev}-1-01 · {t.defaultMount}
                      {t.billduProductId ? ` · Billdu #${t.billduProductId}` : ""}
                    </div>
                  </div>
                  <span className="hidden text-sm text-slate-500 sm:block">{t.unit === "LF" ? "per LF" : "each"}</span>
                  <div className="hidden justify-end sm:flex">
                    <PriceInput key={`p${t.unitPrice}`} label={`${t.name} price`} value={t.unitPrice} onCommit={(n) => save({ ...t, unitPrice: n }, true)} />
                  </div>
                  <div className="hidden justify-end sm:flex">
                    <PriceInput key={`l${t.laborPrice}`} label={`${t.name} labor`} value={t.laborPrice} onCommit={(n) => save({ ...t, laborPrice: n }, true)} />
                  </div>
                  <span className="hidden truncate text-sm text-slate-500 sm:block">{t.defaultWire}</span>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setEditing(t)} title="Edit" aria-label={`Edit ${t.name}`}>
                      <Pencil />
                    </button>
                    <button
                      className="btn btn-sm btn-icon btn-ghost"
                      onClick={() => save({ ...t, archived: !t.archived })}
                      title={t.archived ? "Restore" : "Archive (hide from the device menu)"}
                      aria-label={t.archived ? "Restore" : "Archive"}
                    >
                      {t.archived ? <ArchiveArrowUp /> : <Archive />}
                    </button>
                  </div>
                </div>
              ))}
              {!rows.length && <p className="px-4 py-4 text-sm text-slate-500">No device types.</p>}
            </div>
          </section>
        );
      })}
      {preview && <ImportPreview res={preview} onApply={applyPreview} onCancel={() => setPreview(null)} />}
      {editing && (
        <EditDialog
          t={editing}
          isNew={!types.some((x) => x.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={async (t) => {
            await save(t);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({ t, isNew, onSave, onCancel }: { t: DeviceType; isNew: boolean; onSave: (t: DeviceType) => void; onCancel: () => void }) {
  const [d, setD] = useState(t);
  const trades = useTrades();
  const set = <K extends keyof DeviceType>(k: K, v: DeviceType[K]) => setD({ ...d, [k]: v });
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  return (
    <Modal onClose={onCancel} labelledBy={f("title")}>
      <form
        className="card animate-in grid max-h-[92vh] w-full max-w-lg gap-4 overflow-y-auto p-6 shadow-pop sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (d.name.trim()) onSave({ ...d, name: d.name.trim() });
        }}
      >
        <div className="flex items-center gap-3 sm:col-span-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
            {d.kind === "led" ? <span className="block h-2 w-9 rounded" style={{ background: d.color }} /> : <SymbolIcon type={d} size={44} />}
          </div>
          <div className="flex-1">
            <h2 id={f("title")} className="text-lg font-semibold">
              {isNew ? "New device type" : "Edit device type"}
            </h2>
            <p className="text-xs text-slate-500">Labels look like {d.abbrev || "DEV"}-1-01</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={onCancel} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={f("name")}>
            Name
          </label>
          <input id={f("name")} className="input" autoFocus value={d.name} placeholder="e.g. Doorbell camera" onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={f("category")}>
            Category
          </label>
          <select id={f("category")} className="input" value={d.category} onChange={(e) => set("category", e.target.value as Category)}>
            {allCategoriesFor(trades).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={f("unit")}>
            Measured as
          </label>
          <select id={f("unit")} className="input" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Unit, kind: e.target.value === "LF" ? "led" : "device" })}>
            <option value="each">Each (tap to place)</option>
            <option value="LF">Linear feet (draw a run)</option>
          </select>
        </div>
        {d.kind !== "led" && (
          <div className="sm:col-span-2">
            <span id={f("icon")} className="label">
              Icon
            </span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={f("icon")}>
              {[...Object.keys(DEVICE_ICONS), "letters"].map((k) => {
                const on = (iconFor(d) ?? "letters") === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={k === "letters" ? `Letters (${d.symbol || "?"})` : DEVICE_ICONS[k].label}
                    aria-label={k === "letters" ? "Letters" : DEVICE_ICONS[k].label}
                    onClick={() => set("icon", k)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition ${on ? "text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                    style={on ? { background: d.color } : undefined}
                  >
                    {k === "letters" ? <span className="text-[11px] font-bold">{(d.symbol || "Aa").slice(0, 3)}</span> : <IconSvg name={k} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={f("symbol")}>
              Symbol
            </label>
            <input id={f("symbol")} className="input text-center font-semibold" maxLength={3} value={d.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label" htmlFor={f("abbrev")}>
              Label prefix
            </label>
            <input id={f("abbrev")} className="input" maxLength={6} value={d.abbrev} onChange={(e) => set("abbrev", e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label" htmlFor={f("shape")}>
              Shape
            </label>
            <select id={f("shape")} className="input capitalize" value={d.shape} onChange={(e) => set("shape", e.target.value as Shape)}>
              {SHAPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={f("color")}>
              Color
            </label>
            <input id={f("color")} type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" value={d.color} onChange={(e) => set("color", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={f("price")}>
            Price ({d.unit === "LF" ? "per LF" : "each"})
          </label>
          <input id={f("price")} className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.unitPrice} onChange={(e) => set("unitPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor={f("labor")}>
            Labor ({d.unit === "LF" ? "per LF" : "each"})
          </label>
          <input id={f("labor")} className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.laborPrice} onChange={(e) => set("laborPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor={f("wire")}>
            Default wire
          </label>
          <select id={f("wire")} className="input" value={d.defaultWire} onChange={(e) => set("defaultWire", e.target.value)}>
            {Array.from(new Set([...(hasTrade(trades, "lowvoltage") ? WIRE_TYPES : []), ...tradeWireTypes(trades), "None", d.defaultWire])).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={f("mount")}>
            Default mount
          </label>
          <select id={f("mount")} className="input capitalize" value={d.defaultMount} onChange={(e) => set("defaultMount", e.target.value as Mount)}>
            {MOUNTS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-brand" disabled={!d.name.trim()}>
            {isNew ? "Add device type" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportPreview({ res, onApply, onCancel }: { res: PriceImportResult; onApply: () => void; onCancel: () => void }) {
  const n = res.updated.length + res.created.length;
  const id = useId();
  return (
    <Modal onClose={onCancel} labelledBy={`${id}-title`}>
      <div className="card animate-in w-full max-w-lg space-y-4 p-6 shadow-pop">
        <div className="flex items-start">
          <div className="flex-1">
            <h2 id={`${id}-title`} className="text-lg font-semibold">
              Import prices
            </h2>
            <p className="text-sm text-slate-500">Review the changes before applying them.</p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={onCancel} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Updated", res.updated.length, "text-brand-700"],
            ["New types", res.created.length, "text-emerald-700"],
            ["Skipped", res.unmatched.length + res.errors.length, "text-amber-700"],
          ].map(([label, v, cls]) => (
            <div key={label as string} className="rounded-xl bg-slate-50 py-2 ring-1 ring-slate-100">
              <div className={`text-xl font-semibold tabular-nums ${cls}`}>{v}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        {n > 0 && (
          <ul className="scroll-thin max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
            {[...res.updated, ...res.created].map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {res.created.includes(t) && <span className="chip bg-emerald-50 text-emerald-700">new</span>}
                <span className="tabular-nums text-slate-600">
                  {formatMoney(t.unitPrice)} + {formatMoney(t.laborPrice)} labor
                </span>
              </li>
            ))}
          </ul>
        )}
        {(res.errors.length > 0 || res.unmatched.length > 0) && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            {res.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
            {res.unmatched.length > 0 && <div>Not matched (add a valid category to create them): {res.unmatched.join(", ")}</div>}
          </div>
        )}
        <p className="text-xs text-slate-500">Columns: id or name, price, labor (optional: category, unit, default_wire). Download the price list for a ready-made template.</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-brand" disabled={!n} onClick={onApply}>
            Apply {n} change{n === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
