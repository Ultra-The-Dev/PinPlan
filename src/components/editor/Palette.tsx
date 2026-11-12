"use client";
import { ChevronDown, Search, Spline, X } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, CLOSET_KINDS } from "@/lib/catalog";
import { useEditor, type Tool } from "@/lib/store";
import SymbolIcon from "./SymbolIcon";

export default function Palette() {
  const { catalog, tool, setTool, markers, runs, activeSheetId } = useEditor();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const active = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);
  const countOnSheet = (id: string) => markers.filter((m) => m.sheetId === activeSheetId && m.deviceTypeId === id).length;
  const runsOnSheet = (id: string) => runs.filter((r) => r.sheetId === activeSheetId && r.deviceTypeId === id).length;
  const match = (name: string) => !q || name.toLowerCase().includes(q.toLowerCase());

  const item = (t: Tool, key: string, icon: React.ReactNode, name: string, hint?: string, badge?: number) => (
    <button
      key={key}
      onClick={() => setTool(active(t) ? { kind: "select" } : t)}
      className={`group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition ${
        active(t) ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {hint && <span className="block truncate text-[11px] text-slate-400">{hint}</span>}
      </span>
      {badge ? <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${active(t) ? "bg-brand-100" : "bg-slate-100 text-slate-500"}`}>{badge}</span> : null}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input h-9 pl-8" placeholder="Find a device…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700" onClick={() => setQ("")} aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {CATEGORIES.map((cat) => {
          const types = catalog.filter((d) => d.category === cat.id && !d.archived && match(d.name));
          const closets = cat.id === "infrastructure" ? CLOSET_KINDS.filter((c) => match(c.name)) : [];
          if (!types.length && !closets.length) return null;
          const isCollapsed = collapsed.includes(cat.id) && !q;
          return (
            <section key={cat.id}>
              <button
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left"
                onClick={() => setCollapsed((c) => (c.includes(cat.id) ? c.filter((x) => x !== cat.id) : [...c, cat.id]))}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                <span className="section-title flex-1">{cat.name}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {types.map((d) =>
                    d.kind === "led"
                      ? d.id === "led-stair"
                        ? item({ kind: "stair" }, d.id, <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol} />, d.name, "steps × LF per step", runsOnSheet(d.id))
                        : item({ kind: "led", deviceTypeId: d.id }, d.id, <LineIcon color={d.color} />, d.name.replace("LED strip — ", "LED · "), "draw run · LF", runsOnSheet(d.id))
                      : item({ kind: "place", deviceTypeId: d.id }, d.id, <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol} />, d.name, undefined, countOnSheet(d.id)),
                  )}
                  {closets.map((c) =>
                    item(
                      { kind: "closet", closetKind: c.id },
                      c.id,
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ background: c.color }}>
                        {c.abbrev}
                      </span>,
                      c.name,
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })}
        {match("wire run") && (
          <section>
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <span className="section-title">Wiring</span>
            </div>
            {item({ kind: "wire" }, "wire", <span className="flex h-7 w-7 items-center justify-center text-blue-600"><Spline className="h-5 w-5" /></span>, "Wire run", "device → closet")}
          </section>
        )}
      </div>
    </div>
  );
}

function LineIcon({ color }: { color: string }) {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <path d="M4 21 L11 11 L24 8" stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
