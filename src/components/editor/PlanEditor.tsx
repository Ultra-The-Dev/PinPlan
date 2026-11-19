"use client";
import { Cable, ChevronDown, PanelLeftClose, PanelLeftOpen, Plus, Search, Sparkles, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useMedia, WIDE_EDITOR } from "@/lib/useMedia";
import { closetMeta, PANEL_KINDS } from "@/lib/catalog";
import { MIN_CALIBRATION_PX, parseFeet, parseScale, polylineFt, polylinePx } from "@/lib/geometry";

function formatFeetInches(ft: number) {
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) {
    f += 1;
    i = 0;
  }
  return `${f}'-${i}" (${ft.toFixed(1)} ft)`;
}
import { activeFilterCount, layerCounts } from "@/lib/planFilter";
import { PlanViewport } from "@/lib/planViewport";
import { markerCables } from "@/lib/products";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import { useRole, useTeam } from "@/lib/team";
import { tileClient } from "@/lib/tiles/tileClient";
import { deviceSpec, hasTrade, tradeLayers, tradeVocab, tradeWireTypes } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import type { Layer as LayerId } from "@/lib/types";
import { useViewer } from "@/lib/viewerStore";
import Dialog, { type DialogField } from "../Dialog";
import ScanPanel from "../ScanPanel";
import Inspector from "./Inspector";
import Palette from "./Palette";
import PlanCanvas, { type CanvasHit } from "./PlanCanvas";
import LayersPanel from "./viewer/LayersPanel";
import Minimap from "./viewer/Minimap";
import ModeToggle from "./viewer/ModeToggle";
import PlanToolbar from "./viewer/PlanToolbar";
import SheetBrowser from "./viewer/SheetBrowser";
import SheetPill from "./viewer/SheetPill";
import ZoomControls from "./viewer/ZoomControls";
import "./overlays";
import { AI_ENABLED } from "@/lib/features";
// Plan overlays (register themselves): saved measurements, sheet links.
import "@/components/measure/registerOverlay";
import "../sheetIndex/registerOverlay";

type Pending =
  | { kind: "calibrate"; points: number[] }
  | { kind: "scale" }
  | { kind: "led"; points: number[]; deviceTypeId: string }
  | { kind: "stair"; points: number[] }
  | null;

