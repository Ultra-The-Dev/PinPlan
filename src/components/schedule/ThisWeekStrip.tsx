"use client";
// My Tasks: the schedule phases this week that `me` is on the crew of, across jobs.
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { localDay } from "@/lib/fieldDocs";
import { addDays, normalizeItem, onCrew, weekStart } from "@/lib/schedule";
import type { Project, ScheduleItem } from "@/lib/types";
import { DEFAULT_BAR, fmtRange, ProgressBar } from "./shared";

export default function ThisWeekStrip({ me }: { me: string }) {
  const [rows, setRows] = useState<{ item: ScheduleItem; project: Project }[]>([]);

  const load = useCallback(async () => {
    const from = weekStart(localDay(new Date().toISOString()));
    const to = addDays(from, 6);
    const items = (await db().scheduleItems.where("start").belowOrEqual(to).toArray()).map(normalizeItem).filter((i) => !i.deleted && i.end >= from && onCrew(i, me));
    const ps = items.length ? await db().projects.bulkGet([...new Set(items.map((i) => i.projectId))]) : [];
    const byId = new Map(ps.filter((p): p is Project => !!p && !p.deleted).map((p) => [p.id, p]));
    setRows(
      items
        .filter((i) => byId.has(i.projectId))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((item) => ({ item, project: byId.get(item.projectId)! })),
    );
  }, [me]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    const reload = () => void load();
    window.addEventListener("pinplan:synced", reload);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:synced", reload);
    };
  }, [load]);

  if (!rows.length) return null;
  return (
    <section aria-label="This week on the schedule">
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <CalendarRange className="h-3.5 w-3.5" /> This week · {rows.length}
        <Link href="/schedule" className="ml-auto font-medium tracking-normal text-brand-600 normal-case hover:underline">
          Crew board
        </Link>
      </h2>
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {rows.map(({ item, project }) => (
          <Link key={item.id} href={`/project?id=${project.id}&tab=field&section=schedule`} className="card block w-56 shrink-0 p-3 hover:ring-1 hover:ring-slate-200">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color || DEFAULT_BAR }} />
              <span className="truncate text-sm font-medium">{item.name}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">{project.address || project.clientName || "Job"}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{fmtRange(item.start, item.end)}</span>
            <span className="mt-2 flex items-center gap-2">
              <ProgressBar value={item.progress ?? 0} color={item.color || DEFAULT_BAR} />
              <span className="text-[11px] text-slate-500 tabular-nums">{Math.round(item.progress ?? 0)}%</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
