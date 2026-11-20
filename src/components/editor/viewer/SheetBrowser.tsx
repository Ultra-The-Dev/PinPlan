"use client";
// Sheet browser: every sheet of the job as a thumbnail (from the cached pyramid), with search and recently viewed.
// A side drawer on tablets and desktops, full screen on phones. "Manage sheets" (office) opens the Sheets drawer
// (upload, rename, reorder, scale) without leaving the plan.
import { Clock, FileText, Search, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSheetThumb } from "@/lib/tiles/tileClient";
import type { Sheet } from "@/lib/types";

export default function SheetBrowser(props: {
  sheets: Sheet[];
  activeId: string;
  recent: string[];
  /** Devices per sheet. */
  counts: Record<string, number>;
  full: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Office: open the Sheets drawer. */
  onManage?: () => void;
}) {
  const t = useT();
  const { sheets, activeId } = props;
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const query = q.trim().toLowerCase();
  const list = useMemo(() => sheets.map((s, i) => ({ s, i })).filter(({ s, i }) => !query || s.name.toLowerCase().includes(query) || String(i + 1) === query || `page ${s.pageNumber}`.includes(query)), [sheets, query]);
  const recent = props.recent.filter((id) => id !== activeId && sheets.some((s) => s.id === id)).slice(0, 4);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
    // Type to search straight away on a keyboard; phones don't get a keyboard popping up.
    if (!props.full) searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[aria-modal='true']") && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!props.full && <div className="absolute inset-0 z-30 bg-slate-900/15" onClick={props.onClose} data-plan-ui />}
      <aside
        className={`animate-in absolute z-40 flex flex-col bg-white shadow-pop ${props.full ? "inset-0" : "inset-y-0 left-0 w-[min(400px,92vw)] border-r border-slate-200"}`}
        data-plan-ui
        aria-label={t("Sheets")}
        data-testid="sheet-browser"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 pt-3 pb-2.5">
          <h2 className="flex-1 text-base font-semibold text-slate-900">
            {t("Sheets")} <span className="font-normal text-slate-400 tabular-nums">{sheets.length}</span>
          </h2>
          {props.onManage && (
            <button className="btn btn-sm btn-ghost h-9" onClick={props.onManage} data-testid="manage-sheets">
              <Settings2 /> {t("Manage sheets")}
            </button>
          )}
          <button className="btn btn-sm btn-icon btn-ghost h-9 w-9" onClick={props.onClose} aria-label={t("Close sheets")}>
            <X />
          </button>
        </div>
        <div className="px-3 pt-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} className="input h-10 pl-8" placeholder={t("Find a sheet by name or number")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Find a sheet")} />
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4">
          {!query && recent.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5" /> {t("Recently viewed")}
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recent.map((id) => {
                  const i = sheets.findIndex((s) => s.id === id);
                  return <RecentCard key={id} sheet={sheets[i]} index={i} onPick={() => props.onPick(id)} />;
                })}
              </div>
            </section>
          )}
          <ul className={`grid gap-2.5 ${props.full ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
            {list.map(({ s, i }) => (
              <li key={s.id}>
                <button
                  ref={s.id === activeId ? activeRef : undefined}
                  className={`group block w-full overflow-hidden rounded-xl text-left ring-1 transition ${s.id === activeId ? "ring-2 ring-brand-500" : "ring-slate-200 hover:ring-slate-300"}`}
                  onClick={() => props.onPick(s.id)}
                  aria-current={s.id === activeId ? "page" : undefined}
                  aria-label={t("Sheet {n}: {name}", { n: i + 1, name: s.name })}
                >
                  <Thumb sheet={s} className="aspect-[4/3]" />
                  <span className="flex items-start gap-2 border-t border-slate-100 bg-white p-2">
                    <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums ${s.id === activeId ? "bg-brand-600 text-white" : "bg-ink text-white"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] leading-tight font-semibold text-slate-900">{s.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {props.counts[s.id]
                          ? s.pxPerFt
                            ? t.tn("{n} device", "{n} devices", props.counts[s.id])
                            : t.tn("{n} device, no scale", "{n} devices, no scale", props.counts[s.id])
                          : s.pxPerFt
                            ? t("No devices yet")
                            : t("No devices yet, no scale")}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!list.length && (
            <p className="py-10 text-center text-sm text-slate-500">
              {t("No sheet matches “{q}”.", { q: q.trim() })}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

function Thumb({ sheet, className = "" }: { sheet: Sheet; className?: string }) {
  const url = useSheetThumb(sheet.imageId);
  return (
    <span className={`relative flex items-center justify-center overflow-hidden bg-[#efece7] ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-contain p-1.5" draggable={false} />
      ) : (
        <FileText className="h-6 w-6 text-slate-300" />
      )}
    </span>
  );
}

function RecentCard({ sheet, index, onPick }: { sheet: Sheet; index: number; onPick: () => void }) {
  const t = useT();
  return (
    <button className="w-28 shrink-0 overflow-hidden rounded-lg text-left ring-1 ring-slate-200 hover:ring-slate-300" onClick={onPick} aria-label={t("Recent: sheet {n}, {name}", { n: index + 1, name: sheet.name })}>
      <Thumb sheet={sheet} className="aspect-[4/3]" />
      <span className="block truncate border-t border-slate-100 px-1.5 py-1 text-[11px] font-medium text-slate-700">
        <span className="tabular-nums text-slate-400">{index + 1}</span> {sheet.name}
      </span>
    </button>
  );
}
