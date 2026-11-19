"use client";
// Plan markups drawn on the sheet (react-konva, in sheet pixels, above the devices). While a draw tool is active a
// transparent sheet-sized rect takes one-finger drags (useOverlayCapture stops the plan panning; two fingers still
// pinch). In Select mode a press on a markup selects / moves / resizes it; a press elsewhere pans the plan as usual.
import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Ellipse, Group, Line, Rect, Text } from "react-konva";
import { useOverlayCapture, type PlanOverlayCtx } from "@/components/editor/overlays/registry";
import {
  arrowHead,
  bbox,
  BOX_KINDS,
  canEditMarkup,
  cloudArc,
  cloudPath,
  fontPx,
  handlesOf,
  HIGHLIGHT_FACTOR,
  HIGHLIGHT_OPACITY,
  hitTest,
  resize,
  simplifyStroke,
  STROKE_SIZES,
  TEXT_PAD,
  textBoxPx,
  textLines,
  toPx,
  translate,
  visibleMarkups,
} from "@/lib/markups";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import type { PlanMarkup } from "@/lib/types";
import { useMarkups } from "./useMarkups";

/** Finger-sized tap tolerance, in screen pixels. */
const TAP_PX = 14;
const LONG_PRESS_MS = 500;

type Gesture =
  | { kind: "draw"; pointerId: number; start: [number, number]; pts: number[] }
  | { kind: "move"; pointerId: number; start: [number, number]; orig: PlanMarkup; moved: boolean; client: [number, number] }
  | { kind: "resize"; pointerId: number; handle: number; orig: PlanMarkup }
  | null;

