"use client";
// Plan hyperlinks drawn on the sheet (Konva, sheet image px): red translucent rounded boxes, the Fieldwire convention.
// Grey dashed = the target was deleted. Blue = the link being edited. Hit testing is in registerOverlay (onTap).
import { useMemo } from "react";
import { Group, Rect } from "react-konva";
import { brokenReason } from "@/lib/sheetIndex";
import { useJobLinks, useSheetLinks, visibleLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";

export default function LinksLayer({ sheet }: { sheet: Sheet }) {
  const all = useJobLinks();
  const visible = useSheetLinks((s) => s.visible);
  const showAuto = useSheetLinks((s) => s.showAuto);
  const drawing = useSheetLinks((s) => s.drawing);
  const editingId = useSheetLinks((s) => s.editingId);
  const sheets = useEditor((s) => s.sheets);
  const documents = useEditor((s) => s.documents);
  const photos = useEditor((s) => s.photos);
  const W = sheet.width;
  const H = sheet.height;
  const items = useMemo(() => {
    // While drawing links, show every link of the sheet (also hidden auto ones) so they aren't drawn twice.
    const shown = visibleLinks(all, sheet.id, drawing ? { visible: true, showAuto: true } : { visible, showAuto });
    return shown.map((l) => ({ l, broken: !!brokenReason(l, { sheets, documents, photos }) }));
  }, [all, sheet.id, visible, showAuto, drawing, sheets, documents, photos]);
  if (!items.length) return null;
  return (
    <Group listening={false}>
      {items.map(({ l, broken }) => {
        const w = l.w * W;
        const h = l.h * H;
        const sel = l.id === editingId;
        return (
          <Rect
            key={l.id}
            x={l.x * W}
            y={l.y * H}
            width={w}
            height={h}
            cornerRadius={Math.min(w, h) * 0.22}
            fill={sel ? "rgba(37,99,235,0.18)" : broken ? "rgba(148,163,184,0.22)" : "rgba(239,68,68,0.16)"}
            stroke={sel ? "#2563eb" : broken ? "#94a3b8" : "#ef4444"}
            strokeWidth={sel ? 2.5 : 1.75}
            strokeScaleEnabled={false}
            dash={broken ? [4, 3] : undefined}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })}
    </Group>
  );
}
