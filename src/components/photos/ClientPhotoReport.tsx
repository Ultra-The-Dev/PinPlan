"use client";
// What the client sees from a photo report link: branded, grouped photos with captions; tap to enlarge; print.
import { X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { readSnapshotSections } from "@/lib/photoReport";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { ClientLoading, ClientNotice, ClientPage, ContactFooter, Cover, Letterhead, PrintButton, TitleBlock, type TbCell } from "../client/ClientPage";

interface Snap {
  title: string;
  notes?: string;
  dateRange?: string;
  client: { name: string; address: string };
  business: { name: string; phone?: string; email?: string; website?: string; logo?: string; brandColor?: string; accentColor?: string; tagline?: string; address?: string };
  photos: { url: string; width: number; height: number; caption: string; meta: string; tags: string[]; label: string; comments?: { author?: string; text: string; at?: string }[] }[];
  /** v2: headings and before/after pairs as indexes into `photos`. Missing on v1 reports. */
  sections?: unknown;
}

const shortDate = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
};

export default function ClientPhotoReport() {
  const token = useSearchParams().get("t") ?? "";
  const [s, setS] = useState<Snap | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!token || !sb) return;
    // A network failure shows "not available" instead of loading forever.
    Promise.resolve(sb.rpc("get_photo_report", { p_token: token })).then(
      ({ data, error }) => setS(error || !data ? null : ((data as { snapshot: Snap }).snapshot ?? null)),
      () => setS(null),
    );
  }, [token]);
  // Escape closes the enlarged photo; arrows step through them.
  useEffect(() => {
    if (open == null || !s) return;
    const n = s.photos.length;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : Math.min(n - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, s]);

  if (!token || !supabaseConfigured || s === null) return <ClientNotice title="This link isn’t available" body="It may have been withdrawn. Please contact the company that sent it." />;
  if (!s) return <ClientLoading text="Loading photos…" />;
  const sections = readSnapshotSections(s.photos.length, s.sections);
  const titled = sections.filter((x) => x.title).length;
  const cells: TbCell[] = [
    ...(s.dateRange ? [{ label: "Taken", value: s.dateRange }] : []),
    ...(s.client.address ? [{ label: "Job site", value: s.client.address }] : []),
    ...(titled > 1 ? [{ label: "Areas", value: <span className="num">{titled}</span>, key: true }] : []),
    { label: "Photos", value: <span className="num">{s.photos.length}</span>, key: true },
  ];
  return (
    <ClientPage brandColor={s.business.brandColor} accentColor={s.business.accentColor}>
      <Letterhead business={s.business} tools={<PrintButton label="Print or save PDF" />} wide />
      <Cover kind="Photo report" title={s.title} sub={s.client.name ? <>For <strong>{s.client.name}</strong></> : null} wide />
      <TitleBlock cells={cells} cols={cells.length} wide />
      <main className="cp-wrap cp-wrap-wide cp-body">
        {s.notes && (
          <div className="cp-sheet cp-sec mb-5">
            <p className="cp-letter">{s.notes}</p>
            {s.business.name && <p className="cp-letter-sign">{s.business.name}</p>}
          </div>
        )}
        {sections.map((sec, si) => (
          <section key={si} className="mt-8 first:mt-0">
            {sec.title && <h2 className="cp-h2 mb-3 break-after-avoid">{sec.title}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              {sec.cells.map((cell, ci) => {
                // A single photo with no partner on its row (the grid is two columns on wider screens) spans the
                // row instead of leaving an empty half: picture beside its caption.
                let col = 0;
                for (let k = 0; k < ci; k++) col = sec.cells[k].length > 1 ? 0 : (col + 1) % 2;
                const next = sec.cells[ci + 1];
                const alone = cell.length === 1 && col === 0 && (!next || next.length > 1);
                return cell.length > 1 ? (
                  <div key={ci} className="cp-sheet grid grid-cols-2 gap-px overflow-hidden bg-[var(--cp-hair)] break-inside-avoid sm:col-span-2">
                    {cell.map((i) => (
                      <PhotoFigure key={i} p={s.photos[i]} onOpen={() => setOpen(i)} bare />
                    ))}
                  </div>
                ) : (
                  <PhotoFigure key={ci} p={s.photos[cell[0]]} onOpen={() => setOpen(cell[0])} wide={alone} />
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <ContactFooter business={s.business} ask="Questions about these photos?" wide />
      {open != null && (
        <div className="cp-viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)}>
          <button className="cp-viewer-close" aria-label="Close" autoFocus>
            <X className="h-7 w-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.photos[open].url} alt={s.photos[open].caption || "Job photo"} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </ClientPage>
  );
}

function PhotoFigure({ p, onOpen, bare, wide }: { p: Snap["photos"][number]; onOpen: () => void; bare?: boolean; wide?: boolean }) {
  const comments = Array.isArray(p.comments) ? p.comments.filter((c) => c && typeof c.text === "string" && c.text.trim()) : [];
  return (
    <figure className={`${bare ? "bg-white" : "cp-sheet overflow-hidden break-inside-avoid"} flex flex-col ${wide ? "sm:col-span-2 sm:flex-row sm:items-stretch" : ""}`}>
      <button className={`block w-full bg-[var(--cp-paper)] ${wide ? "sm:w-3/5 sm:shrink-0" : ""}`} onClick={onOpen} aria-label={`Enlarge photo${p.caption ? `: ${p.caption}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.caption || "Job photo"} loading="lazy" className="w-full object-contain" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
      </button>
      <figcaption className={`px-4 pt-3 pb-4 text-[15px] ${wide ? "sm:self-center sm:px-6" : ""}`}>
        {p.label && <div className="text-sm font-bold text-[var(--cp-brand-ink)]">{p.label}</div>}
        {p.caption && <div className="font-semibold">{p.caption}</div>}
        {p.meta && <div className="cp-meta mt-0.5">{p.meta}</div>}
        {p.tags?.length > 0 && <div className="cp-meta mt-1">{p.tags.join(", ")}</div>}
        {comments.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-l-2 border-[var(--cp-rule)] pl-3 text-sm text-[var(--cp-text)]">
            {comments.map((c, i) => (
              <li key={i}>
                <span className="font-semibold">{[c.author, shortDate(c.at)].filter(Boolean).join(", ") || "Comment"}:</span> {c.text}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}
