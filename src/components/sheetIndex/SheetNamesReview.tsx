"use client";
// "Review sheet names": sheet numbers, titles and disciplines read from the PDF's title blocks, shown for a quick
// check after import (or "Detect from PDF"). Accept, edit, or go back to page numbers; then callouts that name a
// confirmed sheet number become links. Duplicated numbers are flagged and never auto-linked.
import { AlertTriangle, Link2, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DISCIPLINE_NAMES, disciplineFromNumber, proposeSheetMeta, sheetNumberKey, type TextItem } from "@/lib/sheetIndex";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { createCalloutLinks, saveSheetMeta } from "./applyIndex";

export interface ReviewPage {
  sheetId: string;
  pageNumber: number;
  items: TextItem[];
  text: string;
}

interface Row {
  sheetId: string;
  pageNumber: number;
  number: string;
  title: string;
  discipline: string;
  /** Read from the PDF (for "revert"). */
  proposed: { number: string; title: string; discipline: string };
}

/** True when any page has something to review (scanned PDFs don't). */
export function hasProposals(pages: ReviewPage[]): boolean {
  return pages.some((p) => {
    const m = proposeSheetMeta(p.items, p.text);
    return !!(m.number || m.title);
  });
}

export default function SheetNamesReview({ pages, onClose, note }: { pages: ReviewPage[]; onClose: () => void; note?: string }) {
  const t = useT();
  const sheets = useEditor((s) => s.sheets);
  const [rows, setRows] = useState<Row[]>(() =>
    pages.map((p) => {
      const m = proposeSheetMeta(p.items, p.text);
      const sh = useEditor.getState().sheets.find((s) => s.id === p.sheetId);
      const proposed = { number: m.number ?? "", title: m.title ?? "", discipline: m.discipline ?? "" };
      // Sheets named earlier keep their names unless the PDF has one and they don't.
      return {
        sheetId: p.sheetId,
        pageNumber: p.pageNumber,
        number: sh?.number || proposed.number,
        title: sh?.title || proposed.title,
        discipline: sh?.discipline || proposed.discipline,
        proposed,
      };
    }),
  );
  const [links, setLinks] = useState(true);
  const [busy, setBusy] = useState(false);

  // Duplicate numbers across this review and the job's other sheets.
  const dups = useMemo(() => {
    const inReview = new Set(rows.map((r) => r.sheetId));
    const count = new Map<string, number>();
    const add = (n: string | null | undefined) => {
      const k = sheetNumberKey(n);
      if (k) count.set(k, (count.get(k) ?? 0) + 1);
    };
    rows.forEach((r) => add(r.number));
    sheets.filter((s) => !s.deleted && !inReview.has(s.id)).forEach((s) => add(s.number));
    return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows, sheets]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const nameOf = (id: string) => sheets.find((s) => s.id === id)?.name ?? "";
  const anyNumber = rows.some((r) => r.number.trim());

  async function apply() {
    setBusy(true);
    try {
      const n = await saveSheetMeta(
        rows.map((r) => ({
          id: r.sheetId,
          patch: { number: r.number.trim() || null, title: r.title.trim() || null, discipline: r.discipline.trim() || (r.number.trim() ? disciplineFromNumber(r.number) : null) },
        })),
      );
      const made = links ? await createCalloutLinks(pages.map((p) => ({ sheetId: p.sheetId, items: p.items }))) : 0;
      toast([n ? t.tn("Named {n} sheet", "Named {n} sheets", n) : t("Names unchanged"), made ? t.tn("{n} link added", "{n} links added", made) : ""].filter(Boolean).join(" · "));
      onClose();
    } catch (e) {
      toast(t("Couldn't save: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Review sheet names")}
        className="card animate-in flex max-h-[92dvh] w-full flex-col rounded-b-none pb-[env(safe-area-inset-bottom)] shadow-pop sm:max-w-3xl sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("Review sheet names")}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{t("Read from each page's title block. Fix anything that looks off, then save.")}</p>
            {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
          </div>
          <button className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        {dups.size > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("Some sheet numbers are used twice ({numbers}). Callouts to them won't be linked automatically until each number is unique.", { numbers: [...dups].join(", ") })}
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
          <div className="hidden grid-cols-[3.5rem_7rem_1fr_9rem_2rem] gap-2 px-2 pb-1 text-xs font-medium text-slate-500 sm:grid">
            <span>{t("Page")}</span>
            <span>{t("Number")}</span>
            <span>{t("Title")}</span>
            <span>{t("Discipline")}</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const dup = !!r.number.trim() && dups.has(sheetNumberKey(r.number));
              const changed = r.number !== r.proposed.number || r.title !== r.proposed.title || r.discipline !== r.proposed.discipline;
              return (
                <li key={r.sheetId} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2 px-2 py-2 sm:grid-cols-[3.5rem_7rem_1fr_9rem_2rem]" data-testid="review-row">
                  <span className="row-span-2 text-xs text-slate-500 sm:row-span-1">
                    <span className="block font-medium text-slate-700 tabular-nums">{t("p. {n}", { n: r.pageNumber })}</span>
                    <span className="block truncate" title={nameOf(r.sheetId)}>
                      {nameOf(r.sheetId)}
                    </span>
                  </span>
                  <div className="col-span-1 flex gap-2 sm:contents">
                    <input
                      className={`input h-9 w-24 shrink-0 font-mono text-[13px] font-semibold sm:w-full ${dup ? "border-amber-400 ring-2 ring-amber-100" : ""}`}
                      value={r.number}
                      placeholder="E-101"
                      aria-label={t("Sheet number, page {n}", { n: r.pageNumber })}
                      onChange={(e) => {
                        const number = e.target.value.toUpperCase();
                        // Keep the discipline in step with the number unless it was picked by hand.
                        const auto = !r.discipline || r.discipline === disciplineFromNumber(r.number);
                        set(i, { number, ...(auto && number.trim() ? { discipline: disciplineFromNumber(number) } : {}) });
                      }}
                    />
                    <input className="input h-9 min-w-0 flex-1" value={r.title} placeholder={t("Title")} aria-label={t("Sheet title, page {n}", { n: r.pageNumber })} onChange={(e) => set(i, { title: e.target.value })} />
                  </div>
                  <button
                    className="btn btn-sm btn-icon btn-ghost row-span-2 text-slate-400 sm:order-last sm:row-span-1"
                    disabled={!changed}
                    onClick={() => set(i, { ...r.proposed })}
                    title={t("Back to what the PDF says")}
                    aria-label={t("Undo edits, page {n}", { n: r.pageNumber })}
                  >
                    <RotateCcw />
                  </button>
                  <select className="input h-9 sm:col-auto" value={r.discipline} onChange={(e) => set(i, { discipline: e.target.value })} aria-label={t("Discipline, page {n}", { n: r.pageNumber })}>
                    <option value="">—</option>
                    {[...new Set([...DISCIPLINE_NAMES, ...(r.discipline ? [r.discipline] : [])])].map((d) => (
                      <option key={d} value={d}>
                        {t(d)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3 sm:px-4">
          <label className="mr-auto flex min-h-9 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-red-500" checked={links} onChange={(e) => setLinks(e.target.checked)} disabled={!anyNumber} />
            <Link2 className="h-4 w-4 text-red-500" /> {t("Link callouts to these sheets")}
          </label>
          <button className="btn btn-sm btn-ghost" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, number: "", title: "", discipline: "" })))} title={t("Keep page numbers and floor names only")}>
            {t("Use page numbers")}
          </button>
          <button className="btn" onClick={onClose}>
            {t("Skip")}
          </button>
          <button className="btn btn-brand" onClick={apply} disabled={busy} data-testid="review-save">
            {busy ? t("Saving…") : t("Save names")}
          </button>
        </div>
      </div>
    </div>
  );
}
