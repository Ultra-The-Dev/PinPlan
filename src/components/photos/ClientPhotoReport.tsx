"use client";
// What the client sees from a photo report link: branded, grouped photos with captions; tap to enlarge; print.
import { Printer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";

interface Snap {
  title: string;
  notes?: string;
  dateRange?: string;
  client: { name: string; address: string };
  business: { name: string; phone?: string; email?: string; website?: string; logo?: string; brandColor?: string; accentColor?: string; tagline?: string };
  photos: { url: string; width: number; height: number; caption: string; meta: string; tags: string[]; label: string }[];
}

export default function ClientPhotoReport() {
  const token = useSearchParams().get("t") ?? "";
  const [s, setS] = useState<Snap | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!token || !sb) return;
    sb.rpc("get_photo_report", { p_token: token }).then(({ data, error }) => setS(error || !data ? null : ((data as { snapshot: Snap }).snapshot ?? null)));
  }, [token]);

  if (!token || !supabaseConfigured || s === null)
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">This link isn’t available</h1>
        <p className="mt-2 text-slate-500">It may have been withdrawn. Please contact the company that sent it.</p>
      </div>
    );
  if (!s) return <p className="p-10 text-center text-slate-500">Loading photos…</p>;
  const brand = s.business.brandColor || "#0a1b54";
  const accent = s.business.accentColor || "#13e57c";
  return (
    <div className="min-h-full bg-[#f4f6fb] text-[#111a33] print:bg-white" style={{ fontFamily: "Manrope, var(--font-sans), system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
      <header className="border-b border-[#e3e7f1] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.business.logo ? <img src={s.business.logo} alt={s.business.name} className="mr-auto h-14 w-auto max-w-[240px] object-contain" /> : <div className="mr-auto text-xl font-extrabold" style={{ color: brand }}>{s.business.name}</div>}
          <div className="text-right text-sm text-slate-500">
            {s.business.phone && <a className="block font-semibold" style={{ color: brand }} href={`tel:${s.business.phone.replace(/[^+\d]/g, "")}`}>{s.business.phone}</a>}
            <div>{[s.business.email, s.business.website].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn btn-sm print:hidden" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
        </div>
      </header>
      <section className="text-white" style={{ background: `radial-gradient(60% 120% at 100% 0%, ${accent}33 0%, transparent 60%), linear-gradient(180deg, #13294f 0%, ${brand} 100%)` }}>
        <div className="mx-auto max-w-5xl px-4 py-9 sm:px-6">
          {s.business.tagline && <div className="text-xs font-semibold tracking-[0.14em] uppercase" style={{ color: accent }}>{s.business.tagline}</div>}
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{s.title}</h1>
          <p className="mt-2 text-white/75">{[s.client.name, s.client.address, s.dateRange, `${s.photos.length} photos`].filter(Boolean).join(" · ")}</p>
        </div>
      </section>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {s.notes && <p className="card mb-6 border-l-4 p-5 leading-relaxed whitespace-pre-line text-slate-700" style={{ borderLeftColor: accent }}>{s.notes}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          {s.photos.map((p, i) => (
            <figure key={i} className="card overflow-hidden break-inside-avoid">
              <button className="block w-full bg-slate-100" onClick={() => setOpen(i)} aria-label="Enlarge photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || "Job photo"} loading="lazy" className="w-full object-contain" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              </button>
              <figcaption className="px-4 py-3 text-sm">
                {p.label && <div className="text-[11px] font-bold tracking-wide uppercase" style={{ color: brand }}>{p.label}</div>}
                {p.caption && <div className="font-semibold">{p.caption}</div>}
                <div className="text-slate-500">{p.meta}</div>
                {p.tags.length > 0 && <div className="mt-1 text-xs text-slate-400">{p.tags.join(" · ")}</div>}
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
      <footer className="text-sm text-white/70 print:hidden" style={{ background: brand }}>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <span className="font-bold text-white">{s.business.name}</span>
          {s.business.phone ? ` · ${s.business.phone}` : ""}
        </div>
      </footer>
      {open != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <button className="absolute top-4 right-4 text-white" aria-label="Close">
            <X className="h-7 w-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.photos[open].url} alt={s.photos[open].caption || "Job photo"} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
