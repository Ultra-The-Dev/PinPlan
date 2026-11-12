"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useEditor } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { FileText, HardHat, Info, ListChecks, MapPin, Receipt } from "lucide-react";
import AppHeader, { Logo } from "./AppHeader";
import SyncBadge from "./SyncBadge";
import SheetsTab from "./SheetsTab";
import TakeoffTab from "./TakeoffTab";
import EstimateTab from "./EstimateTab";
import CrewTab from "./CrewTab";
import ProjectInfo from "./ProjectInfo";

// Konva needs the browser.
const PlanEditor = dynamic(() => import("./editor/PlanEditor"), { ssr: false, loading: () => <div className="p-6 text-slate-500">Loading plan…</div> });

const TABS = [
  { id: "plan", label: "Plan", icon: MapPin },
  { id: "sheets", label: "Sheets", icon: FileText },
  { id: "takeoff", label: "Takeoff", icon: ListChecks },
  { id: "estimate", label: "Estimate", icon: Receipt },
  { id: "crew", label: "Crew", icon: HardHat },
  { id: "info", label: "Job", icon: Info },
] as const;

const STATUS_STYLE: Record<ProjectStatus, string> = {
  estimate: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-brand-50 text-brand-700 ring-brand-200",
  installed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

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
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-2 backdrop-blur sm:gap-3 sm:px-4">
        <Logo compact />
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm leading-tight font-semibold text-slate-900">{project.address || "Untitled job"}</div>
            <div className="truncate text-xs text-slate-500">{project.clientName || "No client"}</div>
          </div>
          <select
            className={`hidden h-6 shrink-0 cursor-pointer appearance-none rounded-md px-2 text-xs font-medium capitalize ring-1 outline-none sm:block ${STATUS_STYLE[project.status]}`}
            value={project.status}
            onChange={(e) => updateProject({ status: e.target.value as ProjectStatus })}
            aria-label="Project status"
          >
            <option value="estimate">Estimate</option>
            <option value="approved">Approved</option>
            <option value="installed">Installed</option>
          </select>
        </div>
        <div className="flex-1" />
        <nav className="seg max-w-[60vw] overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)} title={t.label} aria-label={t.label}>
              <t.icon />
              <span className="hidden lg:inline">{t.label}</span>
              {t.id === "sheets" && sheets.length > 0 && <span className="hidden text-xs text-slate-400 lg:inline">{sheets.length}</span>}
            </button>
          ))}
        </nav>
        <SyncBadge />
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {tab === "plan" &&
          (sheets.length ? (
            <PlanEditor />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <div className="card max-w-md p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <FileText className="h-6 w-6" />
                </div>
                <p className="text-lg font-semibold">No plan sheets yet</p>
                <p className="mt-1 text-sm text-slate-500">Upload the plan set (PDF or phone photos) to start placing devices.</p>
                <button className="btn btn-brand mt-5" onClick={() => setTab("sheets")}>
                  Upload plans
                </button>
              </div>
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
