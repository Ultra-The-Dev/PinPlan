"use client";
// Where a plan link goes: another sheet (search by number / title), a job document, a photo or a web page.
// A bottom sheet on phones, a centred card on larger screens.
import { FileText, Globe, Image as ImageIcon, Map as MapIcon, Search, Trash, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { groupSheetsByDiscipline, matchSheet, normalizeUrl, sheetDisplayName } from "@/lib/sheetIndex";
import { msg, useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import type { Photo, SheetLinkTarget } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";

type Kind = SheetLinkTarget["kind"];

const TABS: { id: Kind; label: string; icon: typeof FileText }[] = [
  { id: "sheet", label: msg("Sheet"), icon: MapIcon },
  { id: "document", label: msg("Document"), icon: FileText },
  { id: "photo", label: msg("Photo"), icon: ImageIcon },
  { id: "url", label: msg("Web link"), icon: Globe },
];

/** A short label for a link (shown in lists and the Documents back-links). */
export function targetLabel(t: SheetLinkTarget, st: { sheets: { id: string; name: string; number?: string | null }[]; documents: { id: string; name: string }[]; photos: { id: string; caption?: string | null }[] }): string {
  if (t.kind === "sheet") {
    const s = st.sheets.find((x) => x.id === t.sheetId);
    return s ? (s.number?.trim() || s.name) : "Sheet";
  }
  if (t.kind === "document") return st.documents.find((d) => d.id === t.documentId)?.name ?? "Document";
  if (t.kind === "photo") return st.photos.find((p) => p.id === t.photoId)?.caption?.trim() || "Photo";
  try {
    return new URL(t.url).hostname;
  } catch {
    return t.url;
  }
}

function Thumb({ photo }: { photo: Photo }) {
  const t = useT();
  const url = useBlobUrl(photo.imageId);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={photo.caption ?? t("Job photo")} className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-slate-100" />;
}

export default function LinkTargetPicker(props: {
  sourceSheetId: string;
  initial?: SheetLinkTarget | null;
  title: string;
  onPick: (target: SheetLinkTarget, label: string) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const sheets = useEditor((s) => s.sheets);
  const documents = useEditor((s) => s.documents);
  const photos = useEditor((s) => s.photos);
  const [kind, setKind] = useState<Kind>(props.initial?.kind ?? "sheet");
  const [q, setQ] = useState("");
  const [url, setUrl] = useState(props.initial?.kind === "url" ? props.initial.url : "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const backdropDown = useRef(false);
  const cur = props.initial;
  const groups = useMemo(() => groupSheetsByDiscipline(sheets.filter((s) => !s.deleted && s.id !== props.sourceSheetId && matchSheet(s, q))), [sheets, q, props.sourceSheetId]);
  const docs = documents.filter((d) => !d.deleted && d.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pics = photos.filter((p) => !p.deleted && (!q.trim() || [p.caption, p.room, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 60);
  const pick = (tg: SheetLinkTarget) => props.onPick(tg, targetLabel(tg, { sheets, documents, photos }));
  const isCur = (tg: SheetLinkTarget) => !!cur && cur.kind === tg.kind && JSON.stringify(cur) === JSON.stringify(tg);
  const row = "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 active:bg-slate-100";

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      // Close on a tap that starts on the backdrop: the click a touch browser sends after the tap that opened the picker doesn't count.
      onPointerDown={(e) => (backdropDown.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && backdropDown.current && props.onCancel()}
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), props.onCancel())}
      data-plan-ui
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="card animate-in flex max-h-[85dvh] w-full flex-col rounded-b-none pb-[env(safe-area-inset-bottom)] shadow-pop sm:max-w-md sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 p-3 pb-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{props.title}</h2>
          {props.onDelete && (
            <button className="btn btn-sm btn-ghost text-red-600 hover:bg-red-50" onClick={props.onDelete}>
              <Trash /> {t("Delete link")}
            </button>
          )}
          <button className="btn btn-sm btn-icon btn-ghost" onClick={props.onCancel} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="space-y-2 p-3 pb-2">
          <div className="seg w-full" role="tablist">
            {TABS.map((tb) => (
              <button key={tb.id} role="tab" aria-selected={kind === tb.id} className={`tab flex-1 justify-center px-1.5 text-xs sm:text-sm ${kind === tb.id ? "tab-active" : ""}`} onClick={() => setKind(tb.id)}>
                <tb.icon /> {t(tb.label)}
              </button>
            ))}
          </div>
          {kind !== "url" && (
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder={kind === "sheet" ? t("Sheet number or title (E-501, riser…)") : kind === "document" ? t("Document name") : t("Caption, room or tag")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t("Search")}
              />
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {kind === "sheet" &&
            (groups.length ? (
              groups.map((g) => (
                <div key={g.discipline}>
                  <div className="section-title px-3 pt-2 pb-1">{t(g.discipline)}</div>
                  {g.sheets.map((s) => {
                    const tg: SheetLinkTarget = { kind: "sheet", sheetId: s.id };
                    return (
                      <button key={s.id} className={`${row} ${isCur(tg) ? "bg-brand-50" : ""}`} onClick={() => pick(tg)}>
                        <span className="w-16 shrink-0 font-mono text-xs font-semibold text-slate-900">{s.number || "—"}</span>
                        <span className="min-w-0 flex-1 truncate">{s.number ? s.title || s.name : sheetDisplayName(s)}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{q ? t("No other sheets match.") : t("No other sheets.")}</p>
            ))}
          {kind === "document" &&
            (docs.length ? (
              docs.map((d) => {
                const tg: SheetLinkTarget = { kind: "document", documentId: d.id };
                return (
                  <button key={d.id} className={`${row} ${isCur(tg) ? "bg-brand-50" : ""}`} onClick={() => pick(tg)}>
                    <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  </button>
                );
              })
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{documents.some((d) => !d.deleted) ? t("No documents match.") : t("No documents yet. Add cut sheets and specs in Field › Documents.")}</p>
            ))}
          {kind === "photo" &&
            (pics.length ? (
              <div className="grid grid-cols-3 gap-1.5 px-1 sm:grid-cols-4">
                {pics.map((p) => {
                  const tg: SheetLinkTarget = { kind: "photo", photoId: p.id };
                  return (
                    <button key={p.id} className={`aspect-square overflow-hidden rounded-lg ring-2 ${isCur(tg) ? "ring-brand-500" : "ring-transparent hover:ring-slate-300"}`} onClick={() => pick(tg)} aria-label={p.caption || t("Photo")}>
                      <Thumb photo={p} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{q ? t("No photos match.") : t("No photos on this job yet.")}</p>
            ))}
          {kind === "url" && (
            <form
              className="space-y-3 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                const u = normalizeUrl(url);
                if (!u) return setUrlError(t("Type a web address, e.g. https://example.com/spec.pdf"));
                pick({ kind: "url", url: u });
              }}
            >
              <div>
                <label className="label" htmlFor="link-url">
                  {t("Web address")}
                </label>
                <input id="link-url" className="input" inputMode="url" autoFocus placeholder="https://…" value={url} onChange={(e) => (setUrl(e.target.value), setUrlError(null))} />
                {urlError && <p className="mt-1 text-xs text-red-600">{urlError}</p>}
              </div>
              <button className="btn btn-brand w-full">{t("Link to this page")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
