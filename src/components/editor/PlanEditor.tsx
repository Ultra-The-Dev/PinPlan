"use client";
import { useEffect, useMemo, useState } from "react";
import { CLOSET_KINDS, LAYERS } from "@/lib/catalog";
import { parseFeet, parseScale, polylineFt, polylinePx } from "@/lib/geometry";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import Dialog, { type DialogField } from "../Dialog";
import ScanPanel from "../ScanPanel";
import Inspector from "./Inspector";
import Palette from "./Palette";
import PlanCanvas, { type CanvasHit } from "./PlanCanvas";

type Pending =
  | { kind: "calibrate"; points: number[] }
  | { kind: "scale" }
  | { kind: "led"; points: number[]; deviceTypeId: string }
  | { kind: "stair"; points: number[] }
  | null;

export default function PlanEditor() {
  const st = useEditor();
  const { sheets, activeSheetId, setActiveSheet, tool, setTool, selection, undo, redo, past, future, hiddenLayers, toggleLayer, setOnlyLayer } = st;
  const sheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  // The draft (points being drawn) belongs to the current tool + sheet; switching either discards it.
  const draftKey = `${JSON.stringify(tool)}|${activeSheetId}`;
  const [draftState, setDraftState] = useState<{ key: string; pts: number[]; snap: { markerId?: string; closetId?: string } }>({ key: "", pts: [], snap: {} });
  const cur = draftState.key === draftKey ? draftState : { key: draftKey, pts: [] as number[], snap: {} };
  const draft = cur.pts;
  const draftSnap = cur.snap;
  const setDraft = (u: number[] | ((d: number[]) => number[])) =>
    setDraftState((prev) => {
      const base = prev.key === draftKey ? prev : { key: draftKey, pts: [], snap: {} };
      return { ...base, pts: typeof u === "function" ? u(base.pts) : u };
    });
  const setDraftSnap = (u: (d: { markerId?: string; closetId?: string }) => { markerId?: string; closetId?: string }) =>
    setDraftState((prev) => {
      const base = prev.key === draftKey ? prev : { key: draftKey, pts: [], snap: {} };
      return { ...base, snap: u(base.snap) };
    });
  const [pending, setPending] = useState<Pending>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [panel, setPanel] = useState<"counts" | "scan" | null>("counts");
  const [layersOpen, setLayersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSheetId && sheets[0]) setActiveSheet(sheets[0].id);
  }, [activeSheetId, sheets, setActiveSheet]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Keyboard shortcuts (laptop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        if (draft.length) setDraft([]);
        else setTool({ kind: "select" });
      } else if (e.key === "Enter") {
        finishDraft();
      } else if ((e.key === "Delete" || e.key === "Backspace") && useEditor.getState().selection) {
        e.preventDefault();
        useEditor.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const takeoff = useMemo(() => computeTakeoff({ sheets: st.sheets, markers: st.markers, runs: st.runs, closets: st.closets }), [st.sheets, st.markers, st.runs, st.closets]);
  const floor = takeoff.floors.find((f) => f.sheetId === sheet?.id);

  if (!sheet) return null;

  async function onTapImage(x: number, y: number, hit: CanvasHit) {
    const s = useEditor.getState();
    switch (tool.kind) {
      case "place":
        await s.addMarker(tool.deviceTypeId, x, y);
        break;
      case "closet": {
        const c = await s.addCloset(tool.closetKind, x, y);
        setTool({ kind: "select" });
        if (c) s.select({ table: "closets", id: c.id });
        break;
      }
      case "led":
        setDraft((d) => [...d, x, y]);
        break;
      case "wire": {
        let px = x;
        let py = y;
        if (draft.length === 0 && hit.markerId) {
          const m = s.markers.find((mm) => mm.id === hit.markerId)!;
          px = m.x;
          py = m.y;
          setDraftSnap((d) => ({ ...d, markerId: m.id }));
        } else if (draft.length > 0 && hit.closetId) {
          const c = s.closets.find((cc) => cc.id === hit.closetId)!;
          px = c.x;
          py = c.y;
          setDraftSnap((d) => ({ ...d, closetId: c.id }));
          setDraft((d) => [...d, px, py]);
          // Reaching a closet finishes the run.
          setTimeout(() => finishDraft([...draft, px, py], { ...draftSnap, closetId: c.id }), 0);
          return;
        }
        setDraft((d) => [...d, px, py]);
        break;
      }
      case "stair":
      case "calibrate": {
        const pts = [...draft, x, y];
        if (pts.length >= 4) {
          setDraft([]);
          setPending(tool.kind === "stair" ? { kind: "stair", points: pts } : { kind: "calibrate", points: pts });
        } else setDraft(pts);
        break;
      }
    }
  }

  function dedupe(points: number[]) {
    const out: number[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
      const n = out.length;
      if (n && Math.hypot(out[n - 2] - points[i], out[n - 1] - points[i + 1]) < 0.002) continue;
      out.push(points[i], points[i + 1]);
    }
    return out;
  }

  async function finishDraft(points = draft, snap = draftSnap) {
    const pts = dedupe(points);
    const s = useEditor.getState();
    if (pts.length < 4) {
      if (tool.kind === "led" || tool.kind === "wire") setToast("Tap at least two points");
      return;
    }
    if (tool.kind === "led") {
      setPending({ kind: "led", points: pts, deviceTypeId: tool.deviceTypeId });
      setDraft([]);
    } else if (tool.kind === "wire") {
      const marker = s.markers.find((m) => m.id === snap.markerId);
      const r = await s.addRun({
        kind: "wire",
        points: pts,
        wireType: marker?.wireType ?? "Cat6",
        markerId: snap.markerId ?? null,
        closetId: snap.closetId ?? null,
        tentative: marker?.tentative ?? false,
      });
      if (marker && snap.closetId && marker.closetId !== snap.closetId) await s.updateMarker(marker.id, { closetId: snap.closetId });
      setDraft([]);
      setDraftSnap(() => ({}));
      if (r) setToast(`Wire run added${r.measuredFt != null ? ` · ${r.measuredFt.toFixed(1)} ft` : ""}`);
    }
  }

  const ledMeasured = pending?.kind === "led" ? polylineFt(pending.points, sheet) : null;
  const typesById = new Map(st.catalog.map((d) => [d.id, d]));
  const nextZone = () => {
    const zs = st.runs.filter((r) => r.sheetId === sheet.id && r.kind !== "wire").map((r) => parseInt(r.zone ?? "", 10)).filter(Number.isFinite);
    return String((zs.length ? Math.max(...zs) : 0) + 1);
  };

  let dialog: { title: string; description?: string; fields: DialogField[]; submit: (v: Record<string, string>) => Promise<string | void> } | null = null;
  if (pending?.kind === "calibrate") {
    const px = polylinePx(pending.points, sheet.width, sheet.height);
    dialog = {
      title: "Set scale",
      description: "How long is the line you just drew, in real life?",
      fields: [{ name: "len", label: "Real length", placeholder: `e.g. 12'6" or 12.5`, inputMode: "text" }],
      submit: async (v) => {
        const ft = parseFeet(v.len);
        if (!ft) return "Enter a length like 12'6\" or 12.5";
        await st.updateSheet(sheet.id, { pxPerFt: px / ft, scaleLabel: `line ${v.len.trim()}` });
        setTool({ kind: "select" });
        setToast(`Scale set: ${(px / ft).toFixed(1)} px/ft`);
      },
    };
  } else if (pending?.kind === "scale") {
    dialog = {
      title: "Plan scale",
      description: sheet.pxPerInch
        ? "Type the scale printed on the sheet. Or use “Draw a line” to calibrate on a known dimension."
        : "This sheet came from a photo, so the paper size is unknown — calibrate by drawing a line over a known dimension.",
      fields: sheet.pxPerInch ? [{ name: "scale", label: "Scale", placeholder: `1/4" = 1'-0"`, initial: sheet.scaleLabel?.startsWith("line") ? "" : (sheet.scaleLabel ?? "") }] : [],
      submit: async (v) => {
        if (!sheet.pxPerInch) {
          setTool({ kind: "calibrate" });
          return;
        }
        const inPerFt = parseScale(v.scale ?? "");
        if (!inPerFt) return `Enter a scale like 1/4" = 1'-0" or 1:48`;
        await st.updateSheet(sheet.id, { pxPerFt: inPerFt * sheet.pxPerInch, scaleLabel: v.scale.trim() });
        setToast("Scale set");
      },
    };
  } else if (pending?.kind === "led") {
    const t = typesById.get(pending.deviceTypeId);
    dialog = {
      title: t?.name ?? "LED run",
      description: ledMeasured != null ? `Measured ${ledMeasured.toFixed(1)} LF from the scale. Type the plan's LF to override.` : "No scale on this sheet — type the LF from the plan callout.",
      fields: [
        { name: "zone", label: "Zone #", initial: nextZone(), inputMode: "numeric" },
        { name: "switch", label: "Switch label", placeholder: "S21" },
        { name: "lf", label: "LF (optional if measured)", placeholder: ledMeasured != null ? ledMeasured.toFixed(1) : "e.g. 24", inputMode: "decimal" },
      ],
      submit: async (v) => {
        const typed = v.lf.trim() ? parseFeet(v.lf) : null;
        if (v.lf.trim() && typed == null) return "LF must be a number";
        const r = await st.addRun({ kind: "led", deviceTypeId: pending.deviceTypeId, points: pending.points, typedFt: typed, zone: v.zone.trim(), switchLabel: v.switch.trim() });
        if (r) setToast(`LED zone ${v.zone} added`);
      },
    };
  } else if (pending?.kind === "stair") {
    dialog = {
      title: "Stair-step LED",
      description: "Total LF = number of steps × LF per step.",
      fields: [
        { name: "steps", label: "Number of steps", inputMode: "numeric", placeholder: "14" },
        { name: "lfPerStep", label: "LF per step", inputMode: "decimal", placeholder: "3.5" },
        { name: "zone", label: "Zone #", initial: nextZone(), inputMode: "numeric" },
        { name: "switch", label: "Switch label", placeholder: "S5" },
      ],
      submit: async (v) => {
        const steps = parseInt(v.steps, 10);
        const per = parseFeet(v.lfPerStep);
        if (!steps || !per) return "Enter the steps and LF per step";
        await st.addRun({ kind: "stair", deviceTypeId: "led-stair", points: pending.points, steps, lfPerStep: per, zone: v.zone.trim(), switchLabel: v.switch.trim() });
        setToast(`Stair LED: ${steps} × ${per} = ${(steps * per).toFixed(1)} LF`);
      },
    };
  }

  const drawing = tool.kind === "led" || tool.kind === "wire" || tool.kind === "stair" || tool.kind === "calibrate";
  const hint =
    tool.kind === "place"
      ? `Tap the plan to place: ${typesById.get(tool.deviceTypeId)?.name}`
      : tool.kind === "closet"
        ? `Tap to place the ${CLOSET_KINDS.find((c) => c.id === tool.closetKind)?.name.toLowerCase()}`
        : tool.kind === "led"
          ? "Tap points along the LED run, then Finish (or double-tap)"
          : tool.kind === "wire"
            ? "Tap a device, then the path, then a closet"
            : tool.kind === "stair"
              ? "Tap the bottom and top of the stair"
              : tool.kind === "calibrate"
                ? "Tap both ends of a known dimension"
                : null;

  return (
    <div className="flex h-full">
      {/* Palette */}
      <aside className={`${paletteOpen ? "w-60" : "w-0"} shrink-0 overflow-y-auto border-r border-slate-200 bg-white transition-all`}>
        {paletteOpen && <Palette />}
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Sheet tabs + toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
          <button className="btn btn-sm" onClick={() => setPaletteOpen((o) => !o)} aria-label="Toggle device menu">
            {paletteOpen ? "◧" : "☰ Devices"}
          </button>
          <div className="flex gap-1 overflow-x-auto">
            {sheets.map((s) => (
              <button key={s.id} className={`tab whitespace-nowrap ${s.id === sheet.id ? "tab-active" : ""}`} onClick={() => setActiveSheet(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button className={`btn btn-sm ${tool.kind === "select" ? "ring-2 ring-sky-500" : ""}`} onClick={() => setTool({ kind: "select" })}>
            ✋ Select
          </button>
          <button className="btn btn-sm" disabled={!past.length} onClick={undo} aria-label="Undo">
            ↶
          </button>
          <button className="btn btn-sm" disabled={!future.length} onClick={redo} aria-label="Redo">
            ↷
          </button>
          <button className="btn btn-sm" onClick={() => setPending({ kind: "scale" })}>
            📏 Scale
          </button>
          <button className={`btn btn-sm ${tool.kind === "calibrate" ? "ring-2 ring-sky-500" : ""}`} onClick={() => setTool({ kind: "calibrate" })}>
            Draw scale line
          </button>
          <div className="relative">
            <button className="btn btn-sm" onClick={() => setLayersOpen((o) => !o)}>
              Layers{hiddenLayers.length ? ` (${LAYERS.length - hiddenLayers.length})` : ""}
            </button>
            {layersOpen && (
              <div className="card absolute right-0 top-9 z-20 w-56 space-y-1 p-2">
                {LAYERS.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-sm">
                    <label className="flex flex-1 items-center gap-2">
                      <input type="checkbox" checked={!hiddenLayers.includes(l.id)} onChange={() => toggleLayer(l.id)} />
                      {l.name}
                    </label>
                    <button className="text-xs text-sky-700" onClick={() => setOnlyLayer(l.id)}>
                      only
                    </button>
                  </div>
                ))}
                <button className="btn btn-sm w-full" onClick={() => setOnlyLayer(null)}>
                  Show all
                </button>
              </div>
            )}
          </div>
          <button className={`btn btn-sm ${showLabels ? "ring-2 ring-sky-500" : ""}`} onClick={() => setShowLabels((v) => !v)}>
            Labels
          </button>
          <button className="btn btn-sm" onClick={() => setFitKey((k) => k + 1)}>
            Fit
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              const n = await useEditor.getState().autoHomeRuns(sheet.id);
              setToast(n ? `Drew ${n} home runs` : useEditor.getState().closets.length ? "No wired devices on this sheet" : "Place an equipment closet first");
            }}
          >
            Auto home runs
          </button>
          <button className={`btn btn-sm ${panel === "scan" ? "ring-2 ring-sky-500" : ""}`} onClick={() => setPanel(panel === "scan" ? "counts" : "scan")}>
            ✨ AI scan
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <PlanCanvas sheet={sheet} draft={draft} fitKey={fitKey} showLabels={showLabels} onTapImage={onTapImage} onDoubleTap={() => drawing && finishDraft()} />
          {hint && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1 text-sm text-white shadow">
              {hint}
            </div>
          )}
          {(tool.kind === "led" || tool.kind === "wire") && (
            <div className="absolute left-1/2 top-11 flex -translate-x-1/2 gap-2">
              <button className="btn btn-sm" onClick={() => setDraft((d) => d.slice(0, -2))} disabled={!draft.length}>
                Undo point
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => finishDraft()} disabled={draft.length < 4}>
                Finish
              </button>
              <button className="btn btn-sm" onClick={() => setDraft([])}>
                Cancel
              </button>
            </div>
          )}
          {toast && <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white shadow">{toast}</div>}
        </div>
      </div>

      {/* Right panel */}
      {(selection || panel) && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          {selection ? (
            <Inspector />
          ) : panel === "scan" ? (
            <ScanPanel sheetId={sheet.id} />
          ) : (
            floor && (
              <div className="p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">{floor.name} — counts</h3>
                  <button className="text-xs text-slate-500" onClick={() => setPanel(null)}>
                    hide
                  </button>
                </div>
                <table className="tbl">
                  <tbody>
                    {Object.entries(floor.counts).map(([id, n]) => (
                      <tr key={id}>
                        <td>{typesById.get(id)?.name ?? id}</td>
                        <td className="text-right font-semibold">
                          {n}
                          {floor.tentative[id] ? <span className="ml-1 text-xs font-normal text-amber-700">({floor.tentative[id]}?)</span> : null}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>LED zones</td>
                      <td className="text-right font-semibold">{floor.ledZones}</td>
                    </tr>
                    <tr>
                      <td>LED total</td>
                      <td className="text-right font-semibold">{floor.ledTotalFt} LF</td>
                    </tr>
                    {Object.entries(floor.wireFt).map(([w, ft]) => (
                      <tr key={w}>
                        <td>{w} cable</td>
                        <td className="text-right">{ft} ft</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {floor.unmeasuredRuns > 0 && <p className="mt-2 text-xs text-amber-700">{floor.unmeasuredRuns} run(s) have no length yet — set the scale or type LF.</p>}
                {!Object.keys(floor.counts).length && <p className="mt-2 text-slate-500">Pick a device on the left, then tap the plan.</p>}
              </div>
            )
          )}
        </aside>
      )}
      {!selection && !panel && (
        <button className="btn btn-sm absolute right-2 top-28 z-10" onClick={() => setPanel("counts")}>
          Counts
        </button>
      )}

      {dialog && (
        <Dialog
          title={dialog.title}
          description={dialog.description}
          fields={dialog.fields}
          error={dialogError}
          submitLabel={pending?.kind === "scale" && !sheet.pxPerInch ? "Draw a line" : "Save"}
          onCancel={() => {
            setPending(null);
            setDialogError(null);
          }}
          onSubmit={async (v) => {
            const err = await dialog!.submit(v);
            if (err) setDialogError(err);
            else {
              setPending(null);
              setDialogError(null);
            }
          }}
        />
      )}
    </div>
  );
}