export default function MarkupLayer({ sheet, projectId, scale }: PlanOverlayCtx & { scale: number }) {
  const W = sheet.width;
  const H = sheet.height;
  const inv = 1 / (scale || 1);
  const groupRef = useRef<Konva.Group>(null);
  const st = useMarkups();
  const { items, open, tool, selectedId, hiddenLayers, allHidden } = st;
  const userId = useSyncStatus((s) => s.userId);
  const role = useRole();
  const setCapture = useOverlayCapture((s) => s.setCapture);
  const [preview, setPreview] = useState<PlanMarkup | null>(null);
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const gesture = useRef<Gesture>(null);
  const pressTimer = useRef<number | null>(null);
  const wasSelected = useRef(false);
  const previewRef = useRef<PlanMarkup | null>(null);
  const showPreview = (m: PlanMarkup | null) => {
    previewRef.current = m;
    setPreview(m);
  };
  // Window listeners must stay the same functions between renders (to be removed); they call the latest handlers.
  const latest = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void; touch: (e: TouchEvent) => void } | null>(null);
  const [win] = useState(() => ({
    move: (e: PointerEvent) => latest.current?.move(e),
    up: (e: PointerEvent) => latest.current?.up(e),
    cancel: (e: PointerEvent) => latest.current?.cancel(e),
    touch: (e: TouchEvent) => latest.current?.touch(e),
  }));

  useEffect(() => {
    void useMarkups.getState().load(projectId);
  }, [projectId]);

  // Draw tools own one-finger drags; Select leaves panning to the plan.
  const drawTool = open && tool !== "select";
  useEffect(() => {
    setCapture(drawTool ? "markups" : null);
    return () => setCapture(null);
  }, [drawTool, setCapture]);

  const shown = useMemo(
    () => (allHidden ? [] : visibleMarkups(items.filter((m) => m.sheetId === sheet.id), { userId, hiddenLayers })),
    [items, sheet.id, userId, hiddenLayers, allHidden],
  );

  // ---- pointer → sheet coordinates (works outside the canvas too, for drags that leave it) ----
  const relPoint = (clientX: number, clientY: number): [number, number] | null => {
    const g = groupRef.current;
    const stage = g?.getStage();
    if (!g || !stage) return null;
    const r = stage.container().getBoundingClientRect();
    const p = g.getAbsoluteTransform().copy().invert().point({ x: clientX - r.left, y: clientY - r.top });
    return [p.x / W, p.y / H];
  };
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  function finish(commit: boolean) {
    const g = gesture.current;
    gesture.current = null;
    cancelPress();
    unlisten();
    setDrawing(null);
    const s = useMarkups.getState();
    const p = previewRef.current;
    showPreview(null);
    if (!g || !commit) return;
    if (g.kind === "draw") {
      const kind = s.tool === "select" ? null : s.tool;
      if (!kind) return;
      const px = toPx(g.pts, W, H);
      const minPx = 6 * inv; // ignore slips smaller than this on screen
      if (kind === "text") {
        s.set({ textDraft: { sheetId: sheet.id, x: g.start[0], y: g.start[1], value: "" } });
        return;
      }
      let pts: number[];
      if (kind === "pen" || kind === "highlight") {
        const simple = simplifyStroke(px, 0.8 * inv);
        pts = simple.length >= 4 ? simple : [px[0], px[1], px[0] + 0.5 * inv, px[1] + 0.5 * inv];
      } else {
        if (px.length < 4 || Math.hypot(px[2] - px[0], px[3] - px[1]) < minPx) return;
        pts = px.slice(0, 4);
      }
      const rel = pts.map((v, i) => clamp01(i % 2 ? v / H : v / W));
      const m = s.draft(kind, sheet.id, rel);
      if (m) void s.save(m);
      return;
    }
    if (g.kind === "move") {
      if (!g.moved) {
        // A plain tap on a text box that was already selected: edit its words.
        if (g.orig.kind === "text" && s.selectedId === g.orig.id && wasSelected.current && canEditMarkup(role, g.orig, userId))
          s.set({ textDraft: { sheetId: g.orig.sheetId, x: g.orig.points[0], y: g.orig.points[1], editId: g.orig.id, value: g.orig.text ?? "" } });
        return;
      }
      if (p) void s.save(p);
      return;
    }
    if (g.kind === "resize" && p) void s.save(p);
  }


  function onMove(e: PointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const p = relPoint(e.clientX, e.clientY);
    if (!p) return;
    if (g.kind === "draw") {
      const kind = useMarkups.getState().tool;
      if (kind === "pen" || kind === "highlight") {
        const n = g.pts.length;
        // Skip points closer than ~1.5 screen px to the last one.
        if (Math.hypot((p[0] - g.pts[n - 2]) * W, (p[1] - g.pts[n - 1]) * H) < 1.5 * inv) return;
        g.pts = [...g.pts, clamp01(p[0]), clamp01(p[1])];
      } else g.pts = [g.start[0], g.start[1], clamp01(p[0]), clamp01(p[1])];
      setDrawing(g.pts);
      return;
    }
    if (g.kind === "move") {
      if (!g.moved && Math.hypot(e.clientX - g.client[0], e.clientY - g.client[1]) < 6) return;
      g.moved = true;
      cancelPress();
      if (!canEditMarkup(role, g.orig, userId)) return;
      showPreview(translate(g.orig, p[0] - g.start[0], p[1] - g.start[1]));
      return;
    }
    if (g.kind === "resize") showPreview(resize(g.orig, g.handle, p[0], p[1]));
  }
  function onUp(e: PointerEvent) {
    if (gesture.current && e.pointerId === gesture.current.pointerId) finish(true);
  }
  function onCancel(e: PointerEvent) {
    if (gesture.current && e.pointerId === gesture.current.pointerId) finish(false);
  }
  // A second finger means pinch-zoom: drop the stroke in progress.
  function onSecondFinger(e: TouchEvent) {
    if (e.touches.length > 1) finish(false);
  }
  useEffect(() => {
    latest.current = { move: onMove, up: onUp, cancel: onCancel, touch: onSecondFinger };
  });
  function listen() {
    window.addEventListener("pointermove", win.move);
    window.addEventListener("pointerup", win.up);
    window.addEventListener("pointercancel", win.cancel);
    window.addEventListener("touchstart", win.touch);
  }
  function unlisten() {
    window.removeEventListener("pointermove", win.move);
    window.removeEventListener("pointerup", win.up);
    window.removeEventListener("pointercancel", win.cancel);
    window.removeEventListener("touchstart", win.touch);
  }
  useEffect(
    () => () => {
      gesture.current = null;
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      window.removeEventListener("pointermove", win.move);
      window.removeEventListener("pointerup", win.up);
      window.removeEventListener("pointercancel", win.cancel);
      window.removeEventListener("touchstart", win.touch);
    },
    [win],
  );

  /** Topmost markup under (x, y). */
  const pick = (x: number, y: number): PlanMarkup | undefined => {
    const tol = TAP_PX * inv;
    for (let i = shown.length - 1; i >= 0; i--) if (hitTest(shown[i], x, y, tol, W, H)) return shown[i];
    return undefined;
  };

  function onDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const evt = e.evt;
    if (gesture.current) return;
    if (evt.pointerType === "mouse" && evt.button !== 0) return;
    // A second finger on the plan: leave it to the pinch.
    if (evt.isPrimary === false) return;
    const p = relPoint(evt.clientX, evt.clientY);
    if (!p) return;
    const s = useMarkups.getState();
    if (s.tool !== "select") {
      if (s.allHidden) s.setAllHidden(false);
      if (s.hiddenLayers.includes(s.layer)) s.toggleLayer(s.layer);
      gesture.current = { kind: "draw", pointerId: evt.pointerId, start: [clamp01(p[0]), clamp01(p[1])], pts: [clamp01(p[0]), clamp01(p[1])] };
      setDrawing(gesture.current.pts);
      listen();
      return;
    }
    // Select: a handle of the selected markup, then any markup; else let the plan pan.
    const sel = shown.find((m) => m.id === s.selectedId);
    if (sel && canEditMarkup(role, sel, userId)) {
      const hs = handlesOf(sel);
      const i = hs.findIndex(([hx, hy]) => Math.hypot((hx - p[0]) * W, (hy - p[1]) * H) <= TAP_PX * 1.3 * inv);
      if (i >= 0) {
        gesture.current = { kind: "resize", pointerId: evt.pointerId, handle: i, orig: sel };
        listen();
        return;
      }
    }
    const hit = pick(p[0], p[1]);
    if (!hit) {
      if (s.selectedId) s.select(null);
      return;
    }
    wasSelected.current = s.selectedId === hit.id;
    s.select(hit.id);
    gesture.current = { kind: "move", pointerId: evt.pointerId, start: p, orig: hit, moved: false, client: [evt.clientX, evt.clientY] };
    const at = { x: evt.clientX, y: evt.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      if (gesture.current?.kind === "move" && !gesture.current.moved) {
        gesture.current = null;
        unlisten();
        showPreview(null);
        navigator.vibrate?.(15);
        useMarkups.getState().set({ details: { id: hit.id, ...at } });
      }
    }, LONG_PRESS_MS);
    listen();
  }

  // Stop the plan from starting a pan under a press that belongs to a markup (Konva starts drags on mouse/touch down).
  const stopIfOurs = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (gesture.current || useMarkups.getState().tool !== "select") e.cancelBubble = true;
  };
  const onContext = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const p = relPoint(e.evt.clientX, e.evt.clientY);
    const hit = p && pick(p[0], p[1]);
    if (!hit) return;
    useMarkups.getState().select(hit.id);
    useMarkups.getState().set({ details: { id: hit.id, x: e.evt.clientX, y: e.evt.clientY } });
  };

  const drawn = preview ? shown.map((m) => (m.id === preview.id ? preview : m)) : shown;
  const selected = drawn.find((m) => m.id === selectedId);
  const live = drawing && tool !== "select" && tool !== "text" ? (useMarkups.getState().draft(tool, sheet.id, drawing) ?? null) : null;

  return (
    <Group ref={groupRef}>
      <Group listening={false}>
        {drawn.map((m) => (
          <MarkupShape key={m.id} m={m} W={W} H={H} />
        ))}
        {live && <MarkupShape m={live} W={W} H={H} />}
        {drawing && tool === "text" && <Circle x={drawing[0] * W} y={drawing[1] * H} radius={6 * inv} fill={st.color} />}
        {selected && <Selection m={selected} W={W} H={H} inv={inv} editable={canEditMarkup(role, selected, userId)} />}
      </Group>
      {open && (
        <Rect
          name="markup-capture"
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"
          onPointerDown={onDown}
          onMouseDown={stopIfOurs}
          onTouchStart={stopIfOurs}
          onClick={(e) => (e.cancelBubble = true)}
          onTap={(e) => (e.cancelBubble = true)}
          onDblClick={(e) => (e.cancelBubble = true)}
          onDblTap={(e) => (e.cancelBubble = true)}
          onContextMenu={onContext}
        />
      )}
    </Group>
  );
}

