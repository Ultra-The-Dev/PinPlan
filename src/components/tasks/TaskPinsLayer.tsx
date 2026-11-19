"use client";
// Task pins on the plan (Konva side of the tasks plan overlay, see registerOverlay.ts): a teardrop in the status
// colour with the task number, a constant size on screen (name="cs", like devices). The layer doesn't listen: taps
// and drags arrive through the overlay (taskInput.ts), which hit-tests with the same geometry (pinGeometry).
import { useLayoutEffect, useMemo } from "react";
import { Circle, Group, Shape, Text } from "react-konva";
import { CONSTANT_SIZE, type PlanViewport } from "@/lib/planViewport";
import { filterIsEmpty, isClosed, PIN_GREY, taskMatches, taskPinColor, taskPlacement } from "@/lib/tasks";
import { localDay } from "@/lib/fieldDocs";
import type { PlanTask, Sheet } from "@/lib/types";
import { useProjectTasks, useTaskDrag, useTasks } from "./taskStore";

/** Head radius and tip-to-head-centre distance, in screen px at size factor 1. */
export const PIN_R = 13;
export const PIN_L = PIN_R * 1.9;
export const PIN_SELECTED_SCALE = 1.15;
const A = Math.acos(PIN_R / PIN_L);

/** The pins shown on a sheet, bottom to top (the selected pin last, i.e. on top). */
export function shownPins(tasks: PlanTask[], sheetId: string, st: { filter: ReturnType<typeof useTasks.getState>["filter"]; greyOthers: boolean; selectedId: string | null }, today: string) {
  const active = !filterIsEmpty(st.filter);
  return (
    tasks
      .filter((t) => t.sheetId === sheetId && !t.deleted && taskPlacement(t) === "pin")
      .map((t) => ({ t, match: !active || taskMatches(t, st.filter, today) }))
      .filter((p) => p.match || st.greyOthers)
      // Matching pins on top of greyed ones; the selected pin on top of everything.
      .sort((a, b) => Number(a.match) - Number(b.match) || Number(a.t.id === st.selectedId) - Number(b.t.id === st.selectedId) || a.t.number - b.t.number)
  );
}

export default function TaskPinsLayer({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const tasks = useProjectTasks(sheet.projectId);
  const { filter, showPins, greyOthers, selectedId } = useTasks();
  const drag = useTaskDrag((s) => s.drag);
  const today = localDay(new Date().toISOString());
  const pins = useMemo(() => shownPins(tasks, sheet.id, { filter, greyOthers, selectedId }, today), [tasks, sheet.id, filter, greyOthers, today, selectedId]);
  // New pins start at scale 1: give them the constant on-screen size now.
  useLayoutEffect(() => {
    viewport.updateConstantSize();
  });
  if (!showPins) return null;
  return (
    <Group>
      {pins.map(({ t, match }) => {
        const at = drag?.id === t.id ? drag : t;
        return <TaskPin key={t.id} task={t} x={(at.x ?? 0) * sheet.width} y={(at.y ?? 0) * sheet.height} grey={!match} selected={t.id === selectedId} />;
      })}
    </Group>
  );
}

function TaskPin({ task, x, y, grey, selected }: { task: PlanTask; x: number; y: number; grey: boolean; selected: boolean }) {
  const color = grey ? PIN_GREY : taskPinColor(task);
  const label = String(task.number);
  const k = selected ? PIN_SELECTED_SCALE : 1;
  return (
    <Group name={CONSTANT_SIZE} x={x} y={y} opacity={grey ? 0.55 : 1} listening={false}>
      <Group scaleX={k} scaleY={k}>
        {selected && <Circle y={-PIN_L} radius={PIN_R + 7} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2.5} />}
        <Shape
          sceneFunc={(ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, -PIN_L, PIN_R, Math.PI / 2 + A, Math.PI / 2 - A + Math.PI * 2, false);
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
        />
        <Text
          text={label}
          x={-PIN_R}
          y={-PIN_L - PIN_R}
          width={PIN_R * 2}
          height={PIN_R * 2}
          align="center"
          verticalAlign="middle"
          fontStyle="bold"
          fontSize={label.length > 3 ? 9 : label.length > 2 ? 10.5 : 12.5}
          fill="#fff"
        />
        {task.priority === 1 && !grey && !isClosed(task.status) && <Circle x={PIN_R * 0.8} y={-PIN_L - PIN_R * 0.8} radius={4} fill="#fff" stroke="#dc2626" strokeWidth={2.5} />}
      </Group>
    </Group>
  );
}
