"use client";
// Field: checklists (with photo-required items), daily logs, documents and the job timeline.
import { BookOpen, ClipboardCheck, ClipboardPen, FileStack, History } from "lucide-react";
import { useState } from "react";
import Checklists from "./Checklists";
import DailyLogs from "./DailyLogs";
import Documents from "./Documents";
import Timeline from "./Timeline";
import FormsList from "../forms/FormsList";

const SECTIONS = [
  { id: "checklists", label: "Checklists", icon: ClipboardCheck },
  { id: "logs", label: "Daily logs", icon: BookOpen },
  { id: "docs", label: "Documents", icon: FileStack },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "forms", label: "Forms", icon: ClipboardPen },
] as const;

export default function FieldTab() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("checklists");
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
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
        {section === "forms" && <FormsList />}
      </div>
    </div>
  );
}
