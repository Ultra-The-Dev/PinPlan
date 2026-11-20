"use client";
// Field: Today · Checklists & forms · Daily log · Files · More (RFIs, Schedule, Install progress, History). The section
// lives in the address (&section=…) so a reload, the back button and links from /tasks land on the same place. Tasks
// and Photos are job tabs of their own (docs/navigation.md); old section=tasks / section=photos links open those tabs.
import { BookOpen, ClipboardCheck, Ellipsis, FileStack, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { pickFieldSection, type FieldSection } from "@/lib/fieldDocs";
import { useEditor } from "@/lib/store";
import { switchTabQuery } from "@/lib/tabRoutes";
import { msg, useT } from "@/lib/i18n";
import { tourAnchor } from "@/lib/tour/anchors";
import ScheduleView from "../schedule/ScheduleView";
import Checklists from "./Checklists";
import DailyLogs from "./DailyLogs";
import Documents from "./Documents";
import Timeline from "./Timeline";
import TodayCard from "./TodayCard";
import RfiList from "../rfis/RfiList";
import FormsList from "../forms/FormsList";
import ProgressPanel from "../progress/ProgressPanel";

const NAV: { id: string; label: string; icon: typeof Sun; sections: FieldSection[] }[] = [
  { id: "today", label: msg("Today"), icon: Sun, sections: ["today"] },
  { id: "checklists", label: msg("Checklists & forms"), icon: ClipboardCheck, sections: ["checklists", "forms"] },
  { id: "logs", label: msg("Daily log"), icon: BookOpen, sections: ["logs"] },
  { id: "files", label: msg("Files"), icon: FileStack, sections: ["files"] },
  { id: "more", label: msg("More"), icon: Ellipsis, sections: ["rfis", "schedule", "progress", "timeline"] },
];

const SUB: Partial<Record<string, { id: FieldSection; label: string }[]>> = {
  checklists: [
    { id: "checklists", label: msg("Checklists") },
    { id: "forms", label: msg("Forms") },
  ],
  more: [
    { id: "rfis", label: msg("RFIs") },
    { id: "schedule", label: msg("Schedule") },
    { id: "progress", label: msg("Install progress") },
    { id: "timeline", label: msg("History") },
  ],
};

export default function FieldTab() {
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();
  const project = useEditor((s) => s.project);
  const section = pickFieldSection(params.get("section"));
  // Tasks and photos are tabs of their own (the job page redirects old links); fall back rather than crash.
  const nav = NAV.find((n) => n.sections.includes(section)) ?? NAV[0];
  const sub = SUB[nav.id];

  /** Switch section (and pass extra params such as log=today); params that belong to another section are dropped. */
  const open = (s: string, extra: Record<string, string> = {}) => {
    // The Today card links to a task or photo: those open their own tab.
    if (s === "tasks" || s === "photos") return router.replace(`/project?${switchTabQuery(params.toString(), s, extra)}`, { scroll: false });
    const q = new URLSearchParams(params.toString());
    for (const k of ["task", "log", "form", "cl", "item"]) q.delete(k);
    if (s !== "tasks") q.delete("tf");
    q.set("section", s);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    router.replace(`/project?${q.toString()}`, { scroll: false });
  };

  if (!project) return null;
  return (
    <div className="h-full overflow-auto">
      <div className={`mx-auto ${section === "schedule" ? "max-w-6xl" : "max-w-4xl"} space-y-5 px-4 py-6 sm:px-6`}>
        <div className="space-y-3">
          <div>
            <h2 className="page-title">{t("Field")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("What to do today, checklists, the daily log and files for this job.")}</p>
          </div>
          {/* Labelled at every width. Phones: a 3×2 grid of icon-over-label tiles, so every section is in sight. */}
          <nav className="seg scroll-thin max-w-full max-sm:grid max-sm:w-full max-sm:grid-cols-3 sm:overflow-x-auto" aria-label={t("Field sections")}>
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`tab shrink-0 max-sm:h-auto max-sm:min-h-14 max-sm:flex-col max-sm:justify-center max-sm:gap-1 max-sm:px-1 max-sm:py-1.5 max-sm:text-center max-sm:text-xs max-sm:leading-tight max-sm:whitespace-normal ${nav.id === n.id ? "tab-active" : ""}`}
                onClick={() => open(n.sections[0])}
                aria-current={nav.id === n.id ? "page" : undefined}
                {...(n.id === "checklists" ? tourAnchor("field-checklists") : n.id === "logs" ? tourAnchor("field-daily-log") : {})}
              >
                <n.icon />
                <span>{t(n.label)}</span>
              </button>
            ))}
          </nav>
          {sub && (
            <nav className="flex flex-wrap gap-1.5" aria-label={t("{name} sections", { name: t(nav.label) })}>
              {sub.map((s) => (
                <button key={s.id} className={`btn btn-sm h-9 ${section === s.id ? "btn-on" : "btn-ghost"}`} onClick={() => open(s.id)} aria-pressed={section === s.id}>
                  {t(s.label)}
                </button>
              ))}
            </nav>
          )}
        </div>
        {section === "today" && <TodayCard projectId={project.id} onOpen={open} />}
        {section === "checklists" && <Checklists />}
        {section === "forms" && <FormsList />}
        {section === "logs" && <DailyLogs />}
        {section === "files" && <Documents />}
        {section === "rfis" && <RfiList />}
        {section === "schedule" && <ScheduleView />}
        {section === "progress" && <ProgressPanel />}
        {section === "timeline" && <Timeline />}
      </div>
    </div>
  );
}
