"use client";
// The step right after choosing a plan PDF: every page with a large thumbnail, a tick to keep or skip it (covers,
// specs, near-duplicates) and its name, already filled in with the floor read from the page (its text layer, else
// on-device OCR). One button imports the ticked pages. Thumbnails render as they scroll into view, so a 60-page set
// opens at once. docs/sheet-index-links.md ("Import: choose and name pages").
import { Check, Loader2, ScanText, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findFloorName, proposeSheetName } from "@/lib/floorName";
import { useT } from "@/lib/i18n";
import { loadPdfjs, pageTextItems, type PageTextItem } from "@/lib/importPlans";
import { ocrFloorName, OcrCancelled, ocrUnavailableReason, stopOcr, type OcrProgress } from "@/lib/ocr";
import { parseSheetNumber, parseSheetTitle } from "@/lib/sheetIndex";
import Modal from "./ui/Modal";

type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]>["promise"]>;

/** Where a page's proposed name came from. */
type Source = "text" | "ocr" | null;

export interface PickedPage {
  pageNumber: number;
  name: string;
  /** Text read from the page (text layer or OCR), for the sheet index review. */
  items: PageTextItem[];
}

interface Row {
  pageNumber: number;
  keep: boolean;
  name: string;
  source: Source;
  /** The person typed in the name: OCR never overwrites it. */
  edited: boolean;
  /** No text layer: waiting for / being read by OCR. */
  ocr: "pending" | "reading" | "done" | "none";
  items: PageTextItem[];
  /** Page width / height (for the thumbnail box before it renders). */
  aspect: number;
}

/** Render one page to a canvas whose longest side is `maxSide` px. */
async function renderPage(doc: PdfDoc, n: number, maxSide: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

function toUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) =>
    canvas.toBlob(
      (b) => {
        canvas.width = canvas.height = 0;
        resolve(b ? URL.createObjectURL(b) : "");
      },
      "image/jpeg",
      0.82,
    ),
  );
}

