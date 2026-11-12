"use client";
import { Circle, Group, Rect, Text } from "react-konva";
import { useEditor } from "@/lib/store";
import { useSuggestions } from "@/lib/suggestions";
import type { Suggestion } from "@/lib/types";

/**
 * AI suggestions drawn as semi-transparent dashed "ghost" markers on top of a sheet.
 * Sizes are divided by the stage scale so ghosts keep a constant on-screen size.
 * Tap toggles selection; drag moves the suggestion. Nothing here touches the takeoff.
 */
export default function GhostLayer({ sheetId, width, height, scale }: { sheetId: string; width: number; height: number; scale: number }) {
  const items = useSuggestions((s) => s.items);
  const selectedIds = useSuggestions((s) => s.selectedIds);
  const catalog = useEditor((s) => s.catalog);
  const k = 1 / (scale || 1);
  const ghosts = items.filter((i) => i.sheetId === sheetId);

  return (
    <Group>
      {ghosts.map((g) => (
        <Ghost
          key={g.id}
          g={g}
          x={g.x * width}
          y={g.y * height}
          k={k}
          selected={selectedIds.includes(g.id)}
          color={catalog.find((d) => d.id === g.deviceTypeId)?.color ?? (g.kind === "led" ? "#d97706" : "#6b7280")}
          symbol={g.kind === "led" ? `Z${g.zone || "?"}` : (catalog.find((d) => d.id === g.deviceTypeId)?.symbol ?? (g.symbolText || "?"))}
          onDragEnd={(x, y) => useSuggestions.getState().move(g.id, x / width, y / height)}
        />
      ))}
    </Group>
  );
}

function Ghost({
  g,
  x,
  y,
  k,
  selected,
  color,
  symbol,
  onDragEnd,
}: {
  g: Suggestion;
  x: number;
  y: number;
  k: number;
  selected: boolean;
  color: string;
  symbol: string;
  onDragEnd: (x: number, y: number) => void;
}) {
  const r = 14 * k;
  const pct = `${Math.round(g.confidence * 100)}%`;
  const caption = g.kind === "led" ? `${g.lf != null ? `${g.lf} LF` : "? LF"}${g.switchLabel ? ` ${g.switchLabel}` : ""} · ${pct}` : pct;
  const toggle = (e: { cancelBubble: boolean }) => {
    e.cancelBubble = true;
    useSuggestions.getState().toggleSelect(g.id);
  };
  return (
    <Group
      x={x}
      y={y}
      draggable
      onClick={toggle}
      onTap={toggle}
      onDragStart={(e) => (e.cancelBubble = true)}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onDragEnd(e.target.x(), e.target.y());
      }}
    >
      {selected && <Circle radius={r + 6 * k} stroke="#2563eb" strokeWidth={3 * k} />}
      {g.kind === "led" ? (
        <Rect
          width={1.5 * r}
          height={1.5 * r}
          offsetX={0.75 * r}
          offsetY={0.75 * r}
          rotation={45}
          fill={color}
          opacity={0.35}
          stroke={color}
          strokeWidth={2 * k}
          dash={[4 * k, 3 * k]}
        />
      ) : (
        <Circle radius={r} fill={color} opacity={0.3} stroke={color} strokeWidth={2 * k} dash={[4 * k, 3 * k]} />
      )}
      <Text
        text={symbol}
        fontSize={11 * k}
        fontStyle="bold"
        fill={color}
        width={2 * r}
        height={2 * r}
        x={-r}
        y={-r}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
      <Text text={caption} fontSize={10 * k} fill="#374151" x={r + 3 * k} y={-5 * k} listening={false} />
    </Group>
  );
}
