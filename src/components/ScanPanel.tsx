"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { scanSheet } from "@/lib/scan";
import { prettyFloorName } from "@/lib/scanParse";
import { useEditor } from "@/lib/store";
import { setSuggestionType, suggestionsFromScan, useSuggestions } from "@/lib/suggestions";

/**
 * "Scan this sheet" panel: sends the sheet to Claude's vision API, shows the results as ghost
 * suggestions, and lets the user accept / reject them individually or in bulk.
 * Counts never change until a suggestion is accepted.
 */
export default function ScanPanel({ sheetId }: { sheetId: string }) {
  const project = useEditor((s) => s.project);
  const sheet = useEditor((s) => s.sheets.find((x) => x.id === sheetId));
  const catalog = useEditor((s) => s.catalog);
  const { items, selectedIds, projectId } = useSuggestions();
  const [busy, setBusy] = useState<null | "scan" | "title" | "accept">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.6);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (project && projectId !== project.id) void useSuggestions.getState().load(project.id);
  }, [project, projectId]);

  const mine = useMemo(() => items.filter((i) => i.sheetId === sheetId).sort((a, b) => b.confidence - a.confidence), [items, sheetId]);
  const selected = mine.filter((i) => selectedIds.includes(i.id));
  const aboveThreshold = mine.filter((i) => i.confidence >= threshold && (i.kind === "led" || i.deviceTypeId));
  const typeName = (id?: string | null) => catalog.find((d) => d.id === id)?.name ?? "Unassigned";
  const pointTypes = catalog.filter((d) => d.kind === "device" && !d.archived);

  if (!sheet || !project) return null;

  async function runScan() {
    if (!sheet || !project) return;
    if (mine.length && !confirm("Replace the current suggestions for this sheet with a new scan?")) return;
    setBusy("scan");
    setError(null);
    setInfo(null);
    abort.current = new AbortController();
    try {
      const r = await scanSheet(sheet, catalog, "full", abort.current.signal);
      const rows = suggestionsFromScan(project.id, sheet.id, r);
      await useSuggestions.getState().replaceForSheet(sheet.id, rows);
      setInfo(
        `Found ${r.symbols.length} symbol${r.symbols.length === 1 ? "" : "s"} and ${r.ledCallouts.length} LED callout${r.ledCallouts.length === 1 ? "" : "s"}${r.floorName ? ` on "${r.floorName}"` : ""}. Review them on the plan.`,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function detectName() {
    if (!sheet) return;
    setBusy("title");
    setError(null);
    try {
      const r = await scanSheet(sheet, catalog, "title");
      const name = prettyFloorName(r.floorName);
      if (!name) setInfo("No floor name found in the title block.");
      else if (name !== sheet.name && confirm(`Rename "${sheet.name}" to "${name}"?`)) await useEditor.getState().updateSheet(sheet.id, { name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function accept(ids: string[]) {
    if (!ids.length) return;
    setBusy("accept");
    try {
      const n = await useSuggestions.getState().accept(ids);
      const skipped = ids.length - n;
      setInfo(`Accepted ${n}.${skipped ? ` ${skipped} skipped — pick a device type first.` : ""}`);
    } finally {
      setBusy(null);
    }
  }

  const btn = "btn btn-sm";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button className={`${btn} btn-brand`} disabled={!!busy} onClick={runScan}>
          {busy === "scan" ? "Scanning…" : "Scan this sheet"}
        </button>
        <button className={`${btn}`} disabled={!!busy} onClick={detectName}>
          {busy === "title" ? "Reading…" : "Detect sheet name"}
        </button>
        {busy === "scan" && (
          <button className={`${btn} btn-ghost`} onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        AI suggestions appear as dashed ghosts. They are not counted in the takeoff, estimate or Billdu until you accept them. Drag a
        ghost to fix its position; tap to select it.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{info}</p>}

      {mine.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-xs text-slate-600">Confidence ≥ {Math.round(threshold * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="flex-1" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white`} disabled={!!busy || !aboveThreshold.length} onClick={() => accept(aboveThreshold.map((i) => i.id))}>
              Accept {aboveThreshold.length} ≥ threshold
            </button>
            <button className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-800`} disabled={!!busy || !selected.length} onClick={() => accept(selected.map((i) => i.id))}>
              Accept selected ({selected.length})
            </button>
            <button className={`${btn} btn-danger`} disabled={!!busy || !selected.length} onClick={() => useSuggestions.getState().reject(selected.map((i) => i.id))}>
              Reject selected
            </button>
            <button
              className={`${btn} btn-ghost text-red-700`}
              disabled={!!busy}
              onClick={() => confirm(`Reject all ${mine.length} suggestions on this sheet?`) && useSuggestions.getState().reject(mine.map((i) => i.id))}
            >
              Reject all
            </button>
            <button
              className={`${btn} btn-ghost`}
              onClick={() => useSuggestions.getState().setSelected(selected.length === mine.length ? [] : mine.map((i) => i.id))}
            >
              {selected.length === mine.length ? "Select none" : "Select all"}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">
            {mine.map((s) => (
              <li key={s.id} className={`flex items-center gap-2 px-2 py-1.5 ${selectedIds.includes(s.id) ? "bg-brand-50" : ""}`}>
                <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => useSuggestions.getState().toggleSelect(s.id)} />
                <span className="w-10 text-right tabular-nums text-xs text-slate-500">{Math.round(s.confidence * 100)}%</span>
                {s.kind === "led" ? (
                  <span className="flex-1">
                    LED zone {s.zone || "?"} · {s.lf != null ? `${s.lf} LF` : "LF ?"}
                    {s.switchLabel ? ` · ${s.switchLabel}` : ""}
                  </span>
                ) : (
                  <>
                    <span className="w-8 font-mono text-xs text-slate-500">{s.symbolText || "—"}</span>
                    <select
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
                      value={s.deviceTypeId ?? ""}
                      onChange={(e) => setSuggestionType(s.id, e.target.value)}
                      title={typeName(s.deviceTypeId)}
                    >
                      <option value="">Pick a device…</option>
                      {pointTypes.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button className="px-1 text-emerald-700" title="Accept" disabled={!!busy} onClick={() => accept([s.id])}>
                  ✓
                </button>
                <button className="px-1 text-red-600" title="Reject" onClick={() => useSuggestions.getState().reject([s.id])}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