export default function ImportPagePicker({ file, onCancel, onImport }: { file: File; onCancel: () => void; onImport: (pages: PickedPage[]) => void }) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [big, setBig] = useState<{ n: number; url: string | null } | null>(null);
  const [ocr, setOcr] = useState<{ page: number; progress: OcrProgress | null } | null>(null);
  const [ocrOff, setOcrOff] = useState(false);
  const docRef = useRef<PdfDoc | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const wanted = useRef(new Set<number>());
  const urls = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);

  /** Run render jobs one at a time (memory on phones). */
  const queue = <T,>(job: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(job, job);
    chain.current = next.catch(() => undefined);
    return next;
  };

  // Open the PDF and read every page's text (fast: nothing is rendered).
  useEffect(() => {
    const made = urls.current;
    let alive = true;
    let task: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const lib = await loadPdfjs();
        const t0 = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        task = t0;
        const doc = await t0.promise;
        if (!alive) return;
        docRef.current = doc;
        const out: Row[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: 1 });
          let items: PageTextItem[] = [];
          try {
            items = pageTextItems(await page.getTextContent(), vp);
          } catch {
            /* scanned page */
          }
          page.cleanup();
          const floor = items.length ? findFloorName(items)?.name : null;
          const number = items.length ? parseSheetNumber(items) : null;
          const title = items.length ? parseSheetTitle(items, number) : null;
          const name = proposeSheetName({ floor, title, number }, "");
          out.push({ pageNumber: n, keep: true, name, source: name ? "text" : null, edited: false, ocr: items.length ? "done" : "pending", items, aspect: vp.width / vp.height });
          if (!alive) return;
        }
        setRows(out);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      abort.current?.abort();
      void task?.destroy();
      docRef.current = null;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [file]);

  // Pages without a text layer: read their title block with OCR, one at a time, in the background. A read runs to its
  // end unless "Stop" is pressed or the picker closes.
  const nextOcr = rows && !ocrOff && !rows.some((r) => r.ocr === "reading") ? rows.find((r) => r.ocr === "pending")?.pageNumber : undefined;
  useEffect(() => {
    const doc = docRef.current;
    if (!nextOcr || !doc) return;
    const n = nextOcr;
    const ctl = new AbortController();
    abort.current = ctl;
    const update = (patch: (r: Row) => Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.pageNumber === n ? { ...r, ...patch(r) } : r)));
    void (async () => {
      update(() => ({ ocr: "reading" }));
      setOcr({ page: n, progress: null });
      let result: Awaited<ReturnType<typeof ocrFloorName>> = null;
      try {
        const canvas = await queue(() => renderPage(doc, n, 2600));
        result = await ocrFloorName(canvas, { signal: ctl.signal, onProgress: (p) => setOcr({ page: n, progress: p }) });
        canvas.width = canvas.height = 0;
      } catch (e) {
        if (e instanceof OcrCancelled || ctl.signal.aborted) return;
      }
      if (ctl.signal.aborted) return;
      setOcr(null);
      const name = result?.name ?? null;
      update((r) => ({ ocr: "done", name: !r.edited && name ? name : r.name, source: !r.edited && name ? "ocr" : r.source, items: result?.items ?? r.items }));
      if (result === null && ocrUnavailableReason()) {
        // The engine can't run here (files missing, old browser): the other scanned pages are named by hand.
        setOcrOff(true);
        setRows((rs) => rs && rs.map((r) => (r.ocr === "pending" ? { ...r, ocr: "none" } : r)));
      }
    })();
  }, [nextOcr]);

  function stopReading() {
    abort.current?.abort();
    void stopOcr();
    setOcrOff(true);
    setOcr(null);
    setRows((rs) => rs && rs.map((r) => (r.ocr === "pending" || r.ocr === "reading" ? { ...r, ocr: "none" } : r)));
  }

  // Thumbnails: render when a card scrolls into view (a 60-page set opens at once).
  const listRef = useRef<HTMLUListElement>(null);
  const pageCount = rows?.length ?? 0;
  useEffect(() => {
    const list = listRef.current;
    if (!list || !pageCount) return;
    const render = (n: number) => {
      if (wanted.current.has(n)) return;
      wanted.current.add(n);
      void queue(async () => {
        const doc = docRef.current;
        if (!doc) return;
        const url = await toUrl(await renderPage(doc, n, 640));
        if (!url) return;
        urls.current.push(url);
        setThumbs((th) => ({ ...th, [n]: url }));
      });
    };
    const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-page]"));
    if (typeof IntersectionObserver === "undefined") {
      cards.forEach((c) => render(Number(c.dataset.page)));
      return;
    }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && render(Number((e.target as HTMLElement).dataset.page))), { rootMargin: "400px 0px" });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [pageCount]);

  async function enlarge(n: number) {
    setBig({ n, url: null });
    const doc = docRef.current;
    if (!doc) return;
    const url = await toUrl(await queue(() => renderPage(doc, n, 2000)));
    if (url) urls.current.push(url);
    setBig((b) => (b && b.n === n ? { n, url } : b));
  }

  const set = (n: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.pageNumber === n ? { ...r, ...patch } : r)));
  const kept = rows?.filter((r) => r.keep) ?? [];
  const allOn = !!rows && kept.length === rows.length;
  const unnamed = kept.filter((r) => !r.name.trim() && r.ocr !== "reading" && r.ocr !== "pending").length;

  function submit() {
    if (!kept.length) return;
    abort.current?.abort();
    onImport(kept.map((r) => ({ pageNumber: r.pageNumber, name: r.name.trim().replace(/\s+/g, " "), items: r.items })));
  }

  return (
    <Modal onClose={onCancel} labelledBy="import-pages-title" closeOnBackdrop={false} className="fixed inset-0 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="card animate-in flex h-[100dvh] w-full flex-col rounded-none pb-[env(safe-area-inset-bottom)] shadow-pop sm:h-[92dvh] sm:max-w-5xl sm:rounded-xl" data-testid="import-pages">
        <div className="flex items-start gap-3 border-b border-slate-100 p-3 sm:p-4">
          <div className="min-w-0 flex-1">
            <h2 id="import-pages-title" className="text-base font-semibold">
              {t("Choose and name pages")}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500" title={file.name}>
              {rows ? t.tn("{name} · {n} page", "{name} · {n} pages", rows.length, { name: file.name }) : file.name}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost -mt-1 -mr-1 h-11 w-11" onClick={onCancel} aria-label={t("Cancel import")}>
            <X />
          </button>
        </div>

        {rows && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm sm:px-4">
            <button type="button" className="btn btn-sm h-11 sm:h-9" onClick={() => setRows(rows.map((r) => ({ ...r, keep: !allOn })))}>
              {allOn ? t("Skip all") : t("Keep all")}
            </button>
            <span className="text-slate-500">{t("Untick pages you don't need (cover, specs, duplicates). Names come from each page; tap a name to change it.")}</span>
            {ocr && (
              <span className="ml-auto flex items-center gap-2 rounded-lg bg-sky-50 px-2.5 py-1 text-xs text-sky-800 ring-1 ring-sky-200" role="status" data-testid="ocr-status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {ocr.progress?.phase === "loading"
                  ? t("Getting text recognition ready ({pct}%)…", { pct: Math.round((ocr.progress.progress ?? 0) * 100) })
                  : t("Reading page {n} (scanned)…", { n: ocr.page })}
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={stopReading}>
                  {t("Stop")}
                </button>
              </span>
            )}
            {ocrOff && rows.some((r) => !r.items.length) && (
              <span className="ml-auto rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-800 ring-1 ring-amber-200">{t("Scanned pages can't be read here — name them by hand.")}</span>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t("Couldn't read that PDF: {error}", { error })}</p>
          ) : !rows ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Reading the pages…")}
            </p>
          ) : (
            <ul ref={listRef} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {rows.map((r) => {
                const label = t("Page {n}", { n: r.pageNumber });
                return (
                  <li key={r.pageNumber} data-page={r.pageNumber} data-testid="import-page" className={`overflow-hidden rounded-xl bg-white ring-1 transition ${r.keep ? "ring-slate-200" : "opacity-55 ring-slate-100"}`}>
                    <div className="relative">
                      <button type="button" className="relative block w-full bg-[#efece7]" style={{ aspectRatio: String(Math.min(2, Math.max(0.6, r.aspect))) }} onClick={() => void enlarge(r.pageNumber)} aria-label={t("Enlarge page {n}", { n: r.pageNumber })}>
                        {thumbs[r.pageNumber] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbs[r.pageNumber]} alt="" className="h-full w-full object-contain p-1" draggable={false} />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                          </span>
                        )}
                        <ZoomIn className="absolute right-2 bottom-2 h-7 w-7 rounded-lg bg-white/90 p-1.5 text-slate-600 shadow ring-1 ring-black/5" />
                      </button>
                      <label className="absolute top-0 left-0 flex h-12 w-12 cursor-pointer items-center justify-center" aria-label={t("Import page {n}", { n: r.pageNumber })}>
                        <input type="checkbox" className="peer sr-only" checked={r.keep} onChange={(e) => set(r.pageNumber, { keep: e.target.checked })} data-testid="import-keep" />
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg shadow ring-1 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 ${r.keep ? "bg-brand-600 text-white ring-brand-700" : "bg-white text-transparent ring-slate-300"}`}>
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                      </label>
                      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">{r.pageNumber}</span>
                    </div>
                    <div className="space-y-1 border-t border-slate-100 p-2">
                      <input
                        className={`input h-11 font-medium sm:h-10 ${r.keep && !r.name.trim() && r.ocr !== "reading" && r.ocr !== "pending" ? "border-amber-300 bg-amber-50/40" : ""}`}
                        value={r.name}
                        placeholder={r.ocr === "reading" || r.ocr === "pending" ? t("Reading…") : t("Name this page")}
                        aria-label={t("Name for page {n}", { n: r.pageNumber })}
                        onChange={(e) => set(r.pageNumber, { name: e.target.value, edited: true })}
                        disabled={!r.keep}
                        data-testid="import-name"
                      />
                      <p className="flex min-h-4 items-center gap-1 text-[11px] leading-tight text-slate-500">
                        {r.ocr === "reading" || r.ocr === "pending" ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> {t("Reading the title block…")}
                          </>
                        ) : r.edited ? (
                          label
                        ) : r.source ? (
                          <>
                            <ScanText className="h-3 w-3 text-emerald-600" /> {r.source === "ocr" ? t("Read from the scan") : t("Read from the page")}
                          </>
                        ) : (
                          <span className="text-amber-700">{t("Couldn't read a name — please name it")}</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3 sm:px-4">
          <span className="mr-auto text-sm text-slate-500">
            {rows ? t("{kept} of {total} pages", { kept: kept.length, total: rows.length }) : ""}
            {unnamed > 0 && <span className="ml-2 text-amber-700">{t.tn("{n} without a name (it gets its page number)", "{n} without a name (they get their page numbers)", unnamed)}</span>}
          </span>
          <button type="button" className="btn h-11" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-brand h-11" disabled={!kept.length} onClick={submit} data-testid="import-pages-go">
            {t.tn("Import {n} page", "Import {n} pages", kept.length)}
          </button>
        </div>
      </div>

      {big && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/85 p-2" onClick={() => setBig(null)} data-testid="import-enlarged">
          {big.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={big.url} alt={t("Page {n}", { n: big.n })} className="max-h-full max-w-full rounded bg-white object-contain" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          )}
          <button type="button" className="btn btn-icon absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 h-11 w-11" onClick={() => setBig(null)} aria-label={t("Close")}>
            <X />
          </button>
          <span className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800">
            {rows?.find((r) => r.pageNumber === big.n)?.name || t("Page {n}", { n: big.n })}
          </span>
        </div>
      )}
    </Modal>
  );
}
