"use client";
// Every job's photos in one feed (newest first): filter by job, tag or person; open one on its job.
import { Camera, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { filterPhotos, photosByDay, tagOptions } from "@/lib/fieldDocs";
import type { Photo, Project } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";

function Thumb({ photo, job }: { photo: Photo; job?: Project }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <Link href={`/project?id=${photo.projectId}&tab=photos&photo=${photo.id}`} className="group relative block aspect-square overflow-hidden rounded-xl bg-slate-100 hover:ring-2 hover:ring-slate-300">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={photo.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-[11px] leading-tight text-white">
        <div className="truncate font-semibold">{job?.address || job?.clientName || "Job"}</div>
        <div className="truncate opacity-80">{[photo.takenBy, new Date(photo.takenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}

export default function PhotoFeed() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [jobs, setJobs] = useState<Map<string, Project>>(new Map());
  const [job, setJob] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    void (async () => {
      const ps = (await db().projects.toArray()).filter((p) => !p.deleted);
      setJobs(new Map(ps.map((p) => [p.id, p])));
      const ids = new Set(ps.map((p) => p.id));
      setPhotos((await db().photos.toArray()).filter((p) => !p.deleted && ids.has(p.projectId)));
    })();
  }, []);
  const live = useMemo(() => (photos ?? []).filter((p) => !job || p.projectId === job), [photos, job]);
  const shown = useMemo(() => filterPhotos(live, { tags, takenBy: person || null, text }), [live, tags, person, text]);
  const groups = useMemo(() => photosByDay(shown), [shown]);
  const options = useMemo(() => tagOptions(live).slice(0, 14), [live]);
  const people = useMemo(() => [...new Set((photos ?? []).map((p) => p.takenBy).filter((x): x is string => !!x))].sort(), [photos]);
  const jobList = [...jobs.values()].filter((j) => (photos ?? []).some((p) => p.projectId === j.id));

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="page-title">Photos</h1>
        <p className="mt-1 text-sm text-slate-500">Every job’s photos in one place, newest first. Open one to see it on its job.</p>
      </div>
      {photos && photos.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9" placeholder="Search captions, rooms, tags" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <select className="input h-9 w-auto max-w-56" value={job} onChange={(e) => setJob(e.target.value)} aria-label="Job">
            <option value="">All jobs</option>
            {jobList.map((j) => (
              <option key={j.id} value={j.id}>
                {j.address || j.clientName || "Untitled job"}
              </option>
            ))}
          </select>
          {people.length > 1 && (
            <select className="input h-9 w-auto" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Taken by">
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
          <div className="flex basis-full flex-wrap gap-1.5">
            {options.map((t) => (
              <button key={t} className={`chip ${tags.includes(t) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} onClick={() => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {photos === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : photos.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Camera className="h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium">No photos yet</p>
          <p className="mt-1 text-sm text-slate-500">Open a job and use its Photos tab to take or add photos.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <h3 className="mb-2 px-1 font-semibold">
              {new Date(`${g.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} <span className="text-xs font-normal text-slate-400">{g.photos.length}</span>
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {g.photos.map((p) => (
                <Thumb key={p.id} photo={p} job={jobs.get(p.projectId)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
