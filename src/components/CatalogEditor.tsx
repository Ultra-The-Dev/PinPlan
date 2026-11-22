"use client";
import { Archive, ArchiveArrowUp, Download, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { applyPriceList, catalogToCsv, type PriceImportResult } from "@/lib/catalogCsv";
import { downloadText } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { categoryOf, MOUNT_LABELS, MOUNTS, OPENING_TYPE_IDS, WIRE_TYPES } from "@/lib/catalog";
import { allCategoriesFor, hasTrade, tradeCategories, tradeWireTypes, typeVisible } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { getCatalog, newId, nowIso, put, putMany } from "@/lib/db";
import { msg, useT } from "@/lib/i18n";
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

const SHAPE_LABELS: Record<Shape, string> = {
  circle: msg("Circle"),
  square: msg("Square"),
  triangle: msg("Triangle"),
  diamond: msg("Diamond"),
  hexagon: msg("Hexagon"),
  star: msg("Star"),
};

export default function CatalogEditor() {
  const t = useT();
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

  async function save(dt: DeviceType, quiet = false) {
    const saved = await put("deviceTypes", dt);
    setTypes((ts) => (ts!.some((x) => x.id === dt.id) ? ts!.map((x) => (x.id === dt.id ? saved : x)) : [...ts!, saved]));
    if (!quiet) toast(t("Saved {name}", { name: dt.name }));
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
    toast(t("Price list applied: {updated} updated, {added} added", { updated: preview.updated.length, added: preview.created.length }));
    setPreview(null);
  }

  if (!types) return <p className="p-6 text-slate-500">{t("Loading…")}</p>;
  const inTrades = (dt: DeviceType) => typeVisible({ ...dt, archived: false }, trades);
  const hiddenOther = types.filter((dt) => !dt.archived && !inTrades(dt)).length;
  // Door and Window are reference counts: they stay off quotes until they have a price, so $0 is fine.
  const unpriced = types.filter((dt) => !dt.archived && dt.unitPrice === 0 && inTrades(dt) && !OPENING_TYPE_IDS.includes(dt.id)).length;
  const mine = tradeCategories(trades);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{t("Price list")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Symbols and prices used on the plan, the takeoff and the estimate. Prices are per unit — each, or per linear foot for LED.")}</p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t("Search")} aria-label={t("Search device types")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" aria-label={t("Price list file")} onChange={(e) => onPriceFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => downloadText(catalogToCsv(types), "pinplan-price-list.csv")} title={t("Download the catalog as a CSV price list")}>
          <Download /> {t("Price list")}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title={t("Import prices from a CSV (id or name, price, labor)")}>
          <Upload /> {t("Import prices")}
        </button>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t("Show archived")}
        </label>
        {hiddenOther > 0 && (
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600" title={t("Starting items of trades your company doesn't use (Settings → Trades)")}>
            <input type="checkbox" className="accent-brand-600" checked={otherTrades} onChange={(e) => setOtherTrades(e.target.checked)} /> {t("Other trades ({n})", { n: hiddenOther })}
          </label>
        )}
      </div>
      {unpriced > 0 && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          {t.tn("{n} device type still at $0.", "{n} device types still at $0.", unpriced)} {t("Type the price and labor right in the list — it saves as you go.")}
        </p>
      )}
      {allCategoriesFor(trades).map((cat) => {
        const rows = types
          .filter((dt) => dt.category === cat.id && (showArchived || !dt.archived) && (otherTrades || inTrades(dt) || dt.archived) && (!q || dt.name.toLowerCase().includes(q.toLowerCase())))
          .sort((a, b) => a.sort - b.sort);
        // The company's own sections always show (to add types); other categories only when they have items.
        if (!rows.length && (q || !mine.some((m) => m.id === cat.id))) return null;
        return (
          <section key={cat.id} className="mb-6">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
              <h2 className="font-semibold">{t(cat.name)}</h2>
              <span className="text-xs text-slate-500">{rows.length}</span>
              <button className="btn btn-sm btn-ghost ml-auto text-brand-600" onClick={() => newType(cat.id)}>
                <Plus /> {t("Add type")}
              </button>
            </div>
            <div className="card divide-y divide-slate-100">
              <div className="hidden grid-cols-[40px_1fr_70px_120px_120px_140px_80px] items-center gap-3 px-4 py-2 text-[11px] font-semibold text-slate-500 sm:grid">
                <span />
                <span>{t("Device")}</span>
                <span>{t("Unit")}</span>
                <span className="text-right">{t("Price")}</span>
                <span className="text-right">{t("Labor")}</span>
                <span>{t("Default wire")}</span>
                <span />
              </div>
              {rows.map((dt) => (
                <div key={dt.id} className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[40px_1fr_70px_120px_120px_140px_80px] ${dt.archived ? "opacity-50" : ""}`}>
                  {dt.kind === "led" ? <span className="mx-auto block h-1.5 w-7 rounded" style={{ background: dt.color }} /> : <SymbolIcon type={dt} size={32} />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{dt.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {dt.abbrev}-1-01 · {MOUNT_LABELS[dt.defaultMount] ? t(MOUNT_LABELS[dt.defaultMount]) : dt.defaultMount}
                      {dt.billduProductId ? ` · Billdu #${dt.billduProductId}` : ""}
                    </div>
                  </div>
                  <span className="hidden text-sm text-slate-500 sm:block">{dt.unit === "LF" ? t("per LF") : t("each")}</span>
                  <div className="hidden justify-end sm:flex">
                    <PriceInput key={`p${dt.unitPrice}`} label={t("{name} price", { name: dt.name })} value={dt.unitPrice} onCommit={(n) => save({ ...dt, unitPrice: n }, true)} />
                  </div>
                  <div className="hidden justify-end sm:flex">
                    <PriceInput key={`l${dt.laborPrice}`} label={t("{name} labor", { name: dt.name })} value={dt.laborPrice} onCommit={(n) => save({ ...dt, laborPrice: n }, true)} />
                  </div>
                  <span className="hidden truncate text-sm text-slate-500 sm:block">{dt.defaultWire}</span>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setEditing(dt)} title={t("Edit")} aria-label={t("Edit {name}", { name: dt.name })}>
                      <Pencil />
                    </button>
                    <button
                      className="btn btn-sm btn-icon btn-ghost"
                      onClick={() => save({ ...dt, archived: !dt.archived })}
                      title={dt.archived ? t("Restore") : t("Archive (hide from the device menu)")}
                      aria-label={dt.archived ? t("Restore") : t("Archive")}
                    >
                      {dt.archived ? <ArchiveArrowUp /> : <Archive />}
                    </button>
                  </div>
                </div>
              ))}
              {!rows.length && <p className="px-4 py-4 text-sm text-slate-500">{t("No device types.")}</p>}
            </div>
          </section>
        );
      })}
      {preview && <ImportPreview res={preview} onApply={applyPreview} onCancel={() => setPreview(null)} />}
      {editing && (
        <EditDialog
          type={editing}
          isNew={!types.some((x) => x.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={async (dt) => {
            await save(dt);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({ type, isNew, onSave, onCancel }: { type: DeviceType; isNew: boolean; onSave: (dt: DeviceType) => void; onCancel: () => void }) {
  const t = useT();
  const [d, setD] = useState(type);
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
              {isNew ? t("New device type") : t("Edit device type")}
            </h2>
            <p className="text-xs text-slate-500">{t("Labels look like {example}", { example: `${d.abbrev || "DEV"}-1-01` })}</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={onCancel} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={f("name")}>
            {t("Name")}
          </label>
          <input id={f("name")} className="input" autoFocus value={d.name} placeholder={t("e.g. Doorbell camera")} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={f("category")}>
            {t("Category")}
          </label>
          <select id={f("category")} className="input" value={d.category} onChange={(e) => set("category", e.target.value as Category)}>
            {allCategoriesFor(trades).map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={f("unit")}>
            {t("Measured as")}
          </label>
          <select id={f("unit")} className="input" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Unit, kind: e.target.value === "LF" ? "led" : "device" })}>
            <option value="each">{t("Each (tap to place)")}</option>
            <option value="LF">{t("Linear feet (draw a run)")}</option>
          </select>
        </div>
        {d.kind !== "led" && (
          <div className="sm:col-span-2">
            <span id={f("icon")} className="label">
              {t("Icon")}
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
                    title={k === "letters" ? t("Letters ({symbol})", { symbol: d.symbol || "?" }) : t(DEVICE_ICONS[k].label)}
                    aria-label={k === "letters" ? t("Letters") : t(DEVICE_ICONS[k].label)}
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
              {t("Symbol")}
            </label>
            <input id={f("symbol")} className="input text-center font-semibold" maxLength={3} value={d.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label" htmlFor={f("abbrev")}>
              {t("Label prefix")}
            </label>
            <input id={f("abbrev")} className="input" maxLength={6} value={d.abbrev} onChange={(e) => set("abbrev", e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label" htmlFor={f("shape")}>
              {t("Shape")}
            </label>
            <select id={f("shape")} className="input" value={d.shape} onChange={(e) => set("shape", e.target.value as Shape)}>
              {SHAPES.map((s) => (
                <option key={s} value={s}>
                  {t(SHAPE_LABELS[s])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={f("color")}>
              {t("Color")}
            </label>
            <input id={f("color")} type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" value={d.color} onChange={(e) => set("color", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={f("price")}>
            {d.unit === "LF" ? t("Price (per LF)") : t("Price (each)")}
          </label>
          <input id={f("price")} className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.unitPrice} onChange={(e) => set("unitPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor={f("labor")}>
            {d.unit === "LF" ? t("Labor (per LF)") : t("Labor (each)")}
          </label>
          <input id={f("labor")} className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.laborPrice} onChange={(e) => set("laborPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor={f("wire")}>
            {t("Default wire")}
          </label>
          <select id={f("wire")} className="input" value={d.defaultWire} onChange={(e) => set("defaultWire", e.target.value)}>
            {Array.from(new Set([...(hasTrade(trades, "lowvoltage") ? WIRE_TYPES : []), ...tradeWireTypes(trades), "None", d.defaultWire])).map((w) => (
              <option key={w} value={w}>
                {w === "None" ? t("None") : w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={f("mount")}>
            {t("Default mount")}
          </label>
          <select id={f("mount")} className="input" value={d.defaultMount} onChange={(e) => set("defaultMount", e.target.value as Mount)}>
            {MOUNTS.map((m) => (
              <option key={m} value={m}>
                {MOUNT_LABELS[m] ? t(MOUNT_LABELS[m]) : m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
          <button type="button" className="btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={!d.name.trim()}>
            {isNew ? t("Add device type") : t("Save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportPreview({ res, onApply, onCancel }: { res: PriceImportResult; onApply: () => void; onCancel: () => void }) {
  const t = useT();
  const n = res.updated.length + res.created.length;
  const id = useId();
  return (
    <Modal onClose={onCancel} labelledBy={`${id}-title`}>
      <div className="card animate-in w-full max-w-lg space-y-4 p-6 shadow-pop">
        <div className="flex items-start">
          <div className="flex-1">
            <h2 id={`${id}-title`} className="text-lg font-semibold">
              {t("Import prices")}
            </h2>
            <p className="text-sm text-slate-500">{t("Review the changes before applying them.")}</p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={onCancel} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [t("Updated"), res.updated.length, "text-brand-700"],
            [t("New types"), res.created.length, "text-emerald-700"],
            [t("Skipped"), res.unmatched.length + res.errors.length, "text-amber-700"],
          ].map(([label, v, cls]) => (
            <div key={label as string} className="rounded-xl bg-slate-50 py-2 ring-1 ring-slate-100">
              <div className={`text-xl font-semibold tabular-nums ${cls}`}>{v}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        {n > 0 && (
          <ul className="scroll-thin max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
            {[...res.updated, ...res.created].map((dt) => (
              <li key={dt.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{dt.name}</span>
                {res.created.includes(dt) && <span className="chip bg-emerald-50 text-emerald-700">{t("new")}</span>}
                <span className="tabular-nums text-slate-600">
                  {t("{price} + {labor} labor", { price: formatMoney(dt.unitPrice), labor: formatMoney(dt.laborPrice) })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(res.errors.length > 0 || res.unmatched.length > 0) && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            {res.errors.map((e) => (
              <div key={e}>{t(e)}</div>
            ))}
            {res.unmatched.length > 0 && <div>{t("Not matched (add a valid category to create them): {items}", { items: res.unmatched.join(", ") })}</div>}
          </div>
        )}
        <p className="text-xs text-slate-500">{t("Columns: id or name, price, labor (optional: category, unit, default_wire). Download the price list for a ready-made template.")}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={!n} onClick={onApply}>
            {t.tn("Apply {n} change", "Apply {n} changes", n)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
