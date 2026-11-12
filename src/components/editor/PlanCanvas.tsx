"use client";
import type Konva from "konva";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { CLOSET_KINDS, categoryOf } from "@/lib/catalog";
import { runLengthFt } from "@/lib/geometry";
import { useEditor } from "@/lib/store";
import { symbolPath, wireColor } from "@/lib/symbols";
import { useSheetImage } from "@/lib/useImage";
import type { Closet, DeviceType, Layer as LayerId, Marker, Run, Sheet } from "@/lib/types";
import GhostLayer from "../GhostLayer";

const R = 13; // marker radius in screen px

export interface CanvasHit {
  markerId?: string;
  closetId?: string;
}

interface Props {
  sheet: Sheet;
  draft: number[];
  fitKey: number;
  showLabels: boolean;
  onTapImage: (x: number, y: number, hit: CanvasHit) => void;
  onDoubleTap: () => void;
}

export default function PlanCanvas({ sheet, draft, fitKey, showLabels, onTapImage, onDoubleTap }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [viewState, setViewState] = useState({ key: "", scale: 0.2, x: 0, y: 0 });
  const image = useSheetImage(sheet.imageId);
  const W = sheet.width;
  const H = sheet.height;

  const { markers, runs, closets, catalog, tool, selection, hiddenLayers, select, updateMarker, updateRun, updateCloset } = useEditor();
  const typeById = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);
  const visible = (l: LayerId) => !hiddenLayers.includes(l);

  // Resize with the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the sheet on load / sheet change / resize / explicit fit (derived, no effect needed).
  const fitKeyStr = `${sheet.id}|${W}|${H}|${size.w}|${size.h}|${fitKey}`;
  const view =
    viewState.key === fitKeyStr
      ? viewState
      : (() => {
          const sc = Math.min(size.w / W, size.h / H) * 0.96;
          return { key: fitKeyStr, scale: sc, x: (size.w - W * sc) / 2, y: (size.h - H * sc) / 2 };
        })();
  const setView = (u: (v: { scale: number; x: number; y: number }) => { scale: number; x: number; y: number }) =>
    setViewState((prev) => ({ ...u(prev.key === fitKeyStr ? prev : view), key: fitKeyStr }));

  const scale = view.scale;
  const inv = 1 / scale;

  // ---- zoom & pan ----
  function zoomAt(point: { x: number; y: number }, factor: number) {
    setView((v) => {
      const ns = Math.max(0.02, Math.min(8, v.scale * factor));
      const ox = (point.x - v.x) / v.scale;
      const oy = (point.y - v.y) / v.scale;
      return { scale: ns, x: point.x - ox * ns, y: point.y - oy * ns };
    });
  }
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    if (e.evt.ctrlKey || e.evt.metaKey || Math.abs(e.evt.deltaY) > 0) {
      zoomAt(p, Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015)));
    }
  };
  const pinch = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const last = pinch.current;
    if (last) {
      setView((v) => {
        const ns = Math.max(0.02, Math.min(8, v.scale * (dist / last.dist)));
        const ox = (last.center.x - v.x) / v.scale;
        const oy = (last.center.y - v.y) / v.scale;
        return { scale: ns, x: center.x - ox * ns, y: center.y - oy * ns };
      });
    }
    pinch.current = { dist, center };
  };
  const onTouchEnd = () => {
    pinch.current = null;
  };

  // ---- taps ----
  const imagePoint = () => {
    const p = stageRef.current!.getRelativePointerPosition();
    if (!p) return null;
    return { x: p.x / W, y: p.y / H };
  };
  const hitTest = (x: number, y: number): CanvasHit => {
    const tol = (R * 1.6 * inv) / Math.max(W, H);
    const near = (a: { x: number; y: number }) => Math.hypot((a.x - x) * W, (a.y - y) * H) / Math.max(W, H) < tol;
    const c = closets.find((cc) => cc.sheetId === sheet.id && near(cc));
    const m = markers.find((mm) => mm.sheetId === sheet.id && near(mm));
    return { markerId: m?.id, closetId: c?.id };
  };
  const onStageTap = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (pinch.current) return;
    const p = imagePoint();
    if (!p) return;
    if (tool.kind === "select") {
      if (e.target === stageRef.current || e.target.name() === "plan-image") select(null);
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
    onTapImage(p.x, p.y, hitTest(p.x, p.y));
  };

  // ---- long press to edit ----
  const pressTimer = useRef<number | null>(null);
  const startPress = (s: NonNullable<typeof selection>) => {
    pressTimer.current = window.setTimeout(() => {
      select(s);
      navigator.vibrate?.(15);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const sheetMarkers = markers.filter((m) => m.sheetId === sheet.id && visible(typeById.get(m.deviceTypeId)?.category ?? "security"));
  const sheetRuns = runs.filter((r) => r.sheetId === sheet.id && visible(r.kind === "wire" ? "wiring" : "lighting"));
  const sheetClosets = closets.filter((c) => c.sheetId === sheet.id && visible("infrastructure"));
  const selectMode = tool.kind === "select";

  const toPx = (pts: number[]) => pts.map((v, i) => (i % 2 === 0 ? v * W : v * H));

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none bg-[radial-gradient(circle,#cbd5e1_1px,transparent_1px)] bg-slate-100 [background-size:20px_20px]" style={{ cursor: selectMode ? "grab" : "crosshair" }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={scale}
        scaleY={scale}
        x={view.x}
        y={view.y}
        draggable
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onStageTap}
        onTap={onStageTap}
        onDblClick={onDoubleTap}
        onDblTap={onDoubleTap}
      >
        <Layer listening={true}>
          <Rect x={0} y={0} width={W} height={H} fill="#fff" shadowColor="#0f172a" shadowOpacity={0.18} shadowBlur={24 * inv} shadowOffsetY={4 * inv} listening={false} />
          {image && <KImage name="plan-image" image={image.img} width={W} height={H} perfectDrawEnabled={false} />}
        </Layer>
        <Layer>
          {sheetRuns.map((r) => (
            <RunShape
              key={r.id}
              run={r}
              type={r.deviceTypeId ? typeById.get(r.deviceTypeId) : undefined}
              pts={toPx(r.points)}
              inv={inv}
              selected={selection?.id === r.id}
              selectable={selectMode}
              onSelect={() => select({ table: "runs", id: r.id })}
              onMovePoint={(i, x, y) => {
                const points = [...r.points];
                points[i * 2] = x / W;
                points[i * 2 + 1] = y / H;
                updateRun(r.id, { points });
              }}
            />
          ))}
          {sheetClosets.map((c) => (
            <ClosetShape
              key={c.id}
              closet={c}
              W={W}
              H={H}
              inv={inv}
              selected={selection?.id === c.id}
              draggable={selectMode}
              onSelect={() => select({ table: "closets", id: c.id })}
              onMove={(x, y) => updateCloset(c.id, { x, y })}
              onPressStart={() => startPress({ table: "closets", id: c.id })}
              onPressEnd={cancelPress}
            />
          ))}
          {sheetMarkers.map((m) => (
            <MarkerShape
              key={m.id}
              marker={m}
              type={typeById.get(m.deviceTypeId)}
              W={W}
              H={H}
              inv={inv}
              showLabel={showLabels}
              selected={selection?.id === m.id}
              draggable={selectMode}
              onSelect={() => select({ table: "markers", id: m.id })}
              onMove={(x, y) => updateMarker(m.id, { x, y })}
              onPressStart={() => startPress({ table: "markers", id: m.id })}
              onPressEnd={cancelPress}
            />
          ))}
          <GhostLayer sheetId={sheet.id} width={W} height={H} scale={scale} />
          {draft.length >= 2 && (
            <>
              <Line points={toPx(draft)} stroke="#f59e0b" strokeWidth={3 * inv} dash={[8 * inv, 6 * inv]} listening={false} />
              {Array.from({ length: draft.length / 2 }, (_, i) => (
                <Circle key={i} x={draft[i * 2] * W} y={draft[i * 2 + 1] * H} radius={5 * inv} fill="#f59e0b" listening={false} />
              ))}
            </>
          )}
        </Layer>
      </Stage>
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-soft ring-1 ring-slate-200 backdrop-blur">
        <span className="font-semibold tabular-nums text-slate-900">{Math.round(scale * 100)}%</span>
        <span className="h-3 w-px bg-slate-200" />
        {sheet.pxPerFt ? <span>Scale {sheet.scaleLabel ?? `${sheet.pxPerFt.toFixed(1)} px/ft`}</span> : <span className="text-amber-700">No scale set</span>}
      </div>
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-slate-200">
        <button className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.4)} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="h-px bg-slate-200" />
        <button className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1 / 1.4)} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MarkerShape(props: {
  marker: Marker;
  type?: DeviceType;
  W: number;
  H: number;
  inv: number;
  showLabel: boolean;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}) {
  const { marker: m, type, W, H, inv } = props;
  const color = type?.color ?? "#334155";
  const shape = type?.shape ?? "circle";
  const symbol = type?.symbol ?? "?";
  return (
    <Group
      x={m.x * W}
      y={m.y * H}
      scaleX={inv}
      scaleY={inv}
      draggable={props.draggable}
      onClick={(e) => {
        if (!props.draggable) return;
        e.cancelBubble = true;
        props.onSelect();
      }}
      onTap={(e) => {
        if (!props.draggable) return;
        e.cancelBubble = true;
        props.onSelect();
      }}
      onMouseDown={props.onPressStart}
      onTouchStart={props.onPressStart}
      onMouseUp={props.onPressEnd}
      onTouchEnd={props.onPressEnd}
      onDragStart={props.onPressEnd}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        props.onMove(Math.max(0, Math.min(1, e.target.x() / W)), Math.max(0, Math.min(1, e.target.y() / H)));
      }}
    >
      {props.selected && <Circle radius={R + 7} fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth={2.5} />}
      <Shape
        sceneFunc={(ctx, s) => {
          symbolPath(ctx, shape, R);
          ctx.fillStrokeShape(s);
        }}
        fill="#fff"
        stroke={color}
        strokeWidth={3}
        dash={m.tentative ? [5, 4] : undefined}
        shadowColor="#000"
        shadowOpacity={0.25}
        shadowBlur={3}
        hitStrokeWidth={14}
      />
      <Text
        text={symbol}
        width={R * 2}
        height={R * 2}
        offsetX={R}
        offsetY={shape === "triangle" ? R - 3 : R}
        align="center"
        verticalAlign="middle"
        fontStyle="bold"
        fontSize={symbol.length > 2 ? 8 : symbol.length > 1 ? 10 : 13}
        fill={color}
        listening={false}
      />
      {m.tentative && <Text text="?" x={R} y={-R - 6} fontStyle="bold" fontSize={15} fill="#b91c1c" listening={false} />}
      {m.closetId === null && type?.defaultWire && type.defaultWire !== "None" ? null : null}
      {props.showLabel && (
        <Text text={m.label} y={R + 3} width={80} offsetX={40} align="center" fontSize={10} fill="#0f172a" listening={false} />
      )}
    </Group>
  );
}

