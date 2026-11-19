"use client";
// Field → RFIs: the job's RFI log. Summary (open, with them, overdue, average days to answer), filters, one row per RFI
// (code, subject, ball-in-court, due, age), a log PDF, and a big "New RFI" button for the field.
import { CalendarDays, FileDown, ImageIcon, MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { getAuthor } from "@/lib/photos";
import { ageText, canRfi, filterRfis, isOverdue, nextRfiNumber, rfiCode, rfiSummary, type RfiFilter } from "@/lib/rfis";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { Rfi } from "@/lib/types";
import { useRfis } from "@/lib/useRfis";
import RfiEditor, { draftRfi } from "./RfiEditor";
import { markerName } from "./PlanSpotPicker";
import { downloadRfiLogPdf } from "./rfiPdfData";
import { BallChip, dayLabel, localToday, StatusChip } from "./ui";

const FILTERS: { id: RfiFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "them", label: "With them" },
  { id: "overdue", label: "Overdue" },
  { id: "all", label: "All" },
];

function Stat({ n, label, tone = "" }: { n: number | string; label: string; tone?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default function RfiList() {
  const { project, settings, photos, sheets, documents, markers, catalog } = useEditor();
  const { email } = useSyncStatus();
  const role = useRole();
  const { rfis, all } = useRfis(project?.id);
  const [filter, setFilter] = useState<RfiFilter>("open");
  const [editing, setEditing] = useState<{ id: string; draft: Rfi | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const today = localToday();
  const now = new Date().toISOString();
  const summary = useMemo(() => rfiSummary(rfis ?? [], today), [rfis, today]);
  const shown = useMemo(() => filterRfis(rfis ?? [], filter, today), [rfis, filter, today]);
  if (!project) return null;

  const open = editing ? (editing.draft && !all.some((r) => r.id === editing.id) ? editing.draft : all.find((r) => r.id === editing.id)) : null;

  async function logPdf() {
    if (!project || !settings || !rfis?.length) return;
    setBusy(true);
    try {
      await downloadRfiLogPdf(rfis, { project, settings, photos, sheets, documents, markerLabel: (id) => {
        const m = markers.find((x) => x.id === id);
        return m ? markerName(m, catalog) : null;
      } });
    } catch (e) {
      toast(`PDF failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto max-w-md text-sm text-slate-500">Questions for the GC, architect or owner — with the spot on the plan, photos and a link they can answer without an account.</p>
        {!!rfis?.length && (
          <button className="btn btn-sm" onClick={() => void logPdf()} disabled={busy}>
            <FileDown /> {busy ? "Building…" : "Log PDF"}
          </button>
        )}
        {canRfi(role, "create") && (
          <button className="btn btn-brand" onClick={() => {
            const d = draftRfi(project.id, nextRfiNumber(all), getAuthor(email));
            setEditing({ id: d.id, draft: d });
          }}>
            <Plus /> New RFI
          </button>
        )}
      </div>

      {!!rfis?.length && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat n={summary.open} label="Open" />
          <Stat n={summary.withThem} label="With them" tone={summary.withThem ? "text-amber-700" : ""} />
          <Stat n={summary.overdue} label="Overdue" tone={summary.overdue ? "text-red-600" : ""} />
          <Stat n={summary.avgDaysToAnswer == null ? "—" : summary.avgDaysToAnswer < 1 ? "< 1 d" : `${summary.avgDaysToAnswer} d`} label="Avg. to answer" />
        </div>
      )}

      {!!rfis?.length && (
        <nav className="seg" aria-label="Filter RFIs">
          {FILTERS.map((f) => (
            <button key={f.id} className={`tab ${filter === f.id ? "tab-active" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </nav>
      )}

      {rfis === null ? null : !rfis.length ? (
        <div className="card p-8 text-center">
          <p className="font-semibold">No RFIs on this job yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Need an answer before you can finish? Snap a photo, mark the spot on the plan and send it — they answer from a link, no login.</p>
        </div>
      ) : !shown.length ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing here. {filter !== "all" && "Try “All”."}</p>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden" aria-label="RFIs">
          {shown.map((r) => {
            const late = isOverdue(r, today);
            return (
              <li key={r.id}>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100" onClick={() => setEditing({ id: r.id, draft: null })}>
                  <span className="mt-0.5 w-16 shrink-0 font-mono text-xs font-bold text-slate-600">{rfiCode(r.number)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${r.status === "void" ? "text-slate-400 line-through" : ""}`}>{r.subject || r.question || "Untitled"}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <StatusChip status={r.status} />
                      <BallChip rfi={r} />
                      {r.toCompany || r.toName ? <span className="truncate">{r.toCompany || r.toName}</span> : null}
                      {r.sheetId && r.x != null && <MapPin className="h-3.5 w-3.5" aria-label="Has a plan location" />}
                      {(r.photoIds?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {r.photoIds!.length}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {r.due && r.status !== "closed" && r.status !== "void" && (
                      <span className={`flex items-center justify-end gap-1 ${late ? "font-semibold text-red-600" : "text-slate-600"}`}>
                        <CalendarDays className="h-3.5 w-3.5" /> {late ? "Overdue · " : "Due "}
                        {dayLabel(r.due)}
                      </span>
                    )}
                    <span className="mt-0.5 block text-slate-400">{r.status === "draft" ? "draft" : ageText(r.sentAt ?? r.createdAt, now)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && editing && <RfiEditor key={editing.id} rfi={open} isNew={!!editing.draft && !all.some((r) => r.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}
