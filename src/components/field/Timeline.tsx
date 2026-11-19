"use client";
// Everything that happened on the job, newest first: photos, comments, checklist items, logs, documents, Billdu.
import { BookOpen, Camera, ClipboardCheck, FileText, FolderPlus, MessageSquare, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { filterTimeline, localDay, pageTimeline, timeline, TIMELINE_FILTERS, TIMELINE_PAGE, timelinePeople, type TimelineEvent, type TimelineFilterId } from "@/lib/fieldDocs";
import { useEditor } from "@/lib/store";
import type { Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import PhotoViewer from "../photos/PhotoViewer";

const ICON: Record<TimelineEvent["kind"], React.ComponentType<{ className?: string }>> = {
  created: FolderPlus,
  photos: Camera,
  comment: MessageSquare,
  checklist: ClipboardCheck,
  log: BookOpen,
  document: FileText,
  billdu: Receipt,
};

function Mini({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onClick} className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100" aria-label="Open photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

export default function Timeline() {
  const { project, photos, photoComments, checklists, jobLogs, documents } = useEditor();
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  const [kinds, setKinds] = useState<TimelineFilterId[]>([]);
  const [person, setPerson] = useState("");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(TIMELINE_PAGE);
  const all = useMemo(() => (project ? timeline({ project, photos, photoComments, checklists, jobLogs, documents }) : []), [project, photos, photoComments, checklists, jobLogs, documents]);
  const people = useMemo(() => timelinePeople(all), [all]);
  const filtered = useMemo(() => filterTimeline(all, { kinds, who: person, text }), [all, kinds, person, text]);
  const { shown: events, remaining } = pageTimeline(filtered, limit);
  const filtering = kinds.length > 0 || !!person || !!text.trim();
  // Changing a filter starts again from the newest events.
  const refilter = (f: () => void) => (f(), setLimit(TIMELINE_PAGE));
  if (!project) return null;
  return (
    <div>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9" type="search" aria-label="Search the timeline" placeholder="Search the timeline" value={text} onChange={(e) => refilter(() => setText(e.target.value))} />
          </div>
          {people.length > 0 && (
            <select className="input h-9 w-auto" value={person} onChange={(e) => refilter(() => setPerson(e.target.value))} aria-label="Person">
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip ${kinds.includes(f.id) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              aria-pressed={kinds.includes(f.id)}
              onClick={() => refilter(() => setKinds((ks) => (ks.includes(f.id) ? ks.filter((x) => x !== f.id) : [...ks, f.id])))}
            >
              {f.label}
            </button>
          ))}
          {filtering && (
            <button className="chip bg-white text-slate-500 ring-1 ring-slate-200" onClick={() => refilter(() => (setKinds([]), setPerson(""), setText("")))}>
              Clear filters
            </button>
          )}
        </div>
        {filtering && (
          <div className="text-xs text-slate-500">
            {filtered.length} of {all.length} events
          </div>
        )}
      </div>
      {events.length === 0 && <div className="py-8 text-center text-sm text-slate-500">{filtering ? "No events match these filters." : "Nothing on the timeline yet."}</div>}
      <ol className="relative space-y-1 border-l border-slate-200 pl-6">
        {events.map((e, i) => {
          const day = localDay(e.at);
          const header = i === 0 || localDay(events[i - 1].at) !== day;
          const Icon = ICON[e.kind];
          const ps = (e.photoIds ?? []).map((id) => photos.find((p) => p.id === id && !p.deleted)).filter((p): p is Photo => !!p);
          return (
            <li key={i}>
              {header && <div className="-ml-6 pt-4 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>}
              <div className="relative py-2">
                <span className="absolute top-2.5 -left-[35px] flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                </span>
                <div className="text-sm">
                  <span className="font-medium">{e.text}</span>
                  <span className="text-slate-400">
                    {" "}
                    · {e.who ? `${e.who} · ` : ""}
                    {new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {ps.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ps.slice(0, 8).map((p) => (
                      <Mini key={p.id} photo={p} onClick={() => setViewer({ list: ps, id: p.id })} />
                    ))}
                    {ps.length > 8 && <span className="self-center text-xs text-slate-500">+{ps.length - 8} more</span>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {remaining > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button type="button" className="btn btn-sm" onClick={() => setLimit((n) => n + TIMELINE_PAGE)}>
            Load more
          </button>
          <span className="text-xs text-slate-500">{remaining} older</span>
        </div>
      )}
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
    </div>
  );
}
