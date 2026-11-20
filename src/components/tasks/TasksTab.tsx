"use client";
// Job → Tasks: the job's task list as a tab of its own (it used to be a Field section). New tasks start here with
// "Add task" (a simple form; a sheet or device can be picked from a list). The plan is for devices: task pins show
// there only when switched on in Layers.
import TaskList from "./TaskList";
import { useT } from "@/lib/i18n";

export default function TasksTab() {
  const t = useT();
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h2 className="page-title">{t("Tasks")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("Punch items and to-dos for this job: who does what, by when.")}</p>
        </div>
        <TaskList />
      </div>
    </div>
  );
}
