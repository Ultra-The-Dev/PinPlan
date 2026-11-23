"use client";
// The plan: sheet image (tiled pyramid), runs, closets, devices and plan overlays on a Konva stage. Pan/zoom lives in
// a PlanViewport (outside React) and pointer input in PlanGestures; this component wires them to the editor store.
// Layers don't listen: hit testing is planHit.ts, so Konva never draws a hit canvas. See docs/plan-viewer.md.
import Konva from "konva";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Circle, Layer, Line, Rect, Stage } from "react-konva";
import { DRAFT, DRAFT_DASH } from "@/lib/canvasColors";
import { closetMeta } from "@/lib/catalog";
import { useT } from "@/lib/i18n";
import { AI_ENABLED } from "@/lib/features";
import { DEFAULT_FILTERS, closetVisibility, markerVisibility, runVisibility, type PlanFilters, type Visibility } from "@/lib/planFilter";
import { PlanGestures, type GestureHandlers, type TapInfo } from "@/lib/planGestures";
import { MOUSE_HIT, TOUCH_HIT, hitTestPlan, type HitInput, type PlanHit } from "@/lib/planHit";
import { usePlanOverlays, type PlanOverlay, type PlanOverlayContext, type PlanTapEvent } from "@/lib/planOverlays";
import { CONSTANT_SIZE, type PlanViewport } from "@/lib/planViewport";
import { markerQty } from "@/lib/markerCount";
import { useEditor } from "@/lib/store";
import { usePhotoPins } from "../photos/photoPinsUi";
import { iconFor } from "@/lib/symbols";
import { tileClient, usePyramid } from "@/lib/tiles/tileClient";
import type { Layer as LayerId, Sheet } from "@/lib/types";
import { useViewer } from "@/lib/viewerStore";
import type { Point } from "@/lib/viewport";
import GhostLayer from "../GhostLayer";
import MarkersShape, { markerStats, type MarkerDrag, type MarkerItem } from "./canvas/MarkersShape";
import { MARKER_R } from "./canvas/markerSprites";
import { ClosetShape, RunShape } from "./canvas/PlanShapes";
import SheetImage, { sheetStats } from "./canvas/SheetImage";

export interface CanvasHit {
  markerId?: string;
  closetId?: string;
}

interface Props {
  sheet: Sheet;
  draft: number[];
  /** Bump to fit the sheet (animated). */
  fitKey: number;
  showLabels: boolean;
  onTapImage: (x: number, y: number, hit: CanvasHit) => void;
  /** Double-tap while drawing (finishes the run). */
  onDoubleTap: () => void;
  /** The view's pan/zoom state (PlanEditor owns it so its chrome can zoom, fit and show the minimap). */
  viewport: PlanViewport;
  /** Edit mode: devices can be dragged and tools place things. False = view only. */
  editing?: boolean;
  filters?: PlanFilters;
  /** Overlays for this view only (others register globally with registerPlanOverlay). */
  overlays?: PlanOverlay[];
  /** Touch swipe in from a screen edge: -1 previous sheet, +1 next. */
  onEdgeSwipe?: (dir: -1 | 1) => void;
}

const DRAWING = new Set(["led", "wire", "stair", "calibrate"]);

// Canvases at more than 2× the CSS size (3× phones) cost 2.25× the fill for detail nobody sees on a moving plan.
if (typeof window !== "undefined") Konva.pixelRatio = Math.min(2, window.devicePixelRatio || 1);

