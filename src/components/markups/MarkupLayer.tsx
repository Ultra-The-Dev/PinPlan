"use client";
// Plan markups drawn on the sheet (Konva side of the markups plan overlay, in sheet pixels, above the devices). The
// layer doesn't listen: drawing, selecting, moving and resizing arrive through the overlay (markupInput.ts), which
// also feeds the stroke being drawn and the markup being moved (useMarkupLive).
import { useEffect, useMemo } from "react";
import { Circle, Ellipse, Group, Line, Rect, Text } from "react-konva";
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
  STROKE_SIZES,
  TEXT_PAD,
  textBoxPx,
  textLines,
  toPx,
  visibleMarkups,
} from "@/lib/markups";
import { useViewTransform } from "@/lib/planOverlays";
import type { PlanViewport } from "@/lib/planViewport";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import type { PlanMarkup, Sheet } from "@/lib/types";
import { useMarkupLive } from "./markupInput";
import { useMarkups } from "./useMarkups";

export default function MarkupLayer({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const W = sheet.width;
  const H = sheet.height;
  const projectId = sheet.projectId;
  const { items, tool, selectedId, hiddenLayers, allHidden, color } = useMarkups();
  const { drawing, preview } = useMarkupLive();
  const userId = useSyncStatus((s) => s.userId);
  const role = useRole();

  useEffect(() => {
    void useMarkups.getState().load(projectId);
  }, [projectId]);

  const shown = useMemo(
    () => (allHidden ? [] : visibleMarkups(items.filter((m) => m.sheetId === sheet.id), { userId, hiddenLayers })),
    [items, sheet.id, userId, hiddenLayers, allHidden],
  );

  const drawn = preview ? shown.map((m) => (m.id === preview.id ? preview : m)) : shown;
  const selected = drawn.find((m) => m.id === selectedId);
  const live = drawing && tool !== "select" && tool !== "text" ? (useMarkups.getState().draft(tool, sheet.id, drawing) ?? null) : null;

  return (
    <Group listening={false}>
      {drawn.map((m) => (
        <MarkupShape key={m.id} m={m} W={W} H={H} />
      ))}
      {live && <MarkupShape m={live} W={W} H={H} />}
      {drawing && tool === "text" && <ScreenDot x={drawing[0] * W} y={drawing[1] * H} color={color} viewport={viewport} />}
      {selected && <Selection m={selected} W={W} H={H} viewport={viewport} editable={canEditMarkup(role, selected, userId)} />}
    </Group>
  );
}

function ScreenDot({ x, y, color, viewport }: { x: number; y: number; color: string; viewport: PlanViewport }) {
  const inv = 1 / useViewTransform(viewport).t.scale;
  return <Circle x={x} y={y} radius={6 * inv} fill={color} />;
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

/** Dashed box and handles around the selected markup, a constant size on screen (re-renders while the view moves). */
function Selection({ m, W, H, viewport, editable }: { m: PlanMarkup; W: number; H: number; viewport: PlanViewport; editable: boolean }) {
  const inv = 1 / useViewTransform(viewport).t.scale;
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