/** One markup, in sheet pixels. */
export function MarkupShape({ m, W, H }: { m: PlanMarkup; W: number; H: number }) {
  const P = toPx(m.points, W, H);
  const sw = Math.max(0.5, (m.width || STROKE_SIZES.M.width) * W);
  const common = { stroke: m.color, strokeWidth: sw, lineCap: "round" as const, lineJoin: "round" as const, perfectDrawEnabled: false };
  if (P.length < 2) return null;
  switch (m.kind) {
    case "pen":
    case "line":
      return <Line points={P} {...common} />;
    case "highlight":
      return <Line points={P} {...common} strokeWidth={sw * HIGHLIGHT_FACTOR} opacity={HIGHLIGHT_OPACITY} />;
    case "arrow": {
      const head = arrowHead(P, Math.max(sw * 5, W * 0.008));
      return (
        <Group>
          <Line points={P} {...common} />
          {head.length > 0 && <Line points={head} closed fill={m.color} {...common} />}
        </Group>
      );
    }
    case "rect":
      return P.length >= 4 ? <Rect x={Math.min(P[0], P[2])} y={Math.min(P[1], P[3])} width={Math.abs(P[2] - P[0])} height={Math.abs(P[3] - P[1])} {...common} /> : null;
    case "ellipse":
      return P.length >= 4 ? <Ellipse x={(P[0] + P[2]) / 2} y={(P[1] + P[3]) / 2} radiusX={Math.abs(P[2] - P[0]) / 2} radiusY={Math.abs(P[3] - P[1]) / 2} {...common} /> : null;
    case "cloud":
      return P.length >= 4 ? <Line points={cloudPath(P[0], P[1], P[2], P[3], cloudArc(W, H))} closed {...common} /> : null;
    case "text": {
      const fs = fontPx(m, W);
      const box = textBoxPx(m, W);
      return (
        <Group x={P[0]} y={P[1]} opacity={m.text ? 1 : 0.6}>
          <Rect width={box.w} height={box.h} fill="#fff" opacity={0.9} cornerRadius={fs * 0.15} />
          <Rect width={box.w} height={box.h} stroke={m.color} strokeWidth={Math.max(0.5, fs * 0.08)} cornerRadius={fs * 0.15} />
          <Text
            x={TEXT_PAD * fs}
            y={TEXT_PAD * fs + fs * 0.1}
            text={textLines(m).join("\n") || " "}
            fontSize={fs}
            lineHeight={1.25}
            fontStyle="bold"
            fill={m.color}
            wrap="none"
          />
        </Group>
      );
    }
  }
}

function Selection({ m, W, H, inv, editable }: { m: PlanMarkup; W: number; H: number; inv: number; editable: boolean }) {
  const b = bbox(m, W, H);
  const pad = 6 * inv;
  const hs = editable ? handlesOf(m) : [];
  return (
    <Group>
      <Rect
        x={b.x0 * W - pad}
        y={b.y0 * H - pad}
        width={(b.x1 - b.x0) * W + 2 * pad}
        height={(b.y1 - b.y0) * H + 2 * pad}
        stroke="#2563eb"
        strokeWidth={1.5 * inv}
        dash={[6 * inv, 4 * inv]}
        cornerRadius={4 * inv}
      />
      {hs.map(([x, y], i) => (
        <Circle key={i} x={x * W} y={y * H} radius={(BOX_KINDS.includes(m.kind) ? 8 : 9) * inv} fill="#fff" stroke="#2563eb" strokeWidth={2 * inv} />
      ))}
    </Group>
  );
}
