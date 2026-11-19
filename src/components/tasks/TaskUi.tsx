"use client";
// Small shared pieces of the task screens: who I am, people and categories to pick, badges and chips.
import { useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { teamNames } from "@/lib/fieldDocs";
import { importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useRole, useTeam } from "@/lib/team";
import { useMe } from "@/lib/useMe";
import { isOverdue, priorityInfo, statusInfo, taskCategoryOptions, taskPlacement } from "@/lib/tasks";
import { tradeCategories, tradePack } from "@/lib/trades";
import type { Photo, PlanTask } from "@/lib/types";
import { useTrades } from "@/lib/useTrades";

/** Me (name on photos and comments) and all my names (for "Mine"), my team role, the people to assign and the categories to offer. */
export function useTaskOptions(tasks: PlanTask[]) {
  const role = useRole();
  const members = useTeam((s) => s.members);
  const trades = useTrades();
  const { photos, jobLogs, checklists } = useEditor();
  const { me, names: myNames } = useMe();
  const people = useMemo(() => {
    const names = teamNames({ photos, jobLogs, checklists, members }, me);
    for (const t of tasks) if (t.assignee?.trim() && !names.some((n) => n.toLowerCase() === t.assignee!.trim().toLowerCase())) names.push(t.assignee.trim());
    // Me first, then everyone else A–Z.
    return [me, ...names.filter((n) => n.toLowerCase() !== me.toLowerCase()).sort((a, b) => a.localeCompare(b))];
  }, [photos, jobLogs, checklists, members, me, tasks]);
  const categories = useMemo(
    () => taskCategoryOptions([...trades.map((t) => tradePack(t).short), ...tradeCategories(trades).map((c) => c.name)], tasks),
    [trades, tasks],
  );
  return { me, myNames, role, people, categories };
}

/**
 * Pick a team member (no free text): the team, then names already on the job. "Unassigned" clears it. A name that is
 * set but not in the list (an older task) stays selectable so it isn't lost.
 */
export function PersonSelect({ value, onChange, people, className = "input h-11", label = "Assign" }: { value: string; onChange: (v: string) => void; people: string[]; className?: string; label?: string }) {
  const list = value && !people.some((p) => p.toLowerCase() === value.toLowerCase()) ? [value, ...people] : people;
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Unassigned</option>
      {list.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

/** Save picked/captured files as job photos tied to the task's sheet and room. Returns the new photos. */
export async function saveTaskPhotos(files: FileList | File[], task: Pick<PlanTask, "projectId" | "sheetId" | "room" | "number" | "title">, author: string): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const f of [...files]) {
    const p = await importPhoto(f, {
      projectId: task.projectId,
      author,
      extra: { sheetId: task.sheetId ?? null, room: task.room ?? null, caption: `#${task.number} ${task.title}`.trim(), tags: ["Task"] },
    });
    out.push(await useEditor.getState().saveRow("photos", p));
  }
  return out;
}

/** The task's number in its status colour: a teardrop pin, a diamond (on a sheet, no spot) or a square (general). */
export function TaskBadge({ task, size = 28 }: { task: Pick<PlanTask, "number" | "status" | "sheetId" | "x" | "y">; size?: number }) {
  const color = statusInfo(task.status).color;
  const place = taskPlacement(task);
  const label = String(task.number);
  const fs = label.length > 3 ? size * 0.32 : size * 0.4;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={statusInfo(task.status).label}>
      <svg viewBox="0 0 28 28" width={size} height={size} className="absolute inset-0" aria-hidden>
        {place === "pin" ? (
          <path d="M14 27 C 9 20, 3.5 16, 3.5 10.5 A 10.5 10.5 0 1 1 24.5 10.5 C 24.5 16, 19 20, 14 27 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
        ) : place === "sheet" ? (
          <path d="M14 1.5 L26.5 14 L14 26.5 L1.5 14 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
        ) : (
          <rect x="2" y="2" width="24" height="24" rx="6" fill={color} stroke="#fff" strokeWidth="1.5" />
        )}
      </svg>
      <span className="relative font-bold text-white tabular-nums" style={{ fontSize: fs, marginTop: place === "pin" ? -size * 0.16 : 0 }}>
        {label}
      </span>
    </span>
  );
}

export function StatusPill({ status }: { status: PlanTask["status"] }) {
  const s = statusInfo(status);
  return (
    <span className="chip text-white" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: PlanTask["priority"] }) {
  const p = priorityInfo(priority);
  if (!p) return null;
  return (
    <span className="chip ring-1" style={{ color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}55` }}>
      {p.label}
    </span>
  );
}

export const dueText = (due: string) => new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DueText({ task, today }: { task: Pick<PlanTask, "due" | "status">; today: string }) {
  if (!task.due) return null;
  return <span className={today && isOverdue(task, today) ? "font-semibold text-red-600" : ""}>Due {dueText(task.due)}</span>;
}

/** A big, glove-friendly toggle chip. */
export function Chip(props: { on: boolean; onClick: () => void; color?: string; children: ReactNode; title?: string; disabled?: boolean; small?: boolean }) {
  const { on, color } = props;
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      aria-pressed={on}
      onClick={props.onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition select-none active:scale-[0.97] disabled:opacity-40 ${
        props.small ? "h-8 px-3 text-xs" : "h-10 px-3.5 text-sm"
      } ${on ? "text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
      style={on ? { background: color ?? "#161616", borderColor: color ?? "#161616" } : undefined}
    >
      {color && !on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {props.children}
    </button>
  );
}

/** Task sheets open over everything (the plan's toolbar strip is its own stacking context, under the app header). */
export function Portal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
