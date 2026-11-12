"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useEditor } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import AppHeader from "./AppHeader";
import SheetsTab from "./SheetsTab";
import TakeoffTab from "./TakeoffTab";
import EstimateTab from "./EstimateTab";
import CrewTab from "./CrewTab";
import ProjectInfo from "./ProjectInfo";

// Konva needs the browser.
const PlanEditor = dynamic(() => import("./editor/PlanEditor"), { ssr: false, loading: () => <div className="p-6 text-slate-500">Loading plan…</div> });

const TABS = [
  { id: "plan", label: "Plan" },
  { id: "sheets", label: "Sheets" },
  { id: "takeoff", label: "Takeoff" },
  { id: "estimate", label: "Estimate" },
  { id: "crew", label: "Crew" },
  { id: "info", label: "Job" },
] as const;

export default function ProjectView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const tab = params.get("tab") ?? "plan";
  const { loaded, project, load, updateProject, sheets } = useEditor();

  useEffect(() => {
    if (!id) return;
    load(id);
    const onSync = () => load(id);
    window.addEventListener("pinplan:synced", onSync);
    return () => window.removeEventListener("pinplan:synced", onSync);
  }, [id, load]);

  const setTab = (t: string) => router.replace(`/project?id=${id}&tab=${t}`);

  if (!loaded || project?.id !== id) {
    if (loaded && !project)
      return (
        <>
          <AppHeader />
          <div className="p-6">
            Project not found. <Link className="underline" href="/">Back to projects</Link>
          </div>
        </>
      );
    return (
      <>
        <AppHeader />
        <div className="p-6 text-slate-500">Loading…</div>
      </>
    );
  }

  return (
    <>
      <AppHeader>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{project.address || "Untitled job"}</div>
            <div className="truncate text-xs text-slate-500">{project.clientName}</div>
          </div>
          <select
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
            value={project.status}
            onChange={(e) => updateProject({ status: e.target.value as ProjectStatus })}
            aria-label="Project status"
          >
            <option value="estimate">estimate</option>
            <option value="approved">approved</option>
            <option value="installed">installed</option>
          </select>
        </div>
      </AppHeader>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "sheets" && ` (${sheets.length})`}
          </button>
        ))}
      </div>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {tab === "plan" &&
          (sheets.length ? (
            <PlanEditor />
          ) : (
            <div className="p-10 text-center">
              <p className="text-lg font-medium">No plan sheets yet</p>
              <p className="text-slate-500">Upload the plan set (PDF or photos) to start placing devices.</p>
              <button className="btn btn-primary mt-4" onClick={() => setTab("sheets")}>
                Upload plans
              </button>
            </div>
          ))}
        {tab === "sheets" && <SheetsTab onOpenSheet={() => setTab("plan")} />}
        {tab === "takeoff" && <TakeoffTab />}
        {tab === "estimate" && (
          <div className="h-full overflow-auto">
            <EstimateTab />
          </div>
        )}
        {tab === "crew" && <CrewTab />}
        {tab === "info" && <ProjectInfo />}
      </main>
    </>
  );
}
