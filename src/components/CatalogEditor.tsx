"use client";
import { Archive, ArchiveArrowUp, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORIES, MOUNTS, WIRE_TYPES } from "@/lib/catalog";
import { getCatalog, newId, nowIso, put } from "@/lib/db";
import { toast } from "@/lib/toast";
import type { Category, DeviceType, Mount, Shape, Unit } from "@/lib/types";
import SymbolIcon from "./editor/SymbolIcon";

const SHAPES: Shape[] = ["circle", "square", "triangle", "diamond", "hexagon", "star"];

/** Price input that commits on blur/Enter. */
function PriceInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">$</span>
      <input
        aria-label={label}
        className={`input h-9 w-28 pl-6 text-right tabular-nums ${value === 0 ? "text-slate-400" : ""}`}
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
  useEffect(() => {
    getCatalog().then(setTypes);
  }, []);

  async function save(t: DeviceType, quiet = false) {
    const saved = await put("deviceTypes", t);
    setTypes((ts) => (ts!.some((x) => x.id === t.id) ? ts!.map((x) => (x.id === t.id ? saved : x)) : [...ts!, saved]));
    if (!quiet) toast(`Saved ${t.name}`);
  }

  function newType(category: Category) {
    const cat = CATEGORIES.find((c) => c.id === category)!;
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

  if (!types) return <p className="p-6 text-slate-500">Loading…</p>;
  const unpriced = types.filter((t) => !t.archived && t.unitPrice === 0).length;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Device catalog</h1>
          <p className="mt-1 text-sm text-slate-500">Symbols and prices used on the plan, the takeoff and the estimate. Prices are per unit — each, or per linear foot for LED.</p>
        </div>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      {unpriced > 0 && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          {unpriced} device type{unpriced === 1 ? "" : "s"} still at $0. Type the price and labor right in the list — it saves as you go.
        </p>
      )}
      {CATEGORIES.map((cat) => {
        const rows = types
          .filter((t) => t.category === cat.id && (showArchived || !t.archived) && (!q || t.name.toLowerCase().includes(q.toLowerCase())))
          .sort((a, b) => a.sort - b.sort);
        if (!rows.length && q) return null;
        return (
          <section key={cat.id} className="mb-6">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
              <h2 className="font-semibold">{cat.name}</h2>
              <span className="text-xs text-slate-400">{rows.length}</span>
              <button className="btn btn-sm btn-ghost ml-auto text-brand-600" onClick={() => newType(cat.id)}>
                <Plus /> Add type
              </button>
            </div>
            <div className="card divide-y divide-slate-100">
              <div className="hidden grid-cols-[40px_1fr_70px_120px_120px_140px_80px] items-center gap-3 px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase sm:grid">
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
                  {t.kind === "led" ? <span className="mx-auto block h-1.5 w-7 rounded" style={{ background: t.color }} /> : <SymbolIcon shape={t.shape} color={t.color} symbol={t.symbol} size={32} />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs text-slate-400">
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
              {!rows.length && <p className="px-4 py-4 text-sm text-slate-400">No device types.</p>}
            </div>
          </section>
        );
      })}
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
  const set = <K extends keyof DeviceType>(k: K, v: DeviceType[K]) => setD({ ...d, [k]: v });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center" onClick={onCancel}>
      <form
        className="card animate-in grid w-full max-w-lg gap-4 p-6 shadow-pop sm:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (d.name.trim()) onSave({ ...d, name: d.name.trim() });
        }}
      >
        <div className="flex items-center gap-3 sm:col-span-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            {d.kind === "led" ? <span className="block h-2 w-9 rounded" style={{ background: d.color }} /> : <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol || "?"} size={44} />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{isNew ? "New device type" : "Edit device type"}</h2>
            <p className="text-xs text-slate-500">Labels look like {d.abbrev || "DEV"}-1-01</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={onCancel} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="input" autoFocus value={d.name} placeholder="e.g. Doorbell camera" onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={d.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Measured as</label>
          <select className="input" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Unit, kind: e.target.value === "LF" ? "led" : "device" })}>
            <option value="each">Each (tap to place)</option>
            <option value="LF">Linear feet (draw a run)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Symbol</label>
            <input className="input text-center font-semibold" maxLength={3} value={d.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Label prefix</label>
            <input className="input" maxLength={6} value={d.abbrev} onChange={(e) => set("abbrev", e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label">Shape</label>
            <select className="input capitalize" value={d.shape} onChange={(e) => set("shape", e.target.value as Shape)}>
              {SHAPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Color</label>
            <input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" value={d.color} onChange={(e) => set("color", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Price ({d.unit === "LF" ? "per LF" : "each"})</label>
          <input className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.unitPrice} onChange={(e) => set("unitPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label">Labor ({d.unit === "LF" ? "per LF" : "each"})</label>
          <input className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={d.laborPrice} onChange={(e) => set("laborPrice", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label">Default wire</label>
          <select className="input" value={d.defaultWire} onChange={(e) => set("defaultWire", e.target.value)}>
            {Array.from(new Set([...WIRE_TYPES, d.defaultWire])).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Default mount</label>
          <select className="input capitalize" value={d.defaultMount} onChange={(e) => set("defaultMount", e.target.value as Mount)}>
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
    </div>
  );
}
