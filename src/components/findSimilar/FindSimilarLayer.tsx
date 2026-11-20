"use client";
// Find similar's ghost pins on the plan (Konva side of the overlay, registerOverlay.ts): a dashed circle in the
// device type's colour with its letters, a constant size on screen (name="cs"); rejected ones grey and crossed out;
// the one under review haloed. Also the symbol that was searched for, and the box being dragged. The layer doesn't
// listen: taps arrive through the overlay (findSimilarInput.ts), which hit-tests with GHOST_R.
import { useLayoutEffect } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import { DRAFT, DRAFT_DASH, SELECT_HALO, SELECT_HALO_FILL, SELECT_INK } from "@/lib/canvasColors";
import { CONSTANT_SIZE, type PlanViewport } from "@/lib/planViewport";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { shownFinds, useFindSimilar } from "./findSimilarStore";

/** Ghost radius, screen px at size factor 1. */
export const GHOST_R = 12;
const GREY = "#94a3b8";

export default function FindSimilarLayer({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const st = useFindSimilar();
  const markers = useEditor((s) => s.markers);
  const type = useEditor((s) => s.catalog.find((d) => d.id === st.typeId));
  const shown = shownFinds(st, markers, sheet);
  const current = st.review != null ? shown[st.review] : undefined;
  useLayoutEffect(() => {
    viewport.updateConstantSize();
  });
  if (!st.open) return null;
  const color = type?.color ?? "#475569";
  const letters = type?.symbol ?? "?";
  const k = 1 / (viewport.transform.scale || 1);
  const drag = st.drag;
  return (
    <Group listening={false}>
      {st.template && st.sheetId === sheet.id && st.source === "match" && (
        <Rect x={st.template.x} y={st.template.y} width={st.template.w} height={st.template.h} stroke={DRAFT} strokeWidth={2} strokeScaleEnabled={false} dash={DRAFT_DASH.map((d) => d * k)} />
      )}
      {drag && (
        <Rect
          x={Math.min(drag.a.x, drag.b.x) * sheet.width}
          y={Math.min(drag.a.y, drag.b.y) * sheet.height}
          width={Math.abs(drag.a.x - drag.b.x) * sheet.width}
          height={Math.abs(drag.a.y - drag.b.y) * sheet.height}
          stroke={DRAFT}
          strokeWidth={2}
          strokeScaleEnabled={false}
          dash={DRAFT_DASH.map((d) => d * k)}
          fill="rgba(51,169,255,0.08)"
        />
      )}
      {shown.map((f) => {
        const on = current?.id === f.id;
        const c = f.rejected ? GREY : color;
        return (
          <Group key={f.id} name={CONSTANT_SIZE} x={f.x * sheet.width} y={f.y * sheet.height} opacity={f.rejected ? 0.6 : 1}>
            {on && <Circle radius={GHOST_R + 7} fill={SELECT_HALO_FILL} stroke={SELECT_HALO} strokeWidth={3} />}
            <Circle radius={GHOST_R} fill="rgba(255,255,255,0.75)" stroke={on ? SELECT_INK : c} strokeWidth={2} dash={[4, 3]} />
            <Text text={letters} x={-GHOST_R} y={-GHOST_R} width={GHOST_R * 2} height={GHOST_R * 2} align="center" verticalAlign="middle" fontStyle="bold" fontSize={letters.length > 2 ? 7.5 : 10.5} fill={c} />
            {f.rejected && <Line points={[-GHOST_R * 0.8, GHOST_R * 0.8, GHOST_R * 0.8, -GHOST_R * 0.8]} stroke={GREY} strokeWidth={2} />}
            {f.tag && <Text text={f.tag} x={GHOST_R + 3} y={-6} fontSize={10.5} fontStyle="bold" fill={c} />}
          </Group>
        );
      })}
    </Group>
  );
}
