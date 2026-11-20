"use client";
// Photo report: chosen photos (with mark-up) as a branded PDF, or a link the client can open.
import { Copy, Download, Link2, X } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { mapSections, reportComments, reportSections, snapshotSections, type ReportGroupBy } from "@/lib/photoReport";
import { newToken } from "@/lib/proposal";
import { revokePhotoReport } from "@/lib/proposalCloud";
import { renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import Modal from "../ui/Modal";
import { toast } from "@/lib/toast";
import type { Photo } from "@/lib/types";
import type { ReportPhoto } from "./PhotoReportPdf";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function PhotoReport({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const { project, settings, markers, catalog, photoComments } = useEditor();
  const { signedIn, userId } = useSyncStatus();
  const [title, setTitle] = useState(`Photo report — ${project?.address || project?.clientName || "job"}`);
  const [notes, setNotes] = useState("");
  const [perPage, setPerPage] = useState<1 | 2 | 4>(2);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("none");
  const [withComments, setWithComments] = useState(false);
  const [pairs, setPairs] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  if (!project || !settings) return null;

  const ordered = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const range = ordered.length
    ? [ordered[0], ordered[ordered.length - 1]].map((p) => new Date(p.takenAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })).filter((v, i, a) => a.indexOf(v) === i).join(" – ")
    : "";
  const label = (p: Photo) => {
    if (p.beforeId && photos.some((x) => x.id === p.beforeId)) return "After";
    if (photos.some((x) => x.beforeId === p.id)) return "Before";
    return undefined;
  };
  const device = (p: Photo) => {
    const m = markers.find((x) => x.id === p.markerId);
    return m ? `${m.label} ${catalog.find((d) => d.id === m.deviceTypeId)?.name ?? ""}`.trim() : "";
  };
  const hasPairs = photos.some((p) => p.beforeId && photos.some((x) => x.id === p.beforeId));
  const commentCount = photos.reduce((n, p) => n + reportComments(photoComments, p.id).length, 0);
  const sections = () => reportSections(photos, { groupBy, pairs: pairs && hasPairs });
  const comments = (p: Photo) => (withComments ? reportComments(photoComments, p.id) : []);
  const meta = (p: Photo) =>
    [fmt(p.takenAt), p.takenBy, p.room, device(p), p.lat != null && p.lng != null ? `GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ""].filter(Boolean).join(" · ");

  /** Each photo with its mark-up, as a JPEG blob. */
  async function rendered(): Promise<{ p: Photo; blob: Blob }[]> {
    const out: { p: Photo; blob: Blob }[] = [];
    for (const [i, p] of ordered.entries()) {
      setBusy(`Preparing photo ${i + 1} of ${ordered.length}…`);
      const rec = await db().images.get(p.imageId);
      if (rec) out.push({ p, blob: await renderPhoto(rec.blob, p.annotations, perPage === 1 ? 2000 : 1400) });
    }
    return out;
  }

  async function pdf() {
    try {
      const imgs = await rendered();
      setBusy("Building the PDF…");
      const toData = (b: Blob) => new Promise<string>((r) => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result));
        fr.readAsDataURL(b);
      });
      const list: ReportPhoto[] = [];
      const byId = new Map<string, ReportPhoto>();
      for (const { p, blob } of imgs) {
        const r: ReportPhoto = { src: await toData(blob), width: p.width, height: p.height, caption: p.caption, meta: meta(p), tags: p.tags ?? [], label: label(p), comments: comments(p) };
        list.push(r);
        byId.set(p.id, r);
      }
      const secs = mapSections(
        sections()
          .map((s) => ({ ...s, cells: s.cells.map((c) => c.filter((p) => byId.has(p.id))).filter((c) => c.length) }))
          .filter((s) => s.cells.length),
        (p) => byId.get(p.id)!,
      );
      const { renderPhotoReportPdf } = await import("./PhotoReportPdf");
      const out = await renderPhotoReportPdf({ title, business: settings!.business, clientName: project!.clientName, address: project!.address, notes, dateRange: range, perPage, photos: list, sections: secs });
      downloadBlob(out, `${slug(project!.address || "job")}-photo-report.pdf`);
    } catch (e) {
      toast(`Report failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    const sb = getSupabase();
    if (!sb || !userId) return;
    try {
      const token = newToken();
      const imgs = await rendered();
      const out = [];
      const indexOf = new Map<string, number>();
      for (const [i, { p, blob }] of imgs.entries()) {
        setBusy(`Uploading photo ${i + 1} of ${imgs.length}…`);
        const path = `${userId}/reports/${token}/${p.id}.jpg`;
        const { error } = await sb.storage.from("proposals").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        indexOf.set(p.id, out.length);
        const notesOn = comments(p);
        out.push({ url: sb.storage.from("proposals").getPublicUrl(path).data.publicUrl, width: p.width, height: p.height, caption: p.caption ?? "", meta: meta(p), tags: p.tags ?? [], label: label(p) ?? "", ...(notesOn.length ? { comments: notesOn } : {}) });
      }
      setBusy("Publishing…");
      const b = settings!.business;
      const logo = b.logo?.startsWith("/") ? window.location.origin + b.logo : b.logo;
      const grouped = groupBy !== "none" || (pairs && hasPairs);
      const snapshot = {
        version: grouped ? 2 : 1,
        title,
        notes,
        dateRange: range,
        createdAt: new Date().toISOString(),
        client: { name: project!.clientName, address: project!.address },
        business: { name: b.name, phone: b.phone, email: b.email, website: b.website, logo, brandColor: b.brandColor, accentColor: b.accentColor, tagline: b.tagline },
        photos: out,
        ...(grouped ? { sections: snapshotSections(sections(), indexOf) } : {}),
      };
      const { error } = await sb.from("photo_reports").insert({ id: token, project_id: project!.id, snapshot });
      if (error) throw new Error(/does not exist|schema cache/.test(error.message) ? "Photo reports aren't set up in Supabase yet — run supabase/migrations/20261119000000_field_docs.sql." : error.message);
      const url = `${window.location.origin}/r?t=${token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast("Report link copied", "success");
    } catch (e) {
      toast(`Couldn't share: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function stopSharing(url: string) {
    const token = new URL(url).searchParams.get("t");
    if (!token) return;
    try {
      await revokePhotoReport(token);
      setLink(null);
      toast("Link stopped. It no longer opens.", "success");
    } catch (e) {
      toast(`Couldn't stop the link: ${(e as Error).message}`, "error");
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="photo-report-title" className="fixed inset-0 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="card animate-in max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto p-5 shadow-pop">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 id="photo-report-title" className="text-base font-semibold">
              Photo report
            </h2>
            <p className="text-sm text-slate-500">
              {photos.length} photo{photos.length === 1 ? "" : "s"} {range && `· ${range}`} · with your branding, captions and mark-up
            </p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <label className="block text-sm">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="label">Notes for the client (optional)</span>
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pre-wire is complete and ready for insulation…" />
        </label>
        <div className="text-sm">
          <span id="photo-report-per-page" className="label">
            Photos per page
          </span>
          <div className="seg w-fit" role="group" aria-labelledby="photo-report-per-page">
            {([1, 2, 4] as const).map((n) => (
              <button key={n} className={`tab ${perPage === n ? "tab-active" : ""}`} aria-pressed={perPage === n} onClick={() => setPerPage(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="text-sm">
          <span id="photo-report-group" className="label">
            Group photos
          </span>
          <div className="seg w-fit" role="group" aria-labelledby="photo-report-group">
            {(
              [
                ["none", "In order"],
                ["room", "By room"],
                ["day", "By day"],
              ] as const
            ).map(([v, name]) => (
              <button key={v} className={`tab ${groupBy === v ? "tab-active" : ""}`} aria-pressed={groupBy === v} onClick={() => setGroupBy(v)}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={withComments} onChange={(e) => setWithComments(e.target.checked)} />
            Include comments <span className="text-slate-500">({commentCount ? `${commentCount} on these photos` : "none yet"})</span>
          </label>
          <label className={`flex items-center gap-2 ${hasPairs ? "" : "text-slate-400"}`} title={hasPairs ? undefined : "None of these photos are linked as before/after"}>
            <input type="checkbox" checked={pairs && hasPairs} disabled={!hasPairs} onChange={(e) => setPairs(e.target.checked)} />
            Show before / after side by side
          </label>
        </div>
        {link && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="min-w-0 flex-1 truncate">{link}</span>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(link).then(() => toast("Link copied"), () => toast("Couldn't copy — select the link and copy it", "error"))}>
              <Copy /> Copy
            </button>
            <button className="btn btn-sm btn-ghost" title="The link stops working and its photos are deleted from the cloud" onClick={() => void stopSharing(link)}>
              Stop sharing
            </button>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {supabaseConfigured && signedIn ? (
            <button className="btn" disabled={!!busy || !photos.length} onClick={() => void share()} title="Upload the report and copy a link the client can open">
              <Link2 /> Share link
            </button>
          ) : (
            <span className="mr-auto self-center text-xs text-slate-500">Sign in to cloud sync to share a link.</span>
          )}
          <button className="btn btn-brand" disabled={!!busy || !photos.length} onClick={() => void pdf()}>
            <Download /> {busy ?? "Download PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
