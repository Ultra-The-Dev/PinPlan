"use client";
// Small entry points for sheet revisions, dropped into the sheets list and the plan.
import { AlertTriangle, FileStack, FileUp, History, Layers } from "lucide-react";
import { useState } from "react";
import { needsRecalibration } from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import type { Sheet } from "@/lib/types";
import RevisionsPanel from "./RevisionsPanel";
import RevisionUpload from "./RevisionUpload";
import SheetCompare from "./SheetCompare";

/** "Rev B · 2 earlier" chip on a sheet card; opens the revisions list. */
export function RevisionBadge({ sheet }: { sheet: Sheet }) {
  const [open, setOpen] = useState(false);
  const n = sheet.revisions?.length ?? 0;
  if (!n && !sheet.revisionLabel) return null;
  return (
    <>
      <button className="chip bg-indigo-50 text-indigo-700 hover:bg-indigo-100" onClick={() => setOpen(true)} title="Show this sheet's drawings" data-testid="revisions-badge">
        <History className="h-3 w-3" />
        {sheet.revisionLabel ? `${sheet.revisionLabel} · ` : ""}Revisions ({n})
      </button>
      {needsRecalibration(sheet) && (
        <span className="chip bg-amber-50 text-amber-700" title="The new drawing's scale was reset: calibrate it on the plan">
          <AlertTriangle className="h-3 w-3" /> recalibrate
        </span>
      )}
      {open && <RevisionsPanel sheetId={sheet.id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Upload new revision" for one sheet (office only). */
export function UploadRevisionButton({ sheet, compact }: { sheet: Sheet; compact?: boolean }) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  if (role === "tech") return null;
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)} title="Upload new revision (devices stay)" aria-label="Upload new revision" data-testid="upload-revision">
        <FileUp /> {compact ? "" : <span className="hidden sm:inline">Revision</span>}
      </button>
      {open && <RevisionUpload targetSheetId={sheet.id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Header button: a whole re-issued set, matched page by page (office only). */
export function UploadRevisedSetButton({ disabled }: { disabled?: boolean }) {
  const role = useRole();
  const has = useEditor((s) => s.sheets.length > 0);
  const [open, setOpen] = useState(false);
  if (role === "tech" || !has) return null;
  return (
    <>
      <button className="btn" disabled={disabled} onClick={() => setOpen(true)} title="Upload a re-issued plan set: pages are matched to your sheets and devices stay">
        <FileStack /> Revised set
      </button>
      {open && <RevisionUpload onClose={() => setOpen(false)} />}
    </>
  );
}

/** Plan toolbar: the current revision chip and Compare. Shown once a sheet has a history. */
export function RevisionToolbar({ sheet }: { sheet: Sheet; projectId: string }) {
  const live = useEditor((s) => s.sheets.find((x) => x.id === sheet.id)) ?? sheet;
  const [open, setOpen] = useState<"list" | "compare" | null>(null);
  const n = live.revisions?.length ?? 0;
  if (!n) return null;
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur">
      <button className="chip h-8 bg-ink px-2.5 text-white" onClick={() => setOpen("list")} title={`${n} earlier drawing${n === 1 ? "" : "s"}`} data-testid="plan-revision-chip">
        {needsRecalibration(live) && <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
        {live.revisionLabel || "Current"}
      </button>
      <button className="btn btn-sm btn-ghost h-8" onClick={() => setOpen("compare")} data-testid="plan-compare">
        <Layers /> Compare
      </button>
      {open === "list" && <RevisionsPanel sheetId={live.id} onClose={() => setOpen(null)} />}
      {open === "compare" && <SheetCompare sheet={live} onClose={() => setOpen(null)} />}
    </div>
  );
}
