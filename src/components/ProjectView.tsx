"use client";
import { PROJECT_STATUS_LABEL, projectStatusLabel, statusChip } from "@/lib/statusStyle";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useRole, useTeam } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { JOB_TABS, OFFICE_ONLY_TABS, resolveJobTab, withParam } from "@/lib/tabRoutes";
import type { ProjectStatus } from "@/lib/types";
import { ChevronLeft, FileText } from "lucide-react";
import AppHeader, { Logo } from "./AppHeader";
import SyncBadge from "./SyncBadge";
import { JobTabBar, JobTabStrip } from "./nav/JobTabs";
import { useJobNav } from "./nav/useJobNav";

// Konva needs the browser. The plan is the heavy tab; every other tab loads only when it's opened.
const PlanEditor = dynamic(() => import("./editor/PlanEditor"), { ssr: false, loading: () => <div className="p-6 text-slate-500">Loading plan…</div> });
const loading = () => <div className="p-6 text-slate-500">Loading…</div>;
const ProjectInfo = dynamic(() => import("./ProjectInfo"), { loading });
const TakeoffTab = dynamic(() => import("./TakeoffTab"), { loading });
const MoneyTab = dynamic(() => import("./money/MoneyTab"), { loading });
const FieldTab = dynamic(() => import("./field/FieldTab"), { loading });
const PhotosTab = dynamic(() => import("./photos/PhotosTab"), { loading });
const ManageSheetsDrawer = dynamic(() => import("./SheetsTab").then((m) => m.ManageSheetsDrawer), { loading: () => null });

const STATUS_STYLE: Record<ProjectStatus, string> = { estimate: statusChip("estimate"), approved: statusChip("approved"), installed: statusChip("installed") };

export default function ProjectView() {
  const params = useSearchParams();
  const router = useRouter();
  const { setTab, openManageSheets, closeManageSheets } = useJobNav();
  const id = params.get("id") ?? "";
  const office = can(useRole(), "prices");
  // Old tab ids (?tab=sheets, billing, crew, …) and technicians asking for Money resolve to one of the five tabs; the
  // URL is then rewritten so the sub-view (Money step, Field section, …) reads its own param.
  // Documents still link `?tab=billing&doc=…` with no step: stay on Invoices & payments when that's where you were.
  const [lastMoneyStep, setLastMoneyStep] = useState<string | null>(null);
  let search = params.toString();
  if (params.get("tab") === "billing" && !params.has("step") && lastMoneyStep === "invoices") search = withParam(search, "step", "invoices");
  const resolved = resolveJobTab(search, office);
  const tab = resolved.tab;
  // Sub-views read the resolved params, so an old link shows the right step/view on its first render (no flash of
  // another step, and an open document isn't unmounted while the URL is rewritten).
  const view = new URLSearchParams(resolved.query);
  const moneyStep = tab === "money" ? view.get("step") : null;
  // Remembered while rendering (React's "adjust state on prop change" pattern), not in an effect.
  if (moneyStep && moneyStep !== lastMoneyStep) setLastMoneyStep(moneyStep);
  const tabs = office ? JOB_TABS : JOB_TABS.filter((t) => !OFFICE_ONLY_TABS.includes(t));
  // With no tab asked for, the default depends on the role: wait until it's known so a technician on a fresh device
  // isn't sent to Overview for good before their role loads.
  const teamReady = useTeam((s) => s.ready);
  const { configured } = useSyncStatus();
  const roleKnown = teamReady || !configured;
  const mayRedirect = params.has("tab") || roleKnown;
  useEffect(() => {
    if (id && resolved.redirect && mayRedirect) router.replace(`/project?${resolved.query}`);
  }, [id, resolved.redirect, resolved.query, mayRedirect, router]);
  const { loaded, project, load, updateProject, sheets } = useEditor();
  const photoCount = useEditor((s) => s.photos.length);

  useEffect(() => {
    if (!id) return;
    load(id);
    const onSync = () => load(id);
    window.addEventListener("pinplan:synced", onSync);
    return () => window.removeEventListener("pinplan:synced", onSync);
  }, [id, load]);

  if (!loaded || project?.id !== id) {
    if (loaded && !project)
      return (
        <>
          <AppHeader />
          <div className="p-6">
            Job not found. <Link className="underline" href="/">Back to jobs</Link>
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

  const manage = tab === "plan" && view.get("manage") === "1";
  const fieldPhotos = tab === "field" && view.get("section") === "photos";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-2 backdrop-blur sm:gap-3 sm:px-4">
        <Link href="/" className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900" aria-label="Back to jobs">
          <ChevronLeft className="h-4 w-4" />
          Jobs
        </Link>
        <span className="max-lg:hidden">
          <Logo compact />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
          <div className="min-w-0">
            <div className="truncate text-sm leading-tight font-semibold text-slate-900">{project.address || "Untitled job"}</div>
            <div className="truncate text-xs text-slate-500">{project.clientName || "No client"}</div>
          </div>
          {/* Phones: a plain chip (the next step on Overview changes the status); a picker from sm up. */}
          <span className={`chip shrink-0 ring-1 sm:hidden ${STATUS_STYLE[project.status]}`}>{projectStatusLabel(project.status)}</span>
          <select
            className={`hidden h-6 shrink-0 cursor-pointer appearance-none rounded-md px-2 text-xs font-medium ring-1 outline-none sm:block ${STATUS_STYLE[project.status]}`}
            value={project.status}
            onChange={(e) => updateProject({ status: e.target.value as ProjectStatus })}
            aria-label="Job status"
          >
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((st) => (
              <option key={st} value={st}>
                {PROJECT_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 max-lg:hidden" />
        <JobTabStrip tabs={tabs} active={tab} onSelect={(t) => setTab(t)} />
        {tab === "plan" && sheets.length > 0 && (
          <button type="button" className="btn btn-sm shrink-0" onClick={openManageSheets} data-testid="manage-sheets-open">
            <FileText />
            <span className="max-md:hidden">Manage sheets</span>
            <span className="md:hidden">Sheets</span>
          </button>
        )}
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
                <button className="btn btn-brand mt-5" onClick={openManageSheets}>
                  Upload plans
                </button>
              </div>
            </div>
          ))}
        {manage && <ManageSheetsDrawer onClose={closeManageSheets} onOpenSheet={closeManageSheets} />}
        {tab === "overview" && <ProjectInfo />}
        {tab === "takeoff" && <TakeoffTab view={view.get("view")} />}
        {tab === "money" && office && <MoneyTab step={moneyStep} />}
        {tab === "field" && (
          <div className="flex h-full flex-col">
            {/* Photos live under Field (old ?tab=photos links land here). */}
            <div className="flex shrink-0 justify-center border-b border-slate-200 bg-white px-3 py-2">
              <div className="seg" role="tablist" aria-label="Field view">
                <button type="button" role="tab" aria-selected={!fieldPhotos} className={`tab ${!fieldPhotos ? "tab-active" : ""}`} onClick={() => setTab("field")}>
                  Field work
                </button>
                <button type="button" role="tab" aria-selected={fieldPhotos} className={`tab ${fieldPhotos ? "tab-active" : ""}`} onClick={() => setTab("field", { section: "photos" })}>
                  Photos
                  {photoCount > 0 && <span className="text-xs text-slate-400">{photoCount}</span>}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">{fieldPhotos ? <PhotosTab /> : <FieldTab />}</div>
          </div>
        )}
      </main>
      <JobTabBar tabs={tabs} active={tab} onSelect={(t) => setTab(t)} />
    </>
  );
}
