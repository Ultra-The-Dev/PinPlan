"use client";
// Crew board: who is on which job each day, across every job on this device (two weeks at a time). Red cells are
// overbooked — more than 8 planned hours, or two jobs the same day. Tap a job to open its schedule.
import { CalendarRange, ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { localDay } from "@/lib/fieldDocs";
import { getAuthor } from "@/lib/photos";
import { addDays, crewLoad, isWeekend, normalizeItem, weekStart } from "@/lib/schedule";
import { useSyncStatus } from "@/lib/sync";
import type { Project, ScheduleItem } from "@/lib/types";
import { TONE_CHIP } from "@/lib/statusStyle";
import { Avatar, fmtDay, jobColor } from "./shared";
import { useT } from "@/lib/i18n";

const DAYS = 14;

export default function CrewBoard() {
  const { email } = useSyncStatus();
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [byJob, setByJob] = useState<Record<string, ScheduleItem[]> | null>(null);
  const [today, setToday] = useState("");
  const [from, setFrom] = useState("");
  const [me, setMe] = useState("");
  const [who, setWho] = useState("__all");
  const scroller = useRef<HTMLDivElement>(null);
  const t = useT();

  const load = useCallback(async () => {
    const ps = (await db().projects.toArray()).filter((p) => !p.deleted);
    const live = new Set(ps.map((p) => p.id));
    const rows = (await db().scheduleItems.toArray()).filter((i) => !i.deleted && live.has(i.projectId)).map(normalizeItem);
    const m: Record<string, ScheduleItem[]> = {};
    for (const r of rows) (m[r.projectId] ??= []).push(r);
    setProjects(new Map(ps.map((p) => [p.id, p])));
    setByJob(m);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const d = localDay(new Date().toISOString());
      setToday(d);
      setFrom((f) => f || weekStart(d));
      setMe(getAuthor(email));
      void load();
    }, 0);
    const reload = () => void load();
    window.addEventListener("pinplan:synced", reload);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pinplan:synced", reload);
    };
  }, [load, email]);

  const to = from ? addDays(from, DAYS - 1) : "";
  const board = useMemo(() => (byJob && from ? crewLoad(byJob, from, to) : null), [byJob, from, to]);
  const people = useMemo(() => {
    if (!board) return [];
    const list = who === "__all" ? board.people : board.people.filter((p) => p.toLowerCase() === who.toLowerCase());
    // Me first.
    return [...list].sort((a, b) => Number(b.toLowerCase() === me.toLowerCase()) - Number(a.toLowerCase() === me.toLowerCase()));
  }, [board, who, me]);
  const overbooked = useMemo(() => {
    if (!board) return 0;
    let n = 0;
    for (const p of board.people) for (const c of Object.values(board.cells[p] ?? {})) if (c.overbooked) n++;
    return n;
  }, [board]);
  const unstaffed = useMemo(() => {
    if (!byJob || !from) return 0;
    return Object.values(byJob)
      .flat()
      .filter((i) => !(i.crew ?? []).length && i.end >= from && i.start <= to).length;
  }, [byJob, from, to]);

  // Phones show a few days at a time: bring today into view.
  const hasBoard = !!board && people.length > 0;
  useEffect(() => {
    const el = scroller.current;
    const th = el?.querySelector<HTMLElement>("th[data-today]");
    const first = el?.querySelector<HTMLElement>("thead th");
    if (el && th && first) el.scrollLeft = Math.max(0, th.offsetLeft - first.offsetWidth);
  }, [hasBoard, from, today]);

  const jobName = (id: string) => {
    const p = projects.get(id);
    return p?.clientName || p?.address || t("Job");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{t("Crew board")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Who is on which job, day by day, across every job. Red means double-booked or more than 8 hours.")}</p>
        </div>
        <select className="input h-9 w-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("Person")}>
          <option value="__all">{t("Everyone")}</option>
          {(board?.people ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button className="btn btn-sm btn-icon" onClick={() => setFrom((f) => addDays(f, -7))} aria-label={t("Previous week")}>
            <ChevronLeft />
          </button>
          <button className="btn btn-sm" onClick={() => setFrom(weekStart(today))} disabled={!today}>
            {t("This week")}
          </button>
          <button className="btn btn-sm btn-icon" onClick={() => setFrom((f) => addDays(f, 7))} aria-label={t("Next week")}>
            <ChevronRight />
          </button>
        </div>
      </div>

      {board && (overbooked > 0 || unstaffed > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {overbooked > 0 && <span className={`chip ${TONE_CHIP.bad}`}>{t.tn("{n} overbooked day", "{n} overbooked days", overbooked)}</span>}
          {unstaffed > 0 && <span className={`chip ${TONE_CHIP.warn}`}>{t.tn("{n} phase with no crew", "{n} phases with no crew", unstaffed)}</span>}
        </div>
      )}

      {!board && <div className="p-6 text-sm text-slate-500">{t("Loading…")}</div>}

      {board && board.people.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Users className="h-8 w-8 text-slate-300" />
          <div className="font-medium">{t("No one is scheduled these two weeks")}</div>
          <p className="max-w-md text-sm text-slate-500">
            {t("On a job, open Field → Schedule, add phases (or start from a template) and pick the crew for each. They show up here.")}
          </p>
        </div>
      )}

      {board && people.length > 0 && (
        <div ref={scroller} className="card scroll-thin overflow-x-auto" data-testid="crew-board">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-12 border-b border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-500"><span className="hidden sm:inline">{t("Person")}</span></th>
                {board.days.map((d) => (
                  <th
                    key={d}
                    data-today={d === today ? "" : undefined}
                    className={`min-w-24 border-b border-l border-slate-200 px-1.5 py-2 text-left text-[11px] font-medium ${d === today ? "bg-brand-50 text-brand-700" : isWeekend(d) ? "bg-slate-50 text-slate-400" : "text-slate-500"}`}
                  >
                    {fmtDay(d, { weekday: "short" })} <span className="tabular-nums">{fmtDay(d, { month: "numeric", day: "numeric" })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-2 text-left font-medium sm:min-w-40 sm:px-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={p} size="md" />
                      <span className="hidden truncate sm:inline">{p}</span>
                      {p.toLowerCase() === me.toLowerCase() && <span className="hidden text-xs font-normal text-slate-400 sm:inline">{t("(you)")}</span>}
                    </span>
                  </th>
                  {board.days.map((d) => {
                    const cell = board.cells[p]?.[d];
                    const jobs = cell ? [...new Map(cell.jobs.map((j) => [j.projectId, j])).values()] : [];
                    return (
                      <td
                        key={d}
                        data-testid={cell?.overbooked ? "overbooked" : undefined}
                        title={cell ? `${cell.jobs.map((j) => `${jobName(j.projectId)} — ${j.name}`).join("\n")}${cell.hours ? `\n${t("{n} h planned", { n: cell.hours })}` : ""}` : undefined}
                        className={`h-14 border-b border-l border-slate-100 p-1 align-top ${cell?.overbooked ? "bg-red-50 ring-1 ring-red-300 ring-inset" : isWeekend(d) ? "bg-slate-50/70" : ""}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          {jobs.map((j) => (
                            <Link
                              key={j.projectId}
                              href={`/project?id=${j.projectId}&tab=field&section=schedule`}
                              className="block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight font-medium text-white hover:opacity-90"
                              style={{ background: jobColor(j.projectId) }}
                            >
                              {jobName(j.projectId)}
                              <span className="block truncate font-normal opacity-85">{j.name}</span>
                            </Link>
                          ))}
                          {cell && cell.hours > 0 && <span className={`px-1 text-[10px] tabular-nums ${cell.hours > 8 ? "font-semibold text-red-700" : "text-slate-400"}`}>{t("{n} h", { n: cell.hours })}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <CalendarRange className="h-3.5 w-3.5" /> {t("Planned hours are spread evenly over a phase’s workdays and its crew. Holidays aren’t counted.")}
      </p>
    </div>
  );
}
