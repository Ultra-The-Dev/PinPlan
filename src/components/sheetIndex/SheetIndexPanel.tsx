"use client";
// Sheet index editor (Sheets tab): numbers, titles, disciplines and tags for the whole set, grouped by discipline,
// with bulk discipline / tag changes, "Detect names & links from PDF" for sheets imported earlier, and clean-up of
// automatic links. Office edits everything; technicians edit tags only.
import { ListTree, ScanText, Search, Tags, Unlink, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DISCIPLINE_NAMES, disciplineFromNumber, duplicateNumbers, groupSheetsByDiscipline, matchPagesToSheets, matchSheet, readPdfText, sheetNumberKey } from "@/lib/sheetIndex";
import { useT } from "@/lib/i18n";
import { useJobLinks, useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { Sheet } from "@/lib/types";
import { cleanTags, saveSheetMeta } from "./applyIndex";
import SheetNamesReview, { hasProposals, type ReviewPage } from "./SheetNamesReview";

/** Header button for the Sheets tab: opens the sheet index. */
export function SheetIndexButton({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" disabled={disabled} onClick={() => setOpen(true)} data-testid="sheet-index-open">
        <ListTree /> {t("Sheet index")}
      </button>
      {open && <SheetIndexPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/** Number, discipline, tags and link count under a sheet card. */
export function SheetMetaChips({ sheet }: { sheet: Sheet }) {
  const t = useT();
  const links = useJobLinks();
  const n = links.filter((l) => l.sheetId === sheet.id).length;
  if (!sheet.number && !sheet.discipline && !sheet.tags?.length && !n) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="sheet-meta">
      {sheet.number && <span className="chip bg-ink font-mono text-white">{sheet.number}</span>}
      {sheet.title && <span className="max-w-full truncate text-xs font-medium text-slate-600">{sheet.title}</span>}
      {(sheet.discipline || sheet.number) && <span className="chip bg-sky-50 text-sky-700">{t(sheet.discipline || disciplineFromNumber(sheet.number))}</span>}
      {sheet.tags?.map((tag) => (
        <span key={tag} className="chip bg-slate-100 text-slate-600">
          #{tag}
        </span>
      ))}
      {n > 0 && <span className="chip bg-red-50 text-red-600">{t.tn("{n} link", "{n} links", n)}</span>}
    </div>
  );
}

function SheetIndexPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const sheets = useEditor((s) => s.sheets);
  const role = useRole();
  const office = role !== "tech";
  const links = useJobLinks();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<{ pages: ReviewPage[]; note?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const live = sheets.filter((s) => !s.deleted);
  const groups = useMemo(() => groupSheetsByDiscipline(live.filter((s) => matchSheet(s, q))), [live, q]);
  const dups = useMemo(() => duplicateNumbers(live), [live]);
  const allTags = useMemo(() => [...new Set(live.flatMap((s) => s.tags ?? []))].sort(), [live]);
  const autoCount = links.filter((l) => l.auto).length;
  const chosen = live.filter((s) => sel.has(s.id));
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  async function bulk(patch: (s: Sheet) => Parameters<typeof saveSheetMeta>[0][number]["patch"], what: (n: number) => string) {
    const n = await saveSheetMeta(chosen.map((s) => ({ id: s.id, patch: patch(s) })));
    toast(n ? what(n) : t("Nothing to change"), n ? "success" : "info");
  }

  async function detect(file: File | undefined) {
    if (!file) return;
    setBusy(t("Reading the PDF…"));
    try {
      const pages = await readPdfText(file, (d, total) => setBusy(t("Reading page {n} of {total}…", { n: d, total })));
      const match = matchPagesToSheets(pages, live);
      const matched: ReviewPage[] = pages.filter((p) => match.has(p.pageNumber)).map((p) => ({ sheetId: match.get(p.pageNumber)!, pageNumber: p.pageNumber, items: p.items, text: p.text }));
      const skipped = pages.length - matched.length;
      if (!matched.length) return toast(t("No page of that PDF matches a sheet here (same page number and size, not rotated)."), "info");
      if (!pages.some((p) => p.items.length)) return toast(t("That PDF has no text layer (a scan), so there's nothing to read."), "info");
      if (!hasProposals(matched, { names: true })) toast(t("No sheet numbers found in the title blocks — you can still type them."), "info");
      setReview({ pages: matched, note: skipped ? t.tn("{n} page didn't match a sheet (different page, size or rotated) and was skipped.", "{n} pages didn't match a sheet (different page, size or rotated) and were skipped.", skipped) : undefined });
    } catch (e) {
      toast(t("Couldn't read that PDF: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Sheet index")}
        className="card animate-in flex max-h-[94dvh] w-full flex-col rounded-b-none pb-[env(safe-area-inset-bottom)] shadow-pop sm:max-w-4xl sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex w-full min-w-0 items-start gap-2 sm:w-auto sm:flex-1">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">{t("Sheet index")}</h2>
              <p className="text-xs text-slate-500">{office ? t("Sheet numbers, titles, disciplines and tags.") : t("Tags are yours to edit; numbers and titles are set by the office.")}</p>
            </div>
            <button className="btn btn-sm btn-icon btn-ghost sm:hidden" onClick={onClose} aria-label={t("Close")}>
              <X />
            </button>
          </div>
          {office && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void detect(e.target.files?.[0])} />
              <button className="btn btn-sm" disabled={!!busy || !live.length} onClick={() => fileRef.current?.click()} title={t("Pick the plan PDF again: names and callout links are read from its text (nothing is re-rendered)")}>
                <ScanText /> {busy ?? t("Detect names & links from PDF")}
              </button>
              {autoCount > 0 && (
                <button
                  className="btn btn-sm btn-ghost text-slate-500"
                  onClick={() => confirm(t.tn("Remove {n} automatic link? Links drawn by hand stay.", "Remove all {n} automatic links? Links drawn by hand stay.", autoCount)) && void useSheetLinks.getState().remove(links.filter((l) => l.auto).map((l) => l.id)).then(() => toast(t("Automatic links removed")))}
                >
                  <Unlink /> {t("Remove auto links")}
                </button>
              )}
            </>
          )}
          <button className="btn btn-sm btn-icon btn-ghost hidden sm:inline-flex" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
          <label className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9" placeholder={t("Find a sheet")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Find a sheet")} />
          </label>
          <label className="flex min-h-9 items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="h-4 w-4" checked={!!live.length && sel.size === live.length} onChange={(e) => setSel(e.target.checked ? new Set(live.map((s) => s.id)) : new Set())} />
            {t("All")}
          </label>
        </div>

        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-brand-50/60 px-3 py-2 text-sm sm:px-4" data-testid="bulk-bar">
            <span className="font-medium text-slate-700">{t("{n} selected", { n: chosen.length })}</span>
            {office && (
              <select className="input h-8 w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && void bulk(() => ({ discipline: e.target.value === "__auto" ? null : e.target.value }), (n) => t.tn("Discipline set on {n} sheet", "Discipline set on {n} sheets", n))} aria-label={t("Set discipline")}>
                <option value="">{t("Set discipline…")}</option>
                <option value="__auto">{t("From sheet number")}</option>
                {DISCIPLINE_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {t(d)}
                  </option>
                ))}
              </select>
            )}
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const tag = tagDraft.trim();
                if (!tag) return;
                setTagDraft("");
                void bulk((s) => ({ tags: cleanTags([...(s.tags ?? []), tag]) }), (n) => t.tn("Tagged “{tag}” on {n} sheet", "Tagged “{tag}” on {n} sheets", n, { tag }));
              }}
            >
              <input className="input h-8 w-32 text-xs" list="sheet-tags" placeholder={t("Add tag")} value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} aria-label={t("Add tag")} />
              <button className="btn btn-sm" disabled={!tagDraft.trim()}>
                <Tags /> {t("Add")}
              </button>
            </form>
            {allTags.length > 0 && (
              <select className="input h-8 w-auto py-0 text-xs" value="" onChange={(e) => {
                  const tag = e.target.value;
                  if (tag) void bulk((s) => ({ tags: cleanTags((s.tags ?? []).filter((x) => x !== tag)) }), (n) => t.tn("Removed “{tag}” on {n} sheet", "Removed “{tag}” on {n} sheets", n, { tag }));
                }} aria-label={t("Remove tag")}>
                <option value="">{t("Remove tag…")}</option>
                {allTags.map((tag) => (
                  <option key={tag}>{tag}</option>
                ))}
              </select>
            )}
            <button className="btn btn-sm btn-ghost ml-auto" onClick={() => setSel(new Set())}>
              {t("Clear")}
            </button>
          </div>
        )}
        <datalist id="sheet-tags">
          {allTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-4">
          {!live.length && <p className="p-8 text-center text-sm text-slate-500">{t("No sheets yet. Upload the plan set first.")}</p>}
          {groups.map((g) => (
            <section key={g.discipline}>
              <h3 className="section-title sticky top-0 z-[1] bg-white px-2 pt-3 pb-1">
                {t(g.discipline)} <span className="font-normal text-slate-400">· {g.sheets.length}</span>
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.sheets.map((s) => (
                  <IndexRow key={s.id} sheet={s} office={office} selected={sel.has(s.id)} onToggle={() => toggle(s.id)} dup={!!s.number && dups.has(sheetNumberKey(s.number))} links={links.filter((l) => l.sheetId === s.id).length} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {review && (
        <div onClick={(e) => e.stopPropagation()}>
          <SheetNamesReview pages={review.pages} note={review.note} onClose={() => setReview(null)} />
        </div>
      )}
    </div>
  );
}

/** One sheet: fields save when they lose focus (or on Enter). */
function IndexRow({ sheet, office, selected, onToggle, dup, links }: { sheet: Sheet; office: boolean; selected: boolean; onToggle: () => void; dup: boolean; links: number }) {
  const t = useT();
  const [number, setNumber] = useState(sheet.number ?? "");
  const [title, setTitle] = useState(sheet.title ?? "");
  const [tags, setTags] = useState((sheet.tags ?? []).join(", "));
  const [seen, setSeen] = useState(sheet);
  // Follow changes made elsewhere (bulk edits, undo, sync) while the row isn't being typed in.
  if (seen !== sheet) {
    setSeen(sheet);
    setNumber(sheet.number ?? "");
    setTitle(sheet.title ?? "");
    setTags((sheet.tags ?? []).join(", "));
  }
  const save = (patch: Parameters<typeof saveSheetMeta>[0][number]["patch"]) => void saveSheetMeta([{ id: sheet.id, patch }]);
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  return (
    <li className={`grid grid-cols-[1.75rem_6.5rem_1fr] items-center gap-x-2 gap-y-1.5 px-2 py-2 sm:grid-cols-[1.75rem_7rem_1fr_9rem_12rem] ${selected ? "bg-brand-50/40" : ""}`} data-testid="index-row">
      <input type="checkbox" className="h-4 w-4" checked={selected} onChange={onToggle} aria-label={t("Select {name}", { name: sheet.name })} />
      <input
        className={`input h-9 font-mono text-[13px] font-semibold ${dup ? "border-amber-400 ring-2 ring-amber-100" : ""}`}
        value={number}
        placeholder="—"
        disabled={!office}
        title={dup ? t("Another sheet has this number") : undefined}
        aria-label={t("Number of {name}", { name: sheet.name })}
        onChange={(e) => setNumber(e.target.value.toUpperCase())}
        onBlur={() => {
          const n = number.trim() || null;
          if (n === (sheet.number ?? null)) return;
          // A new number brings its discipline unless one was chosen by hand.
          const auto = !sheet.discipline || sheet.discipline === disciplineFromNumber(sheet.number);
          save({ number: n, ...(auto ? { discipline: n ? disciplineFromNumber(n) : null } : {}) });
        }}
        onKeyDown={enter}
      />
      <div className="min-w-0">
        <input
          className="input h-9"
          value={title}
          placeholder={sheet.name}
          disabled={!office}
          aria-label={t("Title of {name}", { name: sheet.name })}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => (title.trim() || null) !== (sheet.title ?? null) && save({ title: title.trim() || null })}
          onKeyDown={enter}
        />
      </div>
      <select
        className="input col-start-2 h-9 sm:col-start-auto"
        value={sheet.discipline ?? ""}
        disabled={!office}
        onChange={(e) => save({ discipline: e.target.value || null })}
        aria-label={t("Discipline of {name}", { name: sheet.name })}
      >
        <option value="">{sheet.number ? t("{discipline} (from number)", { discipline: t(disciplineFromNumber(sheet.number)) }) : "—"}</option>
        {[...new Set([...DISCIPLINE_NAMES, ...(sheet.discipline ? [sheet.discipline] : [])])].map((d) => (
          <option key={d} value={d}>
            {t(d)}
          </option>
        ))}
      </select>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          className="input h-9 min-w-0 flex-1 text-xs"
          list="sheet-tags"
          value={tags}
          placeholder={t("Tags, comma separated")}
          aria-label={t("Tags of {name}", { name: sheet.name })}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => {
            const next = cleanTags(tags.split(","));
            if (JSON.stringify(next) !== JSON.stringify(sheet.tags ?? null)) save({ tags: next });
          }}
          onKeyDown={enter}
        />
        {links > 0 && (
          <span className="chip shrink-0 bg-red-50 text-red-600" title={t.tn("{n} link on this sheet", "{n} links on this sheet", links)} aria-label={t.tn("{n} link on this sheet", "{n} links on this sheet", links)}>
            {links}
          </span>
        )}
      </div>
    </li>
  );
}
