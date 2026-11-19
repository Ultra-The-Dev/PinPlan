"use client";
// Everything that happened on the job, newest first: photos, comments, checklist items, logs, documents, Billdu.
import { BookOpen, Camera, ClipboardCheck, FileText, FolderPlus, MessageSquare, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { localDay, timeline, type TimelineEvent } from "@/lib/fieldDocs";
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
  const events = useMemo(() => (project ? timeline({ project, photos, photoComments, checklists, jobLogs, documents }) : []), [project, photos, photoComments, checklists, jobLogs, documents]);
  if (!project) return null;
  return (
    <div>
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
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
    </div>
  );
}
