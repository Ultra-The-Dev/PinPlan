"use client";
// Field: checklists (with photo-required items), daily logs, documents and the job timeline.
import { BookOpen, CalendarRange, ClipboardCheck, ClipboardPen, FileStack, History, ListTodo, MessageCircleQuestion } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import ScheduleView from "../schedule/ScheduleView";
import Checklists from "./Checklists";
import DailyLogs from "./DailyLogs";
import Documents from "./Documents";
import Timeline from "./Timeline";
import RfiList from "../rfis/RfiList";
import FormsList from "../forms/FormsList";
import TaskList from "../tasks/TaskList";

const SECTIONS = [
  { id: "checklists", label: "Checklists", icon: ClipboardCheck },
  { id: "logs", label: "Daily logs", icon: BookOpen },
  { id: "docs", label: "Documents", icon: FileStack },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "rfis", label: "RFIs", icon: MessageCircleQuestion },
  { id: "schedule", label: "Schedule", icon: CalendarRange },
  { id: "forms", label: "Forms", icon: ClipboardPen },
] as const;

export default function FieldTab() {
  // ?section=schedule (from the crew board) opens that section; a task filter (&tf=) or task link opens Tasks.
  const params = useSearchParams();
  const asked = params.get("section") ?? (params.has("tf") || params.has("task") ? "tasks" : null);
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>(() => SECTIONS.find((s) => s.id === asked)?.id ?? "checklists");
  return (
    <div className="h-full overflow-auto">
      <div className={`mx-auto ${section === "schedule" ? "max-w-6xl" : "max-w-4xl"} space-y-5 px-4 py-6 sm:px-6`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">Field</h2>
            <p className="mt-1 text-sm text-slate-500">Checklists, daily logs, documents and everything that happened on the job.</p>
          </div>
          <nav className="seg" aria-label="Field sections">
            {SECTIONS.map((s) => (
              // Labels are hidden on phones, so the name comes from aria-label.
              <button key={s.id} className={`tab ${section === s.id ? "tab-active" : ""}`} onClick={() => setSection(s.id)} aria-label={s.label} aria-pressed={section === s.id} title={s.label}>
                <s.icon />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </nav>
        </div>
        {section === "checklists" && <Checklists />}
        {section === "logs" && <DailyLogs />}
        {section === "docs" && <Documents />}
        {section === "timeline" && <Timeline />}
        {section === "tasks" && <TaskList />}
        {section === "rfis" && <RfiList />}
        {section === "schedule" && <ScheduleView />}
        {section === "forms" && <FormsList />}
      </div>
    </div>
  );
}