export default function PlanEditor() {
  const st = useEditor();
  const { sheets, activeSheetId, setActiveSheet, tool, setTool, selection, undo, redo, past, future, hiddenLayers, toggleLayer, setOnlyLayer } = st;
  // Layer toggles and wording follow the company's trades (low voltage only: exactly the original list).
  const trades = useTrades();
  const LAYERS = tradeLayers(trades);
  const vocab = tradeVocab(trades);
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
  const wide = useMedia(WIDE_EDITOR);
  // Below 900 px (phones, small tablets) the minimap starts hidden; below 640 px the sheet browser is full screen.
  const narrow = useMedia("(max-width: 899px)");
  const phone = useMedia("(max-width: 639px)");
  // Phones and narrow tablets open on the plan; the device menu slides in from the Devices button.
  const [paletteOpen, setPaletteOpen] = useState(() => window.matchMedia(WIDE_EDITOR).matches);
  const [panel, setPanel] = useState<"counts" | "scan" | null>(() => (typeof window !== "undefined" && window.matchMedia(WIDE_EDITOR).matches ? "counts" : null));
  const [find, setFind] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vp] = useState(() => new PlanViewport());
  // The toolbar's place depends on the plan area's own width (the device menu and side panel take room too).
  const [planWidth, setPlanWidth] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const planRef = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(() => setPlanWidth(el.clientWidth));
    ro.current.observe(el);
    setPlanWidth(el.clientWidth);
  }, []);
  const toolbarTop = planWidth >= 1000;
  const toolbarRow = !toolbarTop && planWidth < 760;
  useEffect(() => () => vp.destroy(), [vp]);

  // Viewer preferences (this device, this user): mode, minimap, layers & filters, per-sheet views, recent sheets.
  const role = useRole();
  const userId = useTeam((s) => s.userId);
  const viewer = useViewer();
  useEffect(() => {
    viewer.hydrate(userId ?? "local");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // Technicians start in view only; everyone else where they left it (edit by default).
  const mode = viewer.mode ?? (role === "tech" ? "view" : "edit");
  const editing = mode === "edit";
  const filters = viewer.filters;
  const showLabels = filters.labels;
  const setShowLabels = (u: (v: boolean) => boolean) => viewer.setFilters({ labels: u(filters.labels) });
  const minimap = viewer.minimap ?? !narrow;
  const { fullscreen, browserOpen, layersOpen } = viewer;
  const setLayersOpen = (u: (o: boolean) => boolean) => viewer.setLayersOpen(u(layersOpen));
  const sheetIndex = Math.max(0, sheets.findIndex((s) => s.id === sheet?.id));
  const step = (d: -1 | 1) => {
    const next = sheets[sheetIndex + d];
    if (next) setActiveSheet(next.id);
  };
  const toggleFullscreen = (on = !fullscreen) => {
    viewer.setFullscreen(on);
    // Real full screen where the browser allows it (not iPhone Safari): the CSS one covers the app chrome anyway.
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    } catch {
      /* not allowed */
    }
  };
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && useViewer.getState().fullscreen && useViewer.getState().setFullscreen(false);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      useViewer.getState().setFullscreen(false);
    };
  }, []);

  // View only: no tool that changes the plan (measuring is fine).
  useEffect(() => {
    if (!editing && tool.kind !== "select" && tool.kind !== "measure") setTool({ kind: "select" });
  }, [editing, tool.kind, setTool]);

  // Recently viewed, and build the neighbours' tiles in the background so stepping to them is instant.
  const projectId = st.project?.id;
  useEffect(() => {
    if (!sheet || !projectId) return;
    useViewer.getState().markViewed(projectId, sheet.id);
    const t = setTimeout(() => {
      for (const n of [sheets[sheetIndex + 1], sheets[sheetIndex - 1]]) if (n) tileClient().prefetch(n.imageId);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, projectId]);

  useEffect(() => {
    if (!activeSheetId && sheets[0]) setActiveSheet(sheets[0].id);
  }, [activeSheetId, sheets, setActiveSheet]);

  // Keyboard shortcuts (laptop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
        // ⌘+ / ⌘− / ⌘0 zoom the plan, not the page.
        e.preventDefault();
        if (e.key === "0") vp.fit();
        else vp.zoomBy(e.key === "-" ? 1 / 1.5 : 1.5);
      } else if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (!editing) return;
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && k === "y") {
        e.preventDefault();
        if (editing) redo();
      } else if (e.key === "Escape") {
        if (useViewer.getState().browserOpen || useViewer.getState().layersOpen) {
          viewer.setBrowserOpen(false);
          viewer.setLayersOpen(false);
        } else if (draft.length) setDraft([]);
        else if (tool.kind !== "select") setTool({ kind: "select" });
        else if (fullscreen) toggleFullscreen(false);
      } else if (plain && (e.key === "+" || e.key === "=")) {
        vp.zoomBy(1.5);
      } else if (plain && (e.key === "-" || e.key === "_")) {
        vp.zoomBy(1 / 1.5);
      } else if (plain && e.key === "0") {
        vp.fit("sheet");
      } else if (plain && e.key === "1") {
        vp.actualSize();
      } else if (plain && k === "w") {
        vp.fit("width");
      } else if (plain && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 320 : 100;
        const t = vp.transform;
        const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
        const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
        vp.animateTo({ ...t, x: t.x + dx, y: t.y + dy }, 140);
      } else if (plain && e.key === "[") {
        step(-1);
      } else if (plain && e.key === "]") {
        step(1);
      } else if (plain && k === "e") {
        viewer.setMode(editing ? "view" : "edit");
      } else if (plain && k === "v") {
        setTool({ kind: "select" });
      } else if (plain && k === "f") {
        setFitKey((n) => n + 1);
      } else if (plain && k === "m") {
        setTool({ kind: "measure" });
      } else if (plain && k === "l") {
        setShowLabels((v) => !v);
      } else if (e.key === "Enter") {
        finishDraft();
      } else if (editing && (e.key === "Delete" || e.key === "Backspace") && useEditor.getState().selection) {
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
      const closet = s.closets.find((c) => c.id === snap.closetId);
      // Electrical: a run to a panel is a circuit — start it with the device's usual breaker, voltage and poles.
      const spec = marker ? deviceSpec(s.catalog.find((d) => d.id === marker.deviceTypeId)) : null;
      const circuit =
        hasTrade(trades, "electrical") && closet && PANEL_KINDS.includes(closet.kind)
          ? { number: marker?.circuit ?? null, breakerA: spec?.breakerA ?? null, volts: spec?.volts ?? 120, poles: spec?.poles ?? 1 }
          : null;
      const r = await s.addRun({
        kind: "wire",
        points: pts,
        ...(circuit ? { circuit } : {}),
        wireType: (marker && markerCables(marker)[0]) || tradeWireTypes(trades)[0] || "Cat6",
        wireTypes: marker && markerCables(marker).length > 1 ? markerCables(marker) : null,
        markerId: snap.markerId ?? null,
        closetId: snap.closetId ?? null,
        tentative: marker?.tentative ?? false,
      });
      if (marker && snap.closetId && marker.closetId !== snap.closetId) await s.updateMarker(marker.id, { closetId: snap.closetId });
      setDraft([]);
      setDraftSnap(() => ({}));
      if (r) toast(`${vocab.run} added${r.measuredFt != null ? ` · ${r.measuredFt.toFixed(1)} ft` : ""}`);
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
        if (px < MIN_CALIBRATION_PX) return "That line is too short to set a scale — draw it again across the whole dimension";
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
        ? `Tap to place the ${closetMeta(tool.closetKind).name.toLowerCase()}`
        : tool.kind === "led"
          ? "Tap along the LED run · double-tap or Finish"
          : tool.kind === "wire"
            ? `Tap a device, the path, then a ${vocab.closet}`
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

  // Layers & filters panel data: counts on this sheet, the types and rooms placed here, the selected device's type.
  const sheetMarkers = st.markers.filter((m) => m.sheetId === sheet.id);
  const catOf = (typeId: string) => (typesById.get(typeId)?.category ?? "security") as LayerId;
  const perLayer = layerCounts(
    sheetMarkers,
    st.runs.filter((r) => r.sheetId === sheet.id),
    catOf,
  );
  const typeRows = (() => {
    const m = new Map<string, { count: number; tentative: number }>();
    for (const x of sheetMarkers) {
      const e = m.get(x.deviceTypeId) ?? { count: 0, tentative: 0 };
      e.count++;
      if (x.tentative) e.tentative++;
      m.set(x.deviceTypeId, e);
    }
    return [...m.entries()].flatMap(([id, c]) => (typesById.get(id) ? [{ type: typesById.get(id)!, ...c }] : [])).sort((x, y) => x.type.name.localeCompare(y.type.name));
  })();
  const rooms = Array.from(new Set(sheetMarkers.map((m) => m.room.trim()).filter(Boolean))).sort();
  const selectedMarker = selection?.table === "markers" ? st.markers.find((m) => m.id === selection.id) : undefined;
  const nHidden = hiddenLayers.filter((l) => LAYERS.some((x) => x.id === l)).length + (filters.closets ? 0 : 1);
  const nFilters = activeFilterCount(filters);
  const layersBadge = nHidden + nFilters ? String(nHidden + nFilters) : null;
  const perSheet: Record<string, number> = {};
  for (const m of st.markers) perSheet[m.sheetId] = (perSheet[m.sheetId] ?? 0) + 1;

  const toolbar = (
    <PlanToolbar
      editing={editing}
      wideLabels={false}
      tool={tool.kind}
      canUndo={past.length > 0}
      canRedo={future.length > 0}
      onUndo={undo}
      onRedo={redo}
      onSelectTool={() => setTool({ kind: "select" })}
      scaleSet={!!sheet.pxPerFt}
      onScale={() => setPending({ kind: "scale" })}
      onMeasure={() => setTool(tool.kind === "measure" ? { kind: "select" } : { kind: "measure" })}
      layersBadge={layersBadge}
      layersOpen={layersOpen}
      onLayers={() => setLayersOpen((o) => !o)}
      labels={showLabels}
      onLabels={() => setShowLabels((v) => !v)}
      onHomeRuns={async () => {
        const n = await useEditor.getState().autoHomeRuns(sheet.id);
        toast(n ? `Drew ${n} home runs` : useEditor.getState().closets.length ? "No wired devices on this sheet" : "Place an equipment closet first", n ? "success" : "info");
      }}
      countsOpen={panel === "counts" && !selection}
      onCounts={() => setPanel(panel === "counts" ? null : "counts")}
      ai={AI_ENABLED ? { open: panel === "scan" && !selection, onClick: () => setPanel(panel === "scan" ? null : "scan") } : null}
      fullscreen={fullscreen}
      onFullscreen={() => toggleFullscreen()}
    />
  );
  const showPalette = editing && paletteOpen;

  return (
    <div className={`flex bg-slate-100 ${fullscreen ? "fixed inset-0 z-[60]" : "relative h-full"}`} data-testid="plan-editor" data-mode={mode}>
      {/* Device menu (edit mode) */}
      {!wide && showPalette && <div className="absolute inset-0 z-20 bg-slate-900/20" onClick={() => setPaletteOpen(false)} />}
      <aside
        className={`${showPalette ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 motion-reduce:transition-none ${
          wide ? "" : "absolute inset-y-0 left-0 z-30 shadow-pop"
        }`}
        aria-hidden={!showPalette}
      >
        <div className="h-full w-64">{editing && <Palette />}</div>
      </aside>

      <div ref={planRef} className="relative min-w-0 flex-1" data-testid="plan-view">
        <PlanCanvas
          sheet={sheet}
          draft={draft}
          fitKey={fitKey}
          showLabels={showLabels}
          onTapImage={onTapImage}
          onDoubleTap={() => drawing && finishDraft()}
          viewport={vp}
          editing={editing}
          filters={filters}
          onEdgeSwipe={step}
        />
        {/* Edit mode frames the plan in orange, so it's obvious taps change things. */}
        {editing && <div className="pointer-events-none absolute inset-0 z-[5] shadow-[inset_0_0_0_3px_var(--color-brand-500)]" aria-hidden />}

        {/* Top: sheet title (opens the browser) on the left, tools and mode on the right. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2 sm:p-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            {editing && wide && (
              <button
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/90 text-slate-600 shadow-pop ring-1 ring-black/5 backdrop-blur-md hover:text-slate-900"
                onClick={() => setPaletteOpen((o) => !o)}
                title={paletteOpen ? "Hide device menu" : "Show device menu"}
                aria-label={paletteOpen ? "Hide device menu" : "Show device menu"}
                data-plan-ui
              >
                {paletteOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            )}
            <SheetPill sheet={sheet} index={sheetIndex} count={sheets.length} onOpen={() => viewer.setBrowserOpen(true)} onStep={step} compact={phone} />
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {toolbarTop && toolbar}
            <ModeToggle mode={mode} onChange={viewer.setMode} compact={phone} />
          </div>
        </div>

        {hint && (
          <div className="absolute top-[64px] left-1/2 z-10 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-xl bg-ink/90 py-1 pr-1 pl-3.5 text-[13px] whitespace-nowrap text-white shadow-pop backdrop-blur sm:top-[72px]" data-plan-ui>
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
            <span className="min-w-0 truncate py-1">{hint}</span>
            {tool.kind !== "select" && !drawing ? (
              <button className="ml-1 flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25" onClick={() => setTool({ kind: "select" })}>
                <X className="h-3.5 w-3.5" /> Done
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        )}
        {drawing && (
          <div className="absolute top-[112px] left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur sm:top-[120px]" data-plan-ui>
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

        {/* Bottom: minimap and the device menu button on the left, zoom on the right; the toolbar between them or below when the plan area is narrow. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
          <div className="flex items-end justify-between gap-2">
            <div className="pointer-events-auto flex flex-col items-start gap-2">
              {minimap && <Minimap viewport={vp} imageId={sheet.imageId} onClose={() => viewer.setMinimap(false)} max={phone ? 120 : 168} />}
              {editing && !wide && !paletteOpen && (
                <button className="btn btn-brand h-11 px-4 text-sm shadow-pop" onClick={() => setPaletteOpen(true)} data-plan-ui>
                  <Plus />
                  Devices
                </button>
              )}
            </div>
            {!toolbarTop && !toolbarRow && <div className="pointer-events-auto min-w-0 overflow-x-auto rounded-xl">{toolbar}</div>}
            <div className="pointer-events-auto">
              <ZoomControls viewport={vp} minimap={minimap} onMinimap={viewer.setMinimap} compact={phone} />
            </div>
          </div>
          {toolbarRow && <div className="pointer-events-auto mx-auto max-w-full overflow-x-auto rounded-xl">{toolbar}</div>}
        </div>

        {browserOpen && (
          <SheetBrowser
            sheets={sheets}
            activeId={sheet.id}
            recent={(projectId && viewer.recent[projectId]) || []}
            counts={perSheet}
            full={phone}
            onPick={(id) => {
              setActiveSheet(id);
              viewer.setBrowserOpen(false);
            }}
            onClose={() => viewer.setBrowserOpen(false)}
          />
        )}
        {layersOpen && (
          <LayersPanel
            layers={LAYERS}
            hiddenLayers={hiddenLayers}
            toggleLayer={toggleLayer}
            onlyLayer={setOnlyLayer}
            layerCounts={perLayer}
            closetCount={st.closets.filter((c) => c.sheetId === sheet.id).length}
            filters={filters}
            setFilters={viewer.setFilters}
            resetFilters={viewer.resetFilters}
            types={typeRows}
            rooms={rooms}
            selectedType={selectedMarker ? (typesById.get(selectedMarker.deviceTypeId) ?? null) : null}
            full={phone}
            onClose={() => viewer.setLayersOpen(false)}
          />
        )}
      </div>

      {/* Right panel */}
      {rightPanel && (
        <aside className={`scroll-thin w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white ${wide ? "" : "animate-in absolute inset-y-0 right-0 z-30 shadow-pop"}`}>
          {rightPanel === "inspect" ? (
            <Inspector />
          ) : AI_ENABLED && rightPanel === "scan" ? (
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
                  <FloorSecondStat floor={floor} />
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

/** Floor count's second tile: LED for low voltage (as before), else the trade's wire / pipe footage. */
function FloorSecondStat({ floor }: { floor: { ledTotalFt: number; ledZones: number; wireFt: Record<string, number>; wireRuns: Record<string, number> } }) {
  const trades = useTrades();
  if (hasTrade(trades, "lowvoltage")) return <Stat label="LED" value={`${floor.ledTotalFt} LF`} sub={`${floor.ledZones} zones`} />;
  const vocab = tradeVocab(trades);
  const ft = Math.round(Object.values(floor.wireFt).reduce((a, b) => a + b, 0));
  const runs = Object.values(floor.wireRuns).reduce((a, b) => a + b, 0);
  return <Stat label={vocab.wire} value={`${ft} ft`} sub={`${runs} ${vocab.runs.toLowerCase()}`} />;
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