function ClosetShape(props: {
  closet: Closet;
  W: number;
  H: number;
  inv: number;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}) {
  const { closet: c, W, H, inv } = props;
  const meta = CLOSET_KINDS.find((k) => k.id === c.kind)!;
  const s = 18;
  return (
    <Group
      x={c.x * W}
      y={c.y * H}
      scaleX={inv}
      scaleY={inv}
      draggable={props.draggable}
      onClick={(e) => {
        if (!props.draggable) return;
        e.cancelBubble = true;
        props.onSelect();
      }}
      onTap={(e) => {
        if (!props.draggable) return;
        e.cancelBubble = true;
        props.onSelect();
      }}
      onMouseDown={props.onPressStart}
      onTouchStart={props.onPressStart}
      onMouseUp={props.onPressEnd}
      onTouchEnd={props.onPressEnd}
      onDragStart={props.onPressEnd}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        props.onMove(Math.max(0, Math.min(1, e.target.x() / W)), Math.max(0, Math.min(1, e.target.y() / H)));
      }}
    >
      {props.selected && <Rect x={-s - 6} y={-s - 6} width={2 * s + 12} height={2 * s + 12} stroke="#6366f1" strokeWidth={3} cornerRadius={8} />}
      <Rect x={-s} y={-s} width={2 * s} height={2 * s} cornerRadius={6} fill={meta.color} shadowColor="#000" shadowOpacity={0.3} shadowBlur={4} />
      <Text text={meta.abbrev} width={2 * s} height={2 * s} offsetX={s} offsetY={s} align="center" verticalAlign="middle" fontStyle="bold" fontSize={13} fill="#fff" listening={false} />
      <Text text={c.name} y={s + 3} width={140} offsetX={70} align="center" fontSize={11} fontStyle="bold" fill={meta.color} listening={false} />
    </Group>
  );
}

