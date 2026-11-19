"use client";
// Saved measurements drawn on the plan (Konva, sheet image pixels; the stage transform is already applied).
// Lines keep their on-screen width (strokeScaleEnabled=false); labels and vertices keep their on-screen size
// (name="cs", rescaled by the viewport on every zoom). Nothing here listens: taps go through the overlay's onTap.
import { useLayoutEffect, useMemo } from "react";
import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import { areaSqFt, formatFeetInches, formatSqFt, formatValue, labelAnchor, lengthFt, measurementValue, toPx } from "@/lib/measure";
import { useMeasurements } from "@/lib/measurements";
import { CONSTANT_SIZE, type PlanViewport } from "@/lib/planViewport";
import type { Measurement, Sheet } from "@/lib/types";
import { useMeasureUi } from "./measureUi";

const flat = (p: { x: number; y: number }[]) => p.flatMap((q) => [q.x, q.y]);

function Tagged({ x, y, text, color, strong }: { x: number; y: number; text: string; color: string; strong?: boolean }) {
  return (
    <Group name={CONSTANT_SIZE} x={x} y={y} listening={false}>
      <Label offsetY={-2} listening={false}>
        <Tag fill={strong ? color : "#ffffff"} stroke={color} strokeWidth={1.25} cornerRadius={5} pointerDirection="down" pointerWidth={8} pointerHeight={5} shadowColor="#000" shadowOpacity={0.15} shadowBlur={4} shadowOffsetY={1} listening={false} />
        <Text text={text} fontSize={12.5} fontStyle="600" fontFamily="ui-sans-serif, system-ui, sans-serif" padding={5} fill={strong ? "#ffffff" : "#0f172a"} listening={false} />
      </Label>
    </Group>
  );
}

function Shape({ m, sheet, selected }: { m: Measurement; sheet: Sheet; selected: boolean }) {
  const color = m.color || "#e11d48";
  const pts = toPx(m.points, sheet);
  const v = measurementValue(m, sheet);
  const at = labelAnchor(m.kind, pts);
  const name = m.label?.trim();
  const text = v ? `${name ? `${name} · ` : ""}${formatValue(v)}${v.warning ? " ⚠" : ""}` : `${name ? `${name} · ` : ""}no scale`;
  const area = m.kind === "area";
  return (
    <>
      {selected && <Line points={flat(pts)} closed={area} stroke="#ffffff" strokeWidth={9} opacity={0.85} lineCap="round" lineJoin="round" strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />}
      <Line
        points={flat(pts)}
        closed={area}
        fill={area ? `${color}2e` : undefined}
        stroke={color}
        strokeWidth={selected ? 4 : 2.75}
        lineCap="round"
        lineJoin="round"
        strokeScaleEnabled={false}
        listening={false}
        perfectDrawEnabled={false}
      />
      {(selected || m.kind !== "area") &&
        pts.map((p, i) =>
          selected || i === 0 || i === pts.length - 1 ? (
            <Circle key={i} name={CONSTANT_SIZE} x={p.x} y={p.y} radius={selected ? 5 : 3.5} fill={selected ? "#ffffff" : color} stroke={color} strokeWidth={selected ? 2 : 0} listening={false} />
          ) : null,
        )}
      {at && <Tagged x={at.x} y={at.y} text={text} color={color} strong={selected} />}
    </>
  );
}

function Draft({ sheet }: { sheet: Sheet }) {
  const { draft, draftSheetId, hover, kind, color, label } = useMeasureUi();
  if (draftSheetId !== sheet.id || !draft.length) return null;
  const pts = toPx(draft, sheet);
  const last = pts[pts.length - 1];
  const hv = hover ? { x: hover.x * sheet.width, y: hover.y * sheet.height } : null;
  const live = kind === "length" && pts.length >= 2 ? pts : hv ? [...pts, hv] : pts;
  const rel = live.flatMap((p) => [p.x / sheet.width, p.y / sheet.height]);
  const area = kind === "area";
  const value = area ? (live.length >= 3 ? areaSqFt(rel, sheet) : null) : lengthFt(rel, sheet);
  const text = `${label.trim() ? `${label.trim()} · ` : ""}${value == null ? (sheet.pxPerFt ? "…" : "no scale") : area ? formatSqFt(value) : formatFeetInches(value)}`;
  const tagAt = hv ?? last;
  return (
    <>
      {area && live.length >= 3 && <Line points={flat(live)} closed fill={`${color}24`} listening={false} perfectDrawEnabled={false} />}
      <Line points={flat(pts)} stroke={color} strokeWidth={3} lineCap="round" lineJoin="round" strokeScaleEnabled={false} listening={false} />
      {hv && !(kind === "length" && pts.length >= 2) && <Line points={[last.x, last.y, hv.x, hv.y]} stroke={color} strokeWidth={2} dash={[7, 6]} strokeScaleEnabled={false} listening={false} />}
      {area && pts.length >= 2 && <Line points={[(hv ?? last).x, (hv ?? last).y, pts[0].x, pts[0].y]} stroke={color} strokeWidth={1.5} dash={[3, 5]} opacity={0.8} strokeScaleEnabled={false} listening={false} />}
      {pts.map((p, i) => (
        <Circle key={i} name={CONSTANT_SIZE} x={p.x} y={p.y} radius={i === 0 && area && pts.length >= 3 ? 9 : 5} fill={i === 0 && area && pts.length >= 3 ? `${color}55` : "#ffffff"} stroke={color} strokeWidth={2} listening={false} />
      ))}
      <Tagged x={tagAt.x} y={tagAt.y} text={text} color={color} strong />
    </>
  );
}

/** Every saved measurement on this sheet, plus the one being drawn. */
export default function MeasureLayer({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const rows = useMeasurements((s) => s.rows);
  // Whole-store subscription on purpose: the draft and hover re-render this, so the layout effect below sizes new nodes.
  const { visible, selectedId } = useMeasureUi();
  const mine = useMemo(() => rows.filter((m) => m.sheetId === sheet.id && !m.deleted), [rows, sheet.id]);
  // New constant-size nodes start at scale 1: size them for the current zoom, then draw.
  useLayoutEffect(() => {
    viewport.updateConstantSize();
    viewport.redraw();
  });
  return (
    <Group listening={false}>
      {visible && mine.map((m) => <Shape key={m.id} m={m} sheet={sheet} selected={m.id === selectedId} />)}
      <Draft sheet={sheet} />
    </Group>
  );
}
