"use client";
import {
  Cable,
  ChevronDown,
  Hand,
  Layers,
  ListChecks,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Ruler,
  RulerDimensionLine,
  Search,
  Sparkles,
  Tag,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { useMedia, WIDE_EDITOR } from "@/lib/useMedia";
import { CLOSET_KINDS, LAYERS } from "@/lib/catalog";
import { parseFeet, parseScale, polylineFt, polylinePx } from "@/lib/geometry";

function formatFeetInches(ft: number) {
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) {
    f += 1;
    i = 0;
  }
  return `${f}'-${i}" (${ft.toFixed(1)} ft)`;
}
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
  const wide = useMedia(WIDE_EDITOR);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [panel, setPanel] = useState<"counts" | "scan" | null>(() => (typeof window !== "undefined" && window.matchMedia(WIDE_EDITOR).matches ? "counts" : null));
  const [layersOpen, setLayersOpen] = useState(false);
  const [find, setFind] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSheetId && sheets[0]) setActiveSheet(sheets[0].id);
  }, [activeSheetId, sheets, setActiveSheet]);

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
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "v") {
        setTool({ kind: "select" });
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "f") {
        setFitKey((k) => k + 1);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "m") {
        setTool({ kind: "measure" });
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "l") {
        setShowLabels((v) => !v);
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

  // On narrow screens the device menu overlays the plan: close it once a tool is picked.
  const toolKey = JSON.stringify(tool);
  const [lastToolKey, setLastToolKey] = useState(toolKey);
  if (toolKey !== lastToolKey) {
    setLastToolKey(toolKey);
    if (!wide && tool.kind !== "select" && paletteOpen) setPaletteOpen(false);
  }

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
      case "measure": {
        const pts = draft.length >= 4 ? [x, y] : [...draft, x, y];
        setDraft(pts);
        if (pts.length === 4) {
          const ft = polylineFt(pts, sheet);
          if (ft == null) toast("Set the sheet scale to measure distances", "info");
          else toast(`Distance: ${formatFeetInches(ft)}`, "info");
        }
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
      if (tool.kind === "led" || tool.kind === "wire") toast("Tap at least two points", "info");
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
      if (r) toast(`Wire run added${r.measuredFt != null ? ` · ${r.measuredFt.toFixed(1)} ft` : ""}`);
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
        toast(`Scale set: ${(px / ft).toFixed(1)} px/ft`);
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
        toast("Scale set");
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
        if (r) toast(`LED zone ${v.zone} added`);
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
        toast(`Stair LED: ${steps} × ${per} = ${(steps * per).toFixed(1)} LF`);
      },
    };
  }

  const drawing = tool.kind === "led" || tool.kind === "wire" || tool.kind === "stair" || tool.kind === "calibrate";
  const hint =
    tool.kind === "place"
      ? `Tap to place ${typesById.get(tool.deviceTypeId)?.name}${st.room.trim() ? ` · ${st.room.trim()}` : ""}`
      : tool.kind === "closet"
        ? `Tap to place the ${CLOSET_KINDS.find((c) => c.id === tool.closetKind)?.name.toLowerCase()}`
        : tool.kind === "led"
          ? "Tap along the LED run · double-tap or Finish"
          : tool.kind === "wire"
            ? "Tap a device, the path, then a closet"
            : tool.kind === "stair"
              ? "Tap the bottom and top of the stair"
              : tool.kind === "calibrate"
                ? "Tap both ends of a known dimension"
                : tool.kind === "measure"
                  ? draft.length === 4 && polylineFt(draft, sheet) != null
                    ? `${formatFeetInches(polylineFt(draft, sheet)!)} · tap to measure again`
                    : sheet.pxPerFt
                      ? "Tap two points to measure"
                      : "Set the scale first to measure"
                  : null;

  const floorCounts = floor ? Object.entries(floor.counts) : [];
  const q = find.trim().toLowerCase();
  const findResults = q ? st.markers.filter((m) => m.label.toLowerCase().includes(q) || m.room.toLowerCase().includes(q)).slice(0, 50) : [];
  const rightPanel = selection ? "inspect" : panel;

  return (
    <div className="relative flex h-full bg-slate-100">
      {/* Device menu */}
      {!wide && paletteOpen && <div className="absolute inset-0 z-20 bg-slate-900/20" onClick={() => setPaletteOpen(false)} />}
      <aside
        className={`${paletteOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${
          wide ? "" : "absolute inset-y-0 left-0 z-30 shadow-pop"
        }`}
      >
        <div className="h-full w-64">
          <Palette />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-2">
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setPaletteOpen((o) => !o)} title={paletteOpen ? "Hide device menu" : "Show device menu"}>
            {paletteOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
          <div className="min-w-0 truncate pl-1 text-sm font-semibold text-slate-800">{sheet.name}</div>
          <div className="flex-1" />
          <button className={`btn btn-sm ${tool.kind === "select" ? "btn-on" : ""}`} onClick={() => setTool({ kind: "select" })} title="Select / move (V or Esc)">
            <Hand />
            <span className="hidden 2xl:inline">Select</span>
          </button>
          <button className="btn btn-sm btn-icon" disabled={!past.length} onClick={undo} title="Undo (⌘Z)" aria-label="Undo">
            <Undo2 />
          </button>
          <button className="btn btn-sm btn-icon" disabled={!future.length} onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo">
            <Redo2 />
          </button>
          <span className="toolbar-sep" />
          <button className={`btn btn-sm ${tool.kind === "calibrate" ? "btn-on" : sheet.pxPerFt ? "" : "border-amber-300 bg-amber-50 text-amber-800"}`} onClick={() => setPending({ kind: "scale" })} title="Set the sheet scale">
            <Ruler />
            <span className="hidden 2xl:inline">{sheet.pxPerFt ? "Scale" : "Set scale"}</span>
          </button>
          <button className={`btn btn-sm btn-icon ${tool.kind === "measure" ? "btn-on" : ""}`} onClick={() => setTool(tool.kind === "measure" ? { kind: "select" } : { kind: "measure" })} title="Measure a distance (M)" aria-label="Measure">
            <RulerDimensionLine />
          </button>
          <div className="relative">
            <button className={`btn btn-sm ${hiddenLayers.length ? "btn-on" : ""}`} onClick={() => setLayersOpen((o) => !o)} title="Show / hide trades">
              <Layers />
              <span className="hidden 2xl:inline">Layers</span>
              {hiddenLayers.length ? <span className="text-[11px]">{LAYERS.length - hiddenLayers.length}/{LAYERS.length}</span> : null}
            </button>
            {layersOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setLayersOpen(false)} />
                <div className="card animate-in absolute top-10 right-0 z-30 w-60 p-2 shadow-pop">
                  <div className="section-title px-2 pt-1 pb-2">Layers</div>
                  {LAYERS.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" className="accent-brand-600" checked={!hiddenLayers.includes(l.id)} onChange={() => toggleLayer(l.id)} />
                        {l.name}
                      </label>
                      <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setOnlyLayer(l.id)}>
                        Only
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-sm mt-1 w-full" onClick={() => setOnlyLayer(null)}>
                    Show all
                  </button>
                </div>
              </>
            )}
          </div>
          <button className={`btn btn-sm btn-icon ${showLabels ? "btn-on" : ""}`} onClick={() => setShowLabels((v) => !v)} title="Show device labels (L)" aria-label="Labels">
            <Tag />
          </button>
          <button className="btn btn-sm btn-icon" onClick={() => setFitKey((k) => k + 1)} title="Fit sheet to screen (F)" aria-label="Fit">
            <Maximize />
          </button>
          <span className="toolbar-sep" />
          <button
            className="btn btn-sm"
            title="Draw home runs from every device on this sheet to its closet"
            onClick={async () => {
              const n = await useEditor.getState().autoHomeRuns(sheet.id);
              toast(n ? `Drew ${n} home runs` : useEditor.getState().closets.length ? "No wired devices on this sheet" : "Place an equipment closet first", n ? "success" : "info");
            }}
          >
            <Cable />
            <span className="hidden 2xl:inline">Home runs</span>
          </button>
          <button className={`btn btn-sm ${panel === "counts" && !selection ? "btn-on" : ""}`} onClick={() => setPanel(panel === "counts" ? null : "counts")} title="Floor counts">
            <ListChecks />
            <span className="hidden 2xl:inline">Counts</span>
          </button>
          <button className={`btn btn-sm ${panel === "scan" && !selection ? "btn-on" : ""}`} onClick={() => setPanel(panel === "scan" ? null : "scan")} title="AI scan assist">
            <Sparkles />
            <span className="hidden 2xl:inline">AI scan</span>
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <PlanCanvas sheet={sheet} draft={draft} fitKey={fitKey} showLabels={showLabels} onTapImage={onTapImage} onDoubleTap={() => drawing && finishDraft()} />
          {sheets.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-200px)] -translate-x-1/2 overflow-x-auto rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur">
              {sheets.map((s, i) => (
                <button
                  key={s.id}
                  className={`tab h-8 px-3 text-[13px] ${s.id === sheet.id ? "bg-ink text-white shadow-sm hover:bg-ink hover:text-white" : ""}`}
                  onClick={() => setActiveSheet(s.id)}
                  title={`Floor ${i + 1}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {hint && (
            <div className="pointer-events-none absolute top-12 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-2 truncate rounded-full bg-ink/90 px-3.5 py-1.5 text-[13px] whitespace-nowrap text-white shadow-pop backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {hint}
            </div>
          )}
          {tool.kind !== "select" && !drawing && (
            <button className="btn btn-sm absolute top-3 right-3 shadow-soft" onClick={() => setTool({ kind: "select" })}>
              <X /> Done
            </button>
          )}
          {(tool.kind === "led" || tool.kind === "wire" || tool.kind === "stair" || tool.kind === "calibrate") && (
            <div className="absolute top-[88px] left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur">
              <button className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => d.slice(0, -2))} disabled={!draft.length}>
                <Undo2 /> Point
              </button>
              {(tool.kind === "led" || tool.kind === "wire") && (
                <button className="btn btn-sm btn-brand" onClick={() => finishDraft()} disabled={draft.length < 4}>
                  Finish
                </button>
              )}
              <button className="btn btn-sm btn-ghost" onClick={() => (draft.length ? setDraft([]) : setTool({ kind: "select" }))}>
                <X /> Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      {rightPanel && (
        <aside className={`scroll-thin w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white ${wide ? "" : "animate-in absolute inset-y-0 right-0 z-30 shadow-pop"}`}>
          {rightPanel === "inspect" ? (
            <Inspector />
          ) : rightPanel === "scan" ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="section-title">AI scan assist</div>
                    <h3 className="text-base leading-tight font-semibold">{sheet.name}</h3>
                  </div>
                </div>
                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setPanel(null)} aria-label="Close">
                  <X />
                </button>
              </div>
              <ScanPanel sheetId={sheet.id} />
            </div>
          ) : (
            floor && (
              <div className="p-4 text-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="section-title">Floor count</div>
                    <h3 className="text-base font-semibold">{floor.name}</h3>
                  </div>
                  <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setPanel(null)} aria-label="Close">
                    <X />
                  </button>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Stat label="Devices" value={floorCounts.reduce((n, [, v]) => n + v, 0)} />
                  <Stat label="LED" value={`${floor.ledTotalFt} LF`} sub={`${floor.ledZones} zones`} />
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input h-9 pl-8" placeholder="Find device (label or room)" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find device" />
                </div>
                {find.trim() && (
                  <ul className="mb-3 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                    {findResults.map((m) => (
                      <li key={m.id}>
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => st.focusOn("markers", m.id)}>
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: typesById.get(m.deviceTypeId)?.color }} />
                          <span className="font-medium">{m.label}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{m.room}</span>
                          <span className="text-xs text-slate-400">{sheets.find((x) => x.id === m.sheetId)?.name}</span>
                        </button>
                      </li>
                    ))}
                    {!findResults.length && <li className="px-3 py-3 text-center text-slate-500">No match</li>}
                  </ul>
                )}
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {floorCounts.map(([id, n]) => {
                    const t = typesById.get(id);
                    const open = expanded === id;
                    return (
                      <li key={id}>
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => setExpanded(open ? null : id)} aria-expanded={open}>
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t?.color }} />
                          <span className="min-w-0 flex-1 truncate">{t?.name ?? id}</span>
                          {floor.tentative[id] ? <span className="chip bg-amber-50 text-amber-700">{floor.tentative[id]}?</span> : null}
                          <span className="font-semibold tabular-nums">{n}</span>
                          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "" : "-rotate-90"}`} />
                        </button>
                        {open && (
                          <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                            {st.markers
                              .filter((m) => m.sheetId === sheet.id && m.deviceTypeId === id)
                              .sort((a, b) => a.label.localeCompare(b.label))
                              .map((m) => (
                                <button
                                  key={m.id}
                                  className={`chip ring-1 hover:bg-brand-50 hover:text-brand-700 ${m.tentative ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-slate-700 ring-slate-200"}`}
                                  onClick={() => st.focusOn("markers", m.id)}
                                  title={m.room || undefined}
                                >
                                  {m.label}
                                  {m.tentative ? " ?" : ""}
                                </button>
                              ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {Object.entries(floor.wireFt).map(([w, ft]) => (
                    <li key={w} className="flex items-center gap-2 px-3 py-2 text-slate-600">
                      <Cable className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{w}</span>
                      <span className="tabular-nums">{ft} ft</span>
                    </li>
                  ))}
                  {!floorCounts.length && !Object.keys(floor.wireFt).length && <li className="px-3 py-6 text-center text-slate-500">Pick a device on the left, then tap the plan.</li>}
                </ul>
                {floor.unmeasuredRuns > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">{floor.unmeasuredRuns} run(s) have no length yet — set the scale or type LF.</p>
                )}
              </div>
            )
          )}
        </aside>
      )}

      {dialog && (
        <Dialog
          title={dialog.title}
          description={dialog.description}
          fields={dialog.fields}
          error={dialogError}
          submitLabel={pending?.kind === "scale" && !sheet.pxPerInch ? "Draw a line" : "Save"}
          secondary={pending?.kind === "scale" && sheet.pxPerInch ? { label: "Draw a line instead", onClick: () => { setPending(null); setTool({ kind: "calibrate" }); } } : undefined}
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

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
