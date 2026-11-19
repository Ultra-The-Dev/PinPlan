"use client";
// Task pins on the plan (a plan overlay, see editor/overlays/registry.ts): a teardrop in the status colour with the
// task number. Tap to open the task; drag a selected pin to move it (logged in its history).
import { useMemo } from "react";
import { Circle, Group, Shape, Text } from "react-konva";
import { getAuthor } from "@/lib/photos";
import { useSyncStatus } from "@/lib/sync";
import { filterIsEmpty, isClosed, PIN_GREY, taskMatches, taskPinColor, taskPlacement } from "@/lib/tasks";
import { localDay } from "@/lib/fieldDocs";
import type { PlanTask } from "@/lib/types";
import type { PlanOverlayCtx } from "../editor/overlays/registry";
import { useProjectTasks, useTasks } from "./taskStore";

const R = 13; // head radius in screen px
const L = R * 1.9; // tip to head centre
const A = Math.acos(R / L);

export default function TaskPinsLayer({ sheet, projectId, scale }: PlanOverlayCtx & { scale: number }) {
  const tasks = useProjectTasks(projectId);
  const { filter, showPins, greyOthers, selectedId } = useTasks();
  const today = localDay(new Date().toISOString());
  const pins = useMemo(() => {
    const active = !filterIsEmpty(filter);
    return tasks
      .filter((t) => t.sheetId === sheet.id && taskPlacement(t) === "pin")
      .map((t) => ({ t, match: !active || taskMatches(t, filter, today) }))
      .filter((p) => p.match || greyOthers)
      // Matching pins on top of greyed ones; the selected pin on top of everything.
      .sort((a, b) => Number(a.match) - Number(b.match) || Number(a.t.id === selectedId) - Number(b.t.id === selectedId) || a.t.number - b.t.number);
  }, [tasks, sheet.id, filter, greyOthers, today, selectedId]);
  if (!showPins) return null;
  const inv = 1 / scale;
  return (
    <Group>
      {pins.map(({ t, match }) => (
        <TaskPin key={t.id} task={t} W={sheet.width} H={sheet.height} inv={inv} grey={!match} selected={t.id === selectedId} />
      ))}
    </Group>
  );
}

function TaskPin({ task, W, H, inv, grey, selected }: { task: PlanTask; W: number; H: number; inv: number; grey: boolean; selected: boolean }) {
  const color = grey ? PIN_GREY : taskPinColor(task);
  const label = String(task.number);
  const open = () => {
    useTasks.getState().set({ selectedId: task.id, detailId: task.id });
  };
  return (
    <Group
      x={(task.x ?? 0) * W}
      y={(task.y ?? 0) * H}
      scaleX={inv * (selected ? 1.15 : 1)}
      scaleY={inv * (selected ? 1.15 : 1)}
      opacity={grey ? 0.55 : 1}
      draggable={selected}
      onClick={(e) => {
        e.cancelBubble = true;
        open();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        open();
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        const x = Math.max(0, Math.min(1, e.target.x() / W));
        const y = Math.max(0, Math.min(1, e.target.y() / H));
        e.target.position({ x: x * W, y: y * H });
        void useTasks.getState().change(task.id, { x, y }, getAuthor(useSyncStatus.getState().email));
      }}
    >
      {selected && <Circle y={-L} radius={R + 7} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2.5} listening={false} />}
      <Shape
        sceneFunc={(ctx, s) => {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, -L, R, Math.PI / 2 + A, Math.PI / 2 - A + Math.PI * 2, false);
          ctx.closePath();
          ctx.fillStrokeShape(s);
        }}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        shadowColor="#000"
        shadowOpacity={0.35}
        shadowBlur={4}
        shadowOffsetY={1.5}
        hitStrokeWidth={12}
      />
      <Text
        text={label}
        x={-R}
        y={-L - R}
        width={R * 2}
        height={R * 2}
        align="center"
        verticalAlign="middle"
        fontStyle="bold"
        fontSize={label.length > 3 ? 9 : label.length > 2 ? 10.5 : 12.5}
        fill="#fff"
        listening={false}
      />
      {task.priority === 1 && !grey && !isClosed(task.status) && <Circle x={R * 0.8} y={-L - R * 0.8} radius={4} fill="#fff" stroke="#dc2626" strokeWidth={2.5} listening={false} />}
    </Group>
  );
}
