"use client";
// Runs (wire / LED / stair) and closets on the plan. Lines keep a constant screen width (strokeScaleEnabled=false);
// labels, handles and closet badges are "cs" nodes the viewport keeps at a constant screen size. Not listening: taps
// and drags are handled by planGestures + planHit.
import { Circle, Group, Line, Rect, Text } from "react-konva";
import { categoryOf, closetMeta } from "@/lib/catalog";
import { HANDLE_FILL, HANDLE_STROKE, SELECT_HALO, SELECT_HALO_OPACITY, SELECT_INK } from "@/lib/canvasColors";
import { bundleOffsets, offsetPolyline, polylineMidpoint, runLengthFt } from "@/lib/geometry";
import { useT } from "@/lib/i18n";
import { CONSTANT_SIZE } from "@/lib/planViewport";
import { cableSummary, runCables } from "@/lib/products";
import { wireColor } from "@/lib/symbols";
import type { Closet, DeviceType, Run } from "@/lib/types";

export function RunShape(props: {
  run: Run;
  type?: DeviceType;
  /** Sheet px. */
  pts: number[];
  /** Sheet px per screen px right now (only for bundle spacing, which is in sheet space). */
  inv: number;
  selected: boolean;
  /** Draw the point handles (selected, edit mode). */
  handles: boolean;
  dim: boolean;
}) {
  const t = useT();
  const { run: r, pts, inv } = props;
  const color = r.kind === "wire" ? wireColor(r.wireType) : (props.type?.color ?? categoryOf("lighting").color);
  const width = r.kind === "wire" ? 2 : 5;
  const len = runLengthFt(r);
  const mid = polylineMidpoint(pts);
  // A bundle (HDMI + Cat6…) is drawn as parallel lines, one per cable, in each cable's colour.
  const cables = r.kind === "wire" ? runCables(r) : [];
  const strands = cables.length > 1 ? bundleOffsets(cables.length, 3.6 * inv).map((d, k) => ({ pts: offsetPolyline(pts, d), color: wireColor(cables[k]) })) : null;
  const label =
    r.kind === "wire"
      ? props.selected || cables.length > 1
        ? cableSummary(cables)
        : ""
      : [r.zone ? `Z${r.zone}` : "", len != null ? t("{n} LF", { n: Math.round(len * 10) / 10 }) : t("LF?"), r.switchLabel ?? "", r.kind === "stair" && r.steps ? t.tn("{n} step", "{n} steps", r.steps) : ""]
          .filter(Boolean)
          .join(" · ");
  const opacity = props.dim ? 0.2 : r.tentative ? 0.5 : 0.95;
  return (
    <Group listening={false}>
      {props.selected && (
        <>
          <Line points={pts} stroke={SELECT_HALO} strokeWidth={width + 10} strokeScaleEnabled={false} opacity={SELECT_HALO_OPACITY} lineCap="round" lineJoin="round" perfectDrawEnabled={false} />
          <Line points={pts} stroke={SELECT_INK} strokeWidth={width + 3} strokeScaleEnabled={false} lineCap="round" lineJoin="round" perfectDrawEnabled={false} />
        </>
      )}
      {strands?.map((s, k) => (
        <Line key={k} points={s.pts} stroke={s.color} strokeWidth={2.2} strokeScaleEnabled={false} dash={[6, 4]} opacity={opacity} lineCap="round" lineJoin="round" perfectDrawEnabled={false} />
      ))}
      {!strands && (
        <Line
          points={pts}
          stroke={color}
          strokeWidth={width}
          strokeScaleEnabled={false}
          dash={r.kind === "wire" ? [6, 4] : r.kind === "stair" ? [3, 3] : undefined}
          opacity={opacity}
          lineCap="round"
          lineJoin="round"
          perfectDrawEnabled={false}
        />
      )}
      {label && (
        <Group name={CONSTANT_SIZE} x={mid.x} y={mid.y} opacity={props.dim ? 0.3 : 1}>
          <Rect x={-label.length * 3.3 - 4} y={-18} width={label.length * 6.6 + 8} height={15} fill="#fff" opacity={0.9} cornerRadius={3} />
          <Text text={label} x={-label.length * 3.3} y={-16} fontSize={11} fontStyle="bold" fill={strands ? "#44403c" : color} />
        </Group>
      )}
      {props.handles &&
        Array.from({ length: pts.length / 2 }, (_, i) => (
          <Circle key={i} id={`handle-${r.id}-${i}`} name={CONSTANT_SIZE} x={pts[i * 2]} y={pts[i * 2 + 1]} radius={8} fill={HANDLE_FILL} stroke={HANDLE_STROKE} strokeWidth={2} />
        ))}
    </Group>
  );
}

export function ClosetShape(props: { closet: Closet; W: number; H: number; selected: boolean }) {
  const { closet: c, W, H } = props;
  const meta = closetMeta(c.kind);
  const s = 18;
  return (
    <Group id={`closet-${c.id}`} name={CONSTANT_SIZE} x={c.x * W} y={c.y * H} listening={false}>
      {props.selected && (
        <>
          <Rect x={-s - 7} y={-s - 7} width={2 * s + 14} height={2 * s + 14} stroke={SELECT_HALO} strokeWidth={6} opacity={SELECT_HALO_OPACITY} cornerRadius={9} />
          <Rect x={-s - 6} y={-s - 6} width={2 * s + 12} height={2 * s + 12} stroke={SELECT_INK} strokeWidth={2} cornerRadius={8} />
        </>
      )}
      <Rect x={-s} y={-s} width={2 * s} height={2 * s} cornerRadius={6} fill={meta.color} shadowColor="#000" shadowOpacity={0.3} shadowBlur={4} />
      <Text text={meta.abbrev} width={2 * s} height={2 * s} offsetX={s} offsetY={s} align="center" verticalAlign="middle" fontStyle="bold" fontSize={meta.abbrev.length > 3 ? 10 : 13} fill="#fff" />
      <Text text={c.name} y={s + 3} width={140} offsetX={70} align="center" fontSize={11} fontStyle="bold" fill={meta.color} />
    </Group>
  );
}
