"use client";
// Photo report: chosen photos (with mark-up) as a branded PDF, or a link the client can open.
import { Copy, Download, Link2, X } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { newToken } from "@/lib/proposal";
import { renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { Photo } from "@/lib/types";
import type { ReportPhoto } from "./PhotoReportPdf";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function PhotoReport({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const { project, settings, markers, catalog } = useEditor();
  const { signedIn, userId } = useSyncStatus();
  const [title, setTitle] = useState(`Photo report — ${project?.address || project?.clientName || "job"}`);
  const [notes, setNotes] = useState("");
  const [perPage, setPerPage] = useState<1 | 2 | 4>(2);
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
      for (const { p, blob } of imgs) list.push({ src: await toData(blob), width: p.width, height: p.height, caption: p.caption, meta: meta(p), tags: p.tags ?? [], label: label(p) });
      const { renderPhotoReportPdf } = await import("./PhotoReportPdf");
      const out = await renderPhotoReportPdf({ title, business: settings!.business, clientName: project!.clientName, address: project!.address, notes, dateRange: range, perPage, photos: list });
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
      for (const [i, { p, blob }] of imgs.entries()) {
        setBusy(`Uploading photo ${i + 1} of ${imgs.length}…`);
        const path = `${userId}/reports/${token}/${p.id}.jpg`;
        const { error } = await sb.storage.from("proposals").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        out.push({ url: sb.storage.from("proposals").getPublicUrl(path).data.publicUrl, width: p.width, height: p.height, caption: p.caption ?? "", meta: meta(p), tags: p.tags ?? [], label: label(p) ?? "" });
      }
      setBusy("Publishing…");
      const b = settings!.business;
      const logo = b.logo?.startsWith("/") ? window.location.origin + b.logo : b.logo;
      const snapshot = {
        version: 1,
        title,
        notes,
        dateRange: range,
        createdAt: new Date().toISOString(),
        client: { name: project!.clientName, address: project!.address },
        business: { name: b.name, phone: b.phone, email: b.email, website: b.website, logo, brandColor: b.brandColor, accentColor: b.accentColor, tagline: b.tagline },
        photos: out,
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Photo report" className="card animate-in max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold">Photo report</h2>
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
          <span className="label">Photos per page</span>
          <div className="seg w-fit">
            {([1, 2, 4] as const).map((n) => (
              <button key={n} className={`tab ${perPage === n ? "tab-active" : ""}`} aria-pressed={perPage === n} aria-label={`${n} per page`} onClick={() => setPerPage(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        {link && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="min-w-0 flex-1 truncate">{link}</span>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(link)}>
              <Copy /> Copy
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
    </div>
  );
}
