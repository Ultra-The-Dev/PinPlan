"use client";
import { useEffect, useState } from "react";
import { CATEGORIES, MOUNTS, WIRE_TYPES } from "@/lib/catalog";
import { getCatalog, newId, nowIso, put } from "@/lib/db";
import type { Category, DeviceType, Mount, Shape, Unit } from "@/lib/types";
import SymbolIcon from "./editor/SymbolIcon";

const SHAPES: Shape[] = ["circle", "square", "triangle", "diamond", "hexagon", "star"];

export default function CatalogEditor() {
  const [types, setTypes] = useState<DeviceType[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    getCatalog().then(setTypes);
  }, []);

  async function save(t: DeviceType) {
    const saved = await put("deviceTypes", t);
    setTypes((ts) => ts!.map((x) => (x.id === t.id ? saved : x)));
  }

  async function add(category: Category) {
    const cat = CATEGORIES.find((c) => c.id === category)!;
    const t: DeviceType = {
      id: newId(),
      name: "New device",
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
    };
    await put("deviceTypes", t);
    setTypes((ts) => [...ts!, t]);
  }

  if (!types) return <p className="p-6 text-slate-500">Loading…</p>;
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Device catalog</h1>
        <p className="text-sm text-slate-500">Symbols, colors and prices used for placing, the takeoff and the estimate. Prices are per unit (each or per LF).</p>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      {CATEGORIES.map((cat) => {
        const rows = types.filter((t) => t.category === cat.id && (showArchived || !t.archived)).sort((a, b) => a.sort - b.sort);
        return (
          <section key={cat.id} className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: cat.color }} />
              <h2 className="font-semibold">{cat.name}</h2>
              <button className="btn btn-sm ml-2" onClick={() => add(cat.id)}>
                + Add
              </button>
            </div>
            <div className="card overflow-x-auto">
              <table className="tbl min-w-[1000px]">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Symbol</th>
                    <th>Label</th>
                    <th>Shape</th>
                    <th>Color</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>Labor</th>
                    <th>Default wire</th>
                    <th>Mount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <Row key={t.id} t={t} onSave={save} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({ t, onSave }: { t: DeviceType; onSave: (t: DeviceType) => void }) {
  const [d, setD] = useState(t);
  const strip = (x: DeviceType) => JSON.stringify({ ...x, updatedAt: "" });
  const dirty = strip(d) !== strip(t);
  const set = <K extends keyof DeviceType>(k: K, v: DeviceType[K]) => setD({ ...d, [k]: v });
  const commit = () => dirty && onSave(d);
  const inp = "w-full rounded border border-slate-300 px-1.5 py-1 text-sm";
  return (
    <tr className={t.archived ? "opacity-50" : ""} onBlur={commit}>
      <td>
        {d.kind === "led" ? <span className="block h-1.5 w-7 rounded" style={{ background: d.color }} /> : <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol} />}
      </td>
      <td className="min-w-48">
        <input className={inp} value={d.name} onChange={(e) => set("name", e.target.value)} />
      </td>
      <td className="w-16">
        <input className={inp} maxLength={3} value={d.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
      </td>
      <td className="w-20">
        <input className={inp} maxLength={6} value={d.abbrev} onChange={(e) => set("abbrev", e.target.value.toUpperCase())} />
      </td>
      <td>
        <select className={inp} value={d.shape} onChange={(e) => set("shape", e.target.value as Shape)}>
          {SHAPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </td>
      <td>
        <input type="color" className="h-8 w-10 cursor-pointer rounded border border-slate-300" value={d.color} onChange={(e) => set("color", e.target.value)} />
      </td>
      <td>
        <select
          className={inp}
          value={d.unit}
          onChange={(e) => {
            const unit = e.target.value as Unit;
            setD({ ...d, unit, kind: unit === "LF" ? "led" : "device" });
          }}
        >
          <option value="each">each</option>
          <option value="LF">LF (drawn run)</option>
        </select>
      </td>
      <td className="w-24">
        <input className={inp} type="number" min={0} step="0.01" inputMode="decimal" value={d.unitPrice} onChange={(e) => set("unitPrice", Number(e.target.value) || 0)} />
      </td>
      <td className="w-24">
        <input className={inp} type="number" min={0} step="0.01" inputMode="decimal" value={d.laborPrice} onChange={(e) => set("laborPrice", Number(e.target.value) || 0)} />
      </td>
      <td>
        <select className={inp} value={d.defaultWire} onChange={(e) => set("defaultWire", e.target.value)}>
          {Array.from(new Set([...WIRE_TYPES, d.defaultWire])).map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </td>
      <td>
        <select className={inp} value={d.defaultMount} onChange={(e) => set("defaultMount", e.target.value as Mount)}>
          {MOUNTS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </td>
      <td className="whitespace-nowrap">
        {dirty && (
          <button className="btn btn-sm btn-primary mr-1" onClick={commit}>
            Save
          </button>
        )}
        <button className="btn btn-sm" onClick={() => onSave({ ...d, archived: !d.archived })}>
          {d.archived ? "Restore" : "Archive"}
        </button>
        {t.billduProductId ? <span className="ml-1 text-xs text-slate-500">Billdu #{t.billduProductId}</span> : null}
      </td>
    </tr>
  );
}