export default function PlanCanvas({ sheet, draft, fitKey, showLabels, onTapImage, onDoubleTap, viewport: vp, editing = true, filters = DEFAULT_FILTERS, overlays: extraOverlays, onEdgeSwipe }: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const sheetLayerRef = useRef<Konva.Layer>(null);
  const planLayerRef = useRef<Konva.Layer>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const W = sheet.width;
  const H = sheet.height;
  const pyramid = usePyramid(sheet.imageId);

  const { markers, runs, closets, catalog, photos, tool, selection, multi, hiddenLayers } = useEditor();
  const overlays = usePlanOverlays(extraOverlays);

  // Scale for the few React-rendered things that depend on it (bundle spacing, ghost sizes): updated when the view
  // settles, not every frame.
  const settledRef = useRef(1);
  const settledScale = useSyncExternalStore(
    vp.subscribe,
    () => {
      if (!vp.moving) settledRef.current = vp.transform.scale;
      return settledRef.current;
    },
    () => 1,
  );
  const inv = 1 / settledScale;

  // ---------------- size, sheet, memory, focus ----------------

  useLayoutEffect(() => {
    vp.attach(stageRef.current);
    return () => vp.attach(null);
  }, [vp]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const shown = useRef<{ key: string; id: string } | null>(null);
  useLayoutEffect(() => {
    if (!size.w || !size.h) return;
    vp.setSize(size);
    const key = `${sheet.id}|${W}|${H}`;
    if (shown.current?.key === key) return;
    const prev = shown.current;
    if (prev && prev.id !== sheet.id) useViewer.getState().rememberView(prev.id, vp.memory());
    // Same sheet with new dimensions (rotated): fit; another sheet: where it was left.
    const mem = prev?.id === sheet.id ? null : useViewer.getState().views[sheet.id];
    vp.setSheet({ width: W, height: H }, mem);
    shown.current = { key, id: sheet.id };
  }, [vp, sheet.id, W, H, size]);

  // Remember where this sheet is looked at, whenever the view comes to rest.
  useEffect(
    () =>
      vp.subscribe(() => {
        if (!vp.moving && vp.ready && shown.current?.id === sheet.id) useViewer.getState().rememberView(sheet.id, vp.memory());
      }),
    [vp, sheet.id],
  );

  const firstFit = useRef(fitKey);
  useEffect(() => {
    if (fitKey !== firstFit.current) vp.fit();
  }, [fitKey, vp]);

  // "Find device": centre the requested point once per request (focus.n), keeping at least a readable zoom.
  const focus = useEditor((s) => s.focus);
  const focused = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!focus || focus.n === focused.current || focus.sheetId !== sheet.id || !size.w || !vp.ready) return;
    focused.current = focus.n;
    vp.focus({ x: focus.x, y: focus.y });
  }, [focus, sheet.id, size.w, vp]);

  // New tiles → redraw just the sheet layer.
  useEffect(() => (sheet.imageId ? tileClient().open(sheet.imageId, () => sheetLayerRef.current?.batchDraw()) : undefined), [sheet.imageId]);

  // Constant-size nodes React just created start at scale 1.
  useLayoutEffect(() => {
    vp.updateConstantSize();
  });

  // ---------------- what's drawn ----------------

  const typeById = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);
  // Camera badges on devices with photos: a layer, off by default (Layers → Show on plan → Photos).
  const photoBadges = usePhotoPins((s) => s.visible);
  const photoCount = useMemo(() => {
    const m = new Map<string, number>();
    if (photoBadges) for (const p of photos) if (!p.deleted && p.markerId) m.set(p.markerId, (m.get(p.markerId) ?? 0) + 1);
    return m;
  }, [photos, photoBadges]);

  const sheetId = sheet.id;
  const view = useMemo(() => {
    const vis = new Map<string, Visibility>();
    const items: MarkerItem[] = [];
    const hitMarkers: HitInput["markers"] = [];
    for (const m of markers) {
      if (m.sheetId !== sheetId) continue;
      const type = typeById.get(m.deviceTypeId);
      const v = markerVisibility(m, (type?.category ?? "security") as LayerId, hiddenLayers, filters);
      vis.set(m.id, v);
      if (v === "hide") continue;
      items.push({
        id: m.id,
        x: m.x * W,
        y: m.y * H,
        shape: type?.shape ?? "circle",
        color: type?.color ?? "#334155",
        symbol: type?.symbol ?? "?",
        icon: type ? iconFor(type) : null,
        tentative: !!m.tentative,
        label: m.label,
        photos: photoCount.get(m.id) ?? 0,
        count: markerQty(m),
        selected: multi.length ? multi.includes(m.id) : selection?.id === m.id,
        dim: v === "dim",
      });
      if (v === "show") hitMarkers.push(m);
    }
    const sheetRuns = runs.filter((r) => r.sheetId === sheetId).map((r) => ({ r, v: runVisibility(r, hiddenLayers, filters, (id) => vis.get(id)) })).filter((x) => x.v !== "hide");
    const sheetClosets = closets.filter((c) => c.sheetId === sheetId && closetVisibility(c, closetMeta(c.kind).category as LayerId, hiddenLayers, filters) !== "hide");
    return { items, hitMarkers, sheetRuns, sheetClosets };
  }, [markers, runs, closets, sheetId, typeById, hiddenLayers, filters, photoCount, multi, selection, W, H]);

  const selectMode = tool.kind === "select";
  const selectedRun = selection?.table === "runs" ? view.sheetRuns.find((x) => x.r.id === selection.id)?.r : undefined;
  const handlesFor = editing && selectMode && selectedRun ? selectedRun : null;

  // Hit-test data and handlers read through refs, so the gesture controller is created once.
  const hitRef = useRef<HitInput>({ markers: [], closets: [], runs: [] });
  const hitInput: HitInput = { markers: view.hitMarkers, closets: view.sheetClosets, runs: view.sheetRuns.filter((x) => x.v === "show").map((x) => x.r), handlesFor };
  useLayoutEffect(() => {
    hitRef.current = hitInput;
  });
  const markerDrag = useRef<MarkerDrag | null>(null);
  const drag = useRef<{ hit: PlanHit; offset: Point; origin: Point; pos: Point } | null>(null);
  const space = useRef(false);

  const overlayCtx = (): PlanOverlayContext => ({ sheet, viewport: vp, editing, tool: useEditor.getState().tool });
  /** The overlay event for a point on the plan. */
  const overlayEvent = (screen: Point, info?: Pick<TapInfo, "pointerType" | "shiftKey" | "hit">): PlanTapEvent => {
    const sheetPx = vp.screenToSheetPx(screen);
    const hit = info?.hit;
    return { rel: { x: sheetPx.x / W, y: sheetPx.y / H }, sheetPx, screen, pointerType: info?.pointerType ?? "mouse", shiftKey: !!info?.shiftKey, hit: hit ? { kind: hit.kind, id: hit.id } : null };
  };
  /** Enabled overlays, topmost first (the order taps are offered in). */
  const liveOverlays = (ctx: PlanOverlayContext) => [...overlays].reverse().filter((o) => o.enabled?.(ctx) ?? true);
  /** The overlay that owns the current drag (onDragStart returned true), with the press's pointer details. */
  const claimed = useRef<{ o: PlanOverlay; info: Pick<TapInfo, "pointerType" | "shiftKey" | "hit"> } | null>(null);

  const hitAt = (screen: Point, pointerType: string) =>
    hitTestPlan(hitRef.current, { width: W, height: H }, vp.screenToSheetPx(screen), vp.transform.scale, pointerType === "touch" ? TOUCH_HIT : MOUSE_HIT, vp.sizeFactor);

  /** Device / closet near a tap, for snapping a wire run (as before: ~1.6 badge radii). */
  const snapHit = (p: Point): CanvasHit => {
    const tol = MARKER_R * 1.6;
    const opts = { ...MOUSE_HIT, marker: tol, closet: tol, run: 0, handle: 0 };
    const m = hitTestPlan({ markers: hitRef.current.markers, closets: [], runs: [] }, { width: W, height: H }, p, vp.transform.scale, opts, 1);
    const c = hitTestPlan({ markers: [], closets: hitRef.current.closets, runs: [] }, { width: W, height: H }, p, vp.transform.scale, opts, 1);
    return { markerId: m?.id, closetId: c?.id };
  };

  const entityPos = (hit: PlanHit): Point | null => {
    const s = useEditor.getState();
    if (hit.kind === "marker") {
      const m = s.markers.find((x) => x.id === hit.id);
      return m ? { x: m.x * W, y: m.y * H } : null;
    }
    if (hit.kind === "closet") {
      const c = s.closets.find((x) => x.id === hit.id);
      return c ? { x: c.x * W, y: c.y * H } : null;
    }
    if (hit.kind === "handle") {
      const r = s.runs.find((x) => x.id === hit.id);
      return r ? { x: r.points[hit.index * 2] * W, y: r.points[hit.index * 2 + 1] * H } : null;
    }
    return null;
  };

  const showDragAt = (hit: PlanHit, pos: Point) => {
    if (hit.kind === "marker") {
      markerDrag.current = { id: hit.id, x: pos.x, y: pos.y };
      planLayerRef.current?.batchDraw();
      return;
    }
    const node = stageRef.current?.findOne(hit.kind === "closet" ? `#closet-${hit.id}` : `#handle-${hit.id}-${hit.kind === "handle" ? hit.index : 0}`);
    node?.position(pos);
    planLayerRef.current?.batchDraw();
  };

  const handlers: GestureHandlers = {
    hitAt,
    canDrag: (hit) => editing && useEditor.getState().tool.kind === "select" && (hit.kind === "marker" || hit.kind === "closet" || hit.kind === "handle") && !overlays.some((o) => o.capturing?.(overlayCtx())),
    forcePan: () => space.current,
    claimDrag(start) {
      const ctx = overlayCtx();
      const ev = overlayEvent(start.screen, start);
      for (const o of liveOverlays(ctx))
        if (o.onDragStart?.(ev, ctx)) {
          claimed.current = { o, info: start };
          return true;
        }
      return false;
    },
    claimedDragMove(screen) {
      const c = claimed.current;
      c?.o.onDragMove?.(overlayEvent(screen, c.info), overlayCtx());
    },
    claimedDragEnd(screen, cancelled) {
      const c = claimed.current;
      claimed.current = null;
      c?.o.onDragEnd?.(overlayEvent(screen, c.info), overlayCtx(), cancelled);
    },
    holdLongPress() {
      const ctx = overlayCtx();
      return liveOverlays(ctx).some((o) => !!o.onDragStart && !!o.capturing?.(ctx));
    },
    onContextMenu(info) {
      const ctx = overlayCtx();
      const ev = overlayEvent(info.screen, info);
      return liveOverlays(ctx).some((o) => !!o.onLongPress?.(ev, ctx));
    },
    onTap(info) {
      const ctx = overlayCtx();
      const ev = overlayEvent(info.screen, info);
      const { rel, sheetPx } = ev;
      for (const o of liveOverlays(ctx)) if (o.onTap?.(ev, ctx)) return;
      const st = useEditor.getState();
      // View only allows measuring, nothing that changes the plan.
      if (st.tool.kind === "select" || !editing) {
        const h = info.hit;
        if (h?.kind === "marker") {
          if (info.shiftKey || info.metaKey || info.ctrlKey || st.multiMode) st.toggleMulti(h.id);
          else st.select({ table: "markers", id: h.id });
        } else if (h?.kind === "closet") st.select({ table: "closets", id: h.id });
        else if (h?.kind === "run") st.select({ table: "runs", id: h.id });
        else if (!h) st.select(null);
        return;
      }
      if (rel.x < 0 || rel.y < 0 || rel.x > 1 || rel.y > 1) return;
      onTapImage(rel.x, rel.y, snapHit(sheetPx));
    },
    onDoubleTap(info) {
      const dctx = overlayCtx();
      const dev = overlayEvent(info.screen, info);
      for (const o of liveOverlays(dctx)) if (o.onDoubleTap?.(dev, dctx)) return;
      const k = useEditor.getState().tool.kind;
      if (editing && DRAWING.has(k)) return onDoubleTap();
      if (k === "select" || !editing) vp.zoomBy(2, info.screen, 280);
    },
    onLongPress(info) {
      const lctx = overlayCtx();
      const lev = overlayEvent(info.screen, info);
      for (const o of liveOverlays(lctx)) if (o.onLongPress?.(lev, lctx)) return;
      const h = info.hit;
      const st = useEditor.getState();
      if (h?.kind === "marker") st.select({ table: "markers", id: h.id });
      else if (h?.kind === "closet") st.select({ table: "closets", id: h.id });
      else if (h?.kind === "run") st.select({ table: "runs", id: h.id });
    },
    onTwoFingerTap(center) {
      vp.zoomBy(1 / 2, center, 260);
    },
    onEdgeSwipe(dir) {
      onEdgeSwipe?.(dir);
    },
    onDragStart(hit, screen) {
      const origin = entityPos(hit);
      if (!origin) return;
      const p = vp.screenToSheetPx(screen);
      drag.current = { hit, origin, offset: { x: origin.x - p.x, y: origin.y - p.y }, pos: origin };
      showDragAt(hit, origin);
      if (wrapRef.current) wrapRef.current.style.cursor = "grabbing";
    },
    onDragMove(hit, screen) {
      const d = drag.current;
      if (!d) return;
      const p = vp.screenToSheetPx(screen);
      // Keep it on the sheet (positions are 0–1): a point dropped off the edge would measure past the plan.
      d.pos = { x: Math.max(0, Math.min(W, p.x + d.offset.x)), y: Math.max(0, Math.min(H, p.y + d.offset.y)) };
      showDragAt(hit, d.pos);
    },
    async onDragEnd(hit, screen) {
      handlers.onDragMove(hit, screen);
      const d = drag.current;
      drag.current = null;
      if (wrapRef.current) wrapRef.current.style.cursor = "";
      if (!d) return;
      const moved = Math.hypot(d.pos.x - d.origin.x, d.pos.y - d.origin.y) * vp.transform.scale > 0.5;
      const st = useEditor.getState();
      const x = d.pos.x / W;
      const y = d.pos.y / H;
      try {
        if (!moved) showDragAt(hit, d.origin);
        else if (hit.kind === "marker") await st.updateMarker(hit.id, { x, y });
        else if (hit.kind === "closet") await st.updateCloset(hit.id, { x, y });
        else if (hit.kind === "handle") {
          const r = st.runs.find((rr) => rr.id === hit.id);
          if (r) {
            const points = [...r.points];
            points[hit.index * 2] = x;
            points[hit.index * 2 + 1] = y;
            await st.updateRun(r.id, { points });
          }
        }
      } finally {
        markerDrag.current = null;
        planLayerRef.current?.batchDraw();
      }
    },
    onHover(hit) {
      const el = wrapRef.current;
      if (!el || drag.current) return;
      el.style.cursor = space.current ? "grab" : handlers.holdLongPress?.() ? "crosshair" : hit ? (handlers.canDrag(hit) ? "move" : "pointer") : "";
    },
  };
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const proxy = new Proxy({} as GestureHandlers, { get: (_t, k: keyof GestureHandlers) => handlersRef.current[k] });
    const g = new PlanGestures(el, vp, proxy);
    // Space + drag pans from anywhere (desktop).
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    };
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      if (!space.current) {
        space.current = true;
        el.style.cursor = "grab";
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      space.current = false;
      el.style.cursor = "";
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    // Perf/debug handle for tests and support (no data, just the view).
    (window as unknown as { __pinplanViewer?: unknown }).__pinplanViewer = { viewport: vp, stage: stageRef.current, gestures: g, sheetStats, markerStats, editor: useEditor };
    return () => {
      g.destroy();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [vp]);

  const toPx = (pts: number[]) => pts.map((v, i) => (i % 2 === 0 ? v * W : v * H));
  const ctx: PlanOverlayContext = { sheet, viewport: vp, editing, tool };
  const active = overlays.filter((o) => o.enabled?.(ctx) ?? true);

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 touch-none overflow-hidden bg-[#e7e3dc] select-none ${editing && !selectMode ? "cursor-crosshair" : "cursor-grab"}`}
      data-plan-canvas
    >
      <Stage ref={stageRef} width={Math.max(1, size.w)} height={Math.max(1, size.h)} listening={false}>
        <Layer ref={sheetLayerRef} listening={false}>
          <Rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#cfc8bd" strokeWidth={1} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />
          <SheetImage pyramid={pyramid} viewport={vp} width={W} height={H} />
        </Layer>
        <Layer ref={planLayerRef} listening={false}>
          {view.sheetRuns.map(({ r, v }) => (
            <RunShape
              key={r.id}
              run={r}
              type={r.deviceTypeId ? typeById.get(r.deviceTypeId) : undefined}
              pts={toPx(r.points)}
              inv={inv}
              selected={selection?.id === r.id}
              handles={handlesFor?.id === r.id}
              dim={v === "dim"}
            />
          ))}
          {view.sheetClosets.map((c) => (
            <ClosetShape key={c.id} closet={c} W={W} H={H} selected={selection?.id === c.id} />
          ))}
          <MarkersShape items={view.items} viewport={vp} showLabels={showLabels} drag={markerDrag} />
          {draft.length >= 2 && (
            <>
              <Line points={toPx(draft)} stroke={DRAFT} strokeWidth={3} strokeScaleEnabled={false} dash={DRAFT_DASH} listening={false} />
              {Array.from({ length: draft.length / 2 }, (_, i) => (
                <Circle key={i} name={CONSTANT_SIZE} x={draft[i * 2] * W} y={draft[i * 2 + 1] * H} radius={5} fill={DRAFT} listening={false} />
              ))}
            </>
          )}
        </Layer>
        {AI_ENABLED && (
          <Layer>
            <GhostLayer sheetId={sheet.id} width={W} height={H} scale={settledScale} />
          </Layer>
        )}
        {active.map((o) =>
          o.konva ? (
            <Layer key={o.id} listening={false}>
              {o.konva(ctx)}
            </Layer>
          ) : null,
        )}
      </Stage>
      {active.some((o) => o.html) && (
        <div className="pointer-events-none absolute inset-0" data-plan-overlays>
          {active.map((o) => (o.html ? <div key={o.id} className="contents">{o.html(ctx)}</div> : null))}
        </div>
      )}
      {!pyramid?.preview && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-soft ring-1 ring-slate-200">{t("Loading sheet…")}</span>
        </div>
      )}
    </div>
  );
}
