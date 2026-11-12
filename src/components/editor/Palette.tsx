"use client";
import { CATEGORIES, CLOSET_KINDS } from "@/lib/catalog";
import { useEditor, type Tool } from "@/lib/store";
import SymbolIcon from "./SymbolIcon";

export default function Palette() {
  const { catalog, tool, setTool, markers, runs, activeSheetId } = useEditor();
  const active = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);
  const countOnSheet = (id: string) => markers.filter((m) => m.sheetId === activeSheetId && m.deviceTypeId === id).length;
  const lfOnSheet = (id: string) =>
    runs.filter((r) => r.sheetId === activeSheetId && r.deviceTypeId === id).length;

  const item = (t: Tool, key: string, icon: React.ReactNode, name: string, badge?: string | number) => (
    <button
      key={key}
      onClick={() => setTool(active(t) ? { kind: "select" } : t)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
        active(t) ? "bg-sky-100 ring-2 ring-sky-500" : "hover:bg-slate-100"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {badge ? <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{badge}</span> : null}
    </button>
  );

  return (
    <div className="space-y-3 p-2">
      {CATEGORIES.map((cat) => {
        const types = catalog.filter((d) => d.category === cat.id && !d.archived);
        const closets = cat.id === "infrastructure" ? CLOSET_KINDS : [];
        if (!types.length && !closets.length) return null;
        return (
          <section key={cat.id}>
            <h3 className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
              {cat.name}
            </h3>
            {types.map((d) =>
              d.kind === "led"
                ? d.id === "led-stair"
                  ? item({ kind: "stair" }, d.id, <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol} />, `${d.name} (steps × LF)`, lfOnSheet(d.id))
                  : item({ kind: "led", deviceTypeId: d.id }, d.id, <LineIcon color={d.color} />, `${d.name} (draw run)`, lfOnSheet(d.id))
                : item({ kind: "place", deviceTypeId: d.id }, d.id, <SymbolIcon shape={d.shape} color={d.color} symbol={d.symbol} />, d.name, countOnSheet(d.id)),
            )}
            {closets.map((c) =>
              item(
                { kind: "closet", closetKind: c.id },
                c.id,
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: c.color }}>
                  {c.abbrev}
                </span>,
                c.name,
              ),
            )}
          </section>
        );
      })}
      <section>
        <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Wiring</h3>
        {item({ kind: "wire" }, "wire", <LineIcon color="#2563eb" dashed />, "Wire run (device → closet)")}
      </section>
    </div>
  );
}

function LineIcon({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <path d="M4 22 L12 10 L24 8" stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}