function RunShape(props: {
  run: Run;
  type?: DeviceType;
  pts: number[];
  inv: number;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onMovePoint: (i: number, x: number, y: number) => void;
}) {
  const { run: r, pts, inv } = props;
  const color = r.kind === "wire" ? wireColor(r.wireType) : (props.type?.color ?? categoryOf("lighting").color);
  const width = r.kind === "wire" ? 2 : 5;
  const len = runLengthFt(r);
  const mid = midpoint(pts);
  const label =
    r.kind === "wire"
      ? ""
      : [r.zone ? `Z${r.zone}` : "", len != null ? `${Math.round(len * 10) / 10} LF` : "LF?", r.switchLabel ?? "", r.kind === "stair" && r.steps ? `${r.steps} steps` : ""]
          .filter(Boolean)
          .join(" · ");
  const tap = (e: Konva.KonvaEventObject<Event>) => {
    if (!props.selectable) return;
    e.cancelBubble = true;
    props.onSelect();
  };
  return (
    <Group>
      {props.selected && <Line points={pts} stroke="#6366f1" strokeWidth={(width + 8) * inv} opacity={0.35} lineCap="round" lineJoin="round" listening={false} />}
      <Line
        points={pts}
        stroke={color}
        strokeWidth={width * inv}
        dash={r.kind === "wire" ? [6 * inv, 4 * inv] : r.kind === "stair" ? [3 * inv, 3 * inv] : undefined}
        opacity={r.tentative ? 0.5 : 0.95}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={22 * inv}
        onClick={tap}
        onTap={tap}
      />
      {label && (
        <Group x={mid.x} y={mid.y} scaleX={inv} scaleY={inv} listening={false}>
          <Rect x={-label.length * 3.3 - 4} y={-18} width={label.length * 6.6 + 8} height={15} fill="#fff" opacity={0.9} cornerRadius={3} />
          <Text text={label} x={-label.length * 3.3} y={-16} fontSize={11} fontStyle="bold" fill={color} />
        </Group>
      )}
      {props.selected &&
        props.selectable &&
        Array.from({ length: pts.length / 2 }, (_, i) => (
          <Circle
            key={i}
            x={pts[i * 2]}
            y={pts[i * 2 + 1]}
            radius={8 * inv}
            fill="#fff"
            stroke="#6366f1"
            strokeWidth={2 * inv}
            draggable
            onDragEnd={(e) => {
              e.cancelBubble = true;
              props.onMovePoint(i, e.target.x(), e.target.y());
            }}
          />
        ))}
    </Group>
  );
}

function midpoint(pts: number[]) {
  // Midpoint along the polyline length.
  let total = 0;
  const segs: number[] = [];
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    segs.push(l);
    total += l;
  }
  let acc = 0;
  for (let k = 0; k < segs.length; k++) {
    if (acc + segs[k] >= total / 2) {
      const t = segs[k] ? (total / 2 - acc) / segs[k] : 0;
      const i = k * 2;
      return { x: pts[i] + (pts[i + 2] - pts[i]) * t, y: pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t };
    }
    acc += segs[k];
  }
  return { x: pts[0] ?? 0, y: pts[1] ?? 0 };
}
