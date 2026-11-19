"use client";
// Field: Today (default for technicians) · Tasks · Checklists & forms · Daily log · Photos · Files · More (RFIs,
// Schedule, Install progress, History). The section lives in the address (&section=…) so a reload, the back button and
// links from /tasks land on the same place.
import { BookOpen, Camera, ClipboardCheck, Ellipsis, FileStack, ListTodo, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { pickFieldSection, type FieldSection } from "@/lib/fieldDocs";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import ScheduleView from "../schedule/ScheduleView";
import Checklists from "./Checklists";
import DailyLogs from "./DailyLogs";
import Documents from "./Documents";
import Timeline from "./Timeline";
import TodayCard from "./TodayCard";
import RfiList from "../rfis/RfiList";
import FormsList from "../forms/FormsList";
import TaskList from "../tasks/TaskList";
import PhotosTab from "../photos/PhotosTab";
import ProgressPanel from "../progress/ProgressPanel";

const NAV: { id: string; label: string; icon: typeof Sun; sections: FieldSection[] }[] = [
  { id: "today", label: "Today", icon: Sun, sections: ["today"] },
  { id: "tasks", label: "Tasks", icon: ListTodo, sections: ["tasks"] },
  { id: "checklists", label: "Checklists & forms", icon: ClipboardCheck, sections: ["checklists", "forms"] },
  { id: "logs", label: "Daily log", icon: BookOpen, sections: ["logs"] },
  { id: "photos", label: "Photos", icon: Camera, sections: ["photos"] },
  { id: "files", label: "Files", icon: FileStack, sections: ["files"] },
  { id: "more", label: "More", icon: Ellipsis, sections: ["rfis", "schedule", "progress", "timeline"] },
];

const SUB: Partial<Record<string, { id: FieldSection; label: string }[]>> = {
  checklists: [
    { id: "checklists", label: "Checklists" },
    { id: "forms", label: "Forms" },
  ],
  more: [
    { id: "rfis", label: "RFIs" },
    { id: "schedule", label: "Schedule" },
    { id: "progress", label: "Install progress" },
    { id: "timeline", label: "History" },
  ],
};

export default function FieldTab() {
  const params = useSearchParams();
  const router = useRouter();
  const role = useRole();
  const project = useEditor((s) => s.project);
  const section = pickFieldSection(params.get("section"), { taskLink: params.has("tf") || params.has("task"), tech: role === "tech" });
  const nav = NAV.find((n) => n.sections.includes(section))!;
  const sub = SUB[nav.id];

  /** Switch section (and pass extra params such as log=today); params that belong to another section are dropped. */
  const open = (s: string, extra: Record<string, string> = {}) => {
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
      <div className={`mx-auto ${section === "schedule" || section === "photos" ? "max-w-6xl" : "max-w-4xl"} space-y-5 px-4 py-6 sm:px-6`}>
        <div className="space-y-3">
          <div>
            <h2 className="page-title">Field</h2>
            <p className="mt-1 text-sm text-slate-500">What to do today, tasks, checklists, the daily log, photos and files for this job.</p>
          </div>
          {/* Labelled at every width; scrolls sideways on narrow phones. */}
          <nav className="seg scroll-thin max-w-full overflow-x-auto" aria-label="Field sections">
            {NAV.map((n) => (
              <button key={n.id} className={`tab shrink-0 ${nav.id === n.id ? "tab-active" : ""}`} onClick={() => open(n.sections[0])} aria-current={nav.id === n.id ? "page" : undefined}>
                <n.icon />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          {sub && (
            <nav className="flex flex-wrap gap-1.5" aria-label={`${nav.label} sections`}>
              {sub.map((s) => (
                <button key={s.id} className={`btn btn-sm h-9 ${section === s.id ? "btn-on" : "btn-ghost"}`} onClick={() => open(s.id)} aria-pressed={section === s.id}>
                  {s.label}
                </button>
              ))}
            </nav>
          )}
        </div>
        {section === "today" && <TodayCard projectId={project.id} onOpen={open} />}
        {section === "tasks" && <TaskList />}
        {section === "checklists" && <Checklists />}
        {section === "forms" && <FormsList />}
        {section === "logs" && <DailyLogs />}
        {section === "photos" && (
          <div className="-mx-4 -my-6 sm:-mx-6">
            <PhotosTab />
          </div>
        )}
        {section === "files" && <Documents />}
        {section === "rfis" && <RfiList />}
        {section === "schedule" && <ScheduleView />}
        {section === "progress" && <ProgressPanel />}
        {section === "timeline" && <Timeline />}
      </div>
    </div>
  );
}
