"use client";
import { AlertTriangle, FileUp, History, Layers, Move, Ruler, Undo2 } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { changedSinceEstimate, clampWarning, currentSince, needsRecalibration } from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import { useBlobUrl } from "@/lib/useImage";
import type { SheetRevision } from "@/lib/types";
import AlignRevision from "./AlignRevision";
import { rollbackTo } from "./revisionActions";
import RevisionUpload from "./RevisionUpload";
import SheetCompare from "./SheetCompare";
import { fmtDate, Screen } from "./ui";

function Thumb({ imageId, label }: { imageId: string; label: string }) {
  const t = useT();
  const url = useBlobUrl(imageId);
  return (
    <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200 sm:h-20 sm:w-28">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-full w-full object-contain" />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-slate-400">{t("Not downloaded yet")}</span>
      )}
    </span>
  );
}

/** A sheet's drawings: the current one and every earlier one, with compare, align and (office) roll back. */
export default function RevisionsPanel({ sheetId, onClose }: { sheetId: string; onClose: () => void }) {
  const t = useT();
  const sheet = useEditor((s) => s.sheets.find((x) => x.id === sheetId));
  const estimateLines = useEditor((s) => s.estimateLines);
  const updateSheet = useEditor((s) => s.updateSheet);
  const role = useRole();
  const office = role !== "tech";
  const [sub, setSub] = useState<{ kind: "upload" } | { kind: "align" } | { kind: "compare"; a?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  if (!sheet) return null;
  if (sub?.kind === "upload") return <RevisionUpload targetSheetId={sheet.id} onClose={() => setSub(null)} />;
  if (sub?.kind === "align") return <AlignRevision sheet={sheet} onClose={() => setSub(null)} />;
  if (sub?.kind === "compare") return <SheetCompare sheet={sheet} initialA={sub.a} onClose={() => setSub(null)} />;

  const revs = sheet.revisions ?? [];
  const since = currentSince(sheet);
  const recal = needsRecalibration(sheet);
  const stale = can(role, "prices") && changedSinceEstimate(sheet, estimateLines);

  async function rollback(r: SheetRevision) {
    if (
      !sheet ||
      !confirm(
        sheet.revisionLabel
          ? t("Make “{label}” the current drawing of {sheet}?\n\n{current} stays in the history, and devices follow any alignment between them.", { label: r.label, sheet: sheet.name, current: sheet.revisionLabel })
          : t("Make “{label}” the current drawing of {sheet}?\n\nThe current drawing stays in the history, and devices follow any alignment between them.", { label: r.label, sheet: sheet.name }),
      )
    )
      return;
    setBusy(r.id);
    try {
      const rep = await rollbackTo(sheet.id, r.id);
      const warn = rep ? clampWarning({ devices: rep.offDevices.length, runs: rep.offRuns, other: rep.offOther }) : null;
      toast(warn ?? t("Rolled back to {label}", { label: r.label }), warn ? "error" : undefined);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      label={t("Sheet revisions")}
      title={t("{sheet} — revisions", { sheet: sheet.name })}
      subtitle={t("Everyone in the field always sees the current drawing.")}
      onClose={onClose}
      actions={
        office ? (
          <button className="btn btn-brand btn-sm" onClick={() => setSub({ kind: "upload" })}>
            <FileUp /> <span className="hidden sm:inline">{t("Upload new revision")}</span>
            <span className="sm:hidden">{t("Upload")}</span>
          </button>
        ) : null
      }
    >
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-3 py-4 sm:px-6" data-testid="revisions-list">
          {stale && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="revision-estimate-note">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("Changed since the estimate: this sheet got a new drawing after the estimate was last edited. Check the devices and the estimate for a change order.")}</span>
            </div>
          )}
          {recal && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="revision-recalibrate">
              <Ruler className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("The new drawing has a different size, so its scale was reset. Calibrate it on the plan (or align it with the previous drawing to carry the scale over). Run lengths keep their measured values until then.")}</span>
            </div>
          )}

          <div className="card flex gap-3 p-3">
            <Thumb imageId={sheet.imageId} label={sheet.revisionLabel || t("Current")} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip bg-ink text-white">{t("Current")}</span>
                {office ? (
                  <input
                    className="input h-8 max-w-[12rem] py-0 font-medium"
                    value={label ?? sheet.revisionLabel ?? ""}
                    placeholder={revs.length ? t("Label, e.g. Rev B") : t("Original")}
                    aria-label={t("Current revision label")}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={() => {
                      if (label != null && label.trim() !== (sheet.revisionLabel ?? "")) updateSheet(sheet.id, { revisionLabel: label.trim() || null });
                      setLabel(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <span className="font-medium">{sheet.revisionLabel || (revs.length ? t("Current") : t("Original"))}</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t("Since {date}", { date: fmtDate(since.at) })}
                {since.by ? ` · ${since.by}` : ""} · {sheet.width}×{sheet.height}px
              </p>
              {revs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button className="btn btn-sm" onClick={() => setSub({ kind: "compare" })} data-testid="revision-compare">
                    <Layers /> {t("Compare with {label}", { label: revs[0].label })}
                  </button>
                  {office && (
                    <button className="btn btn-sm" onClick={() => setSub({ kind: "align" })} data-testid="revision-align">
                      <Move /> {revs[0].transformToNext ? t("Re-align with {label}", { label: revs[0].label }) : t("Align with {label}", { label: revs[0].label })}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {revs.length ? (
            <>
              <h3 className="section-title flex items-center gap-1.5 pt-2">
                <History className="h-4 w-4" /> {t("Earlier drawings")}
              </h3>
              <ul className="space-y-2">
                {revs.map((r) => (
                  <li key={r.id} className="card flex gap-3 p-3" data-testid="revision-row">
                    <Thumb imageId={r.imageId} label={r.label} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {r.label}
                        {r.transformToNext && <span className="chip bg-emerald-50 text-emerald-700">{t("aligned")}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmtDate(r.uploadedAt)} – {fmtDate(r.replacedAt)}
                        {r.replacedBy ? ` · ${t("replaced by {name}", { name: r.replacedBy })}` : ""}
                      </p>
                      {r.note && <p className="text-xs text-slate-600">{r.note}</p>}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button className="btn btn-sm" onClick={() => setSub({ kind: "compare", a: r.id })}>
                          <Layers /> {t("Compare")}
                        </button>
                        {office && (
                          <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => rollback(r)} data-testid="revision-rollback">
                            <Undo2 /> {busy === r.id ? t("Rolling back…") : t("Roll back")}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-1 text-sm text-slate-500">{t("No earlier drawings yet. When the plans are re-issued, upload the new sheet here: every device stays put.")}</p>
          )}
        </div>
      </div>
    </Screen>
  );
}
