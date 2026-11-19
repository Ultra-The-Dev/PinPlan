"use client";
// What the GC / architect / owner sees from an RFI link: the question, our suggestion, photos (with mark-up), the spot
// on the plan and the due date, and a box to answer it. No login; everything goes through /api/rfis/public.
import { CalendarDays, Check, MapPin, Printer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicRfiView } from "@/lib/rfis";
import AnnotationSvg from "../photos/AnnotationSvg";
import PlanCrop from "./PlanCrop";

const NAME_KEY = "pinplan.rfi.answerer";

const dayText = (d: string) => {
  const t = new Date(`${d.slice(0, 10)}T12:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
const whenText = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const IMPACT: Record<string, string> = { yes: "Yes", no: "No", tbd: "To be determined" };

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-500">{text}</p>
    </div>
  );
}

export default function PublicRfi() {
  const token = useSearchParams().get("t") ?? "";
  const [v, setV] = useState<PublicRfiView | null | undefined>(undefined);
  const [problem, setProblem] = useState<"missing" | "setup" | "error" | null>(null);
  const [answer, setAnswer] = useState("");
  // Remembered from an earlier answer on this device (this page only renders in the browser: it reads the URL).
  const [name, setName] = useState(() => {
    try {
      return typeof localStorage === "undefined" ? "" : (localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/rfis/public?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) return setV((await r.json()) as PublicRfiView);
        setProblem(r.status === 404 ? "missing" : r.status === 501 ? "setup" : "error");
        setV(null);
      })
      .catch(() => {
        if (cancelled) return;
        setProblem("error");
        setV(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    if (open == null) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !answer.trim() || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/rfis/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, answer, name }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; view?: PublicRfiView | null };
      if (!r.ok) throw new Error(j.error || `Something went wrong (${r.status})`);
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* storage unavailable */
      }
      setSent(true);
      setV((cur) => j.view ?? (cur ? { ...cur, status: "answered", answer: answer.trim(), answeredBy: name.trim(), answeredAt: new Date().toISOString() } : cur));
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token || problem === "missing") return <Unavailable title="This link isn’t available" text="It may have been withdrawn. Please contact the company that sent it." />;
  if (problem === "setup") return <Unavailable title="Online answers aren’t set up" text="Please reply to the email you received instead." />;
  if (problem === "error") return <Unavailable title="Couldn’t load this question" text="Check your connection and reload the page." />;
  if (!v) return <p className="p-10 text-center text-slate-500">Loading…</p>;

  const brand = v.sender.brandColor || "#0a1b54";
  const company = v.sender.company || "Your contractor";
  const companyInText = v.sender.company || "your contractor";
  const waiting = v.status === "open";
  return (
    <div className="min-h-full bg-[#f4f6fb] text-[#111a33] print:bg-white" style={{ fontFamily: "Manrope, var(--font-sans), system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
      <header className="border-b border-[#e3e7f1] bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.sender.logo ? <img src={v.sender.logo} alt={company} className="mr-auto h-12 w-auto max-w-[200px] object-contain" /> : <div className="mr-auto text-lg font-extrabold" style={{ color: brand }}>{company}</div>}
          <div className="min-w-0 text-right text-sm break-words text-slate-500">
            {v.sender.contact && <div className="font-semibold text-slate-700">{v.sender.contact}</div>}
            {v.sender.phone && <a className="block font-semibold" style={{ color: brand }} href={`tel:${v.sender.phone.replace(/[^+\d]/g, "")}`}>{v.sender.phone}</a>}
            {v.sender.email && <a className="block" href={`mailto:${v.sender.email}`}>{v.sender.email}</a>}
          </div>
        </div>
      </header>
      <section className="text-white" style={{ background: `linear-gradient(180deg, #13294f 0%, ${brand} 100%)` }}>
        <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-white/75">
            <span>Request for information</span>
            <span aria-hidden>·</span>
            <span>{v.code}</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight break-words sm:text-3xl">{v.subject}</h1>
          <p className="mt-2 text-white/80">{[v.address, v.toCompany || v.toName ? `To ${[v.toName, v.toCompany].filter(Boolean).join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {v.due && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold">
                <CalendarDays className="h-4 w-4" /> Answer needed by {dayText(v.due)}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${waiting ? "bg-amber-300 text-amber-950" : "bg-emerald-300 text-emerald-950"}`}>
              {waiting ? "Waiting for your answer" : v.status === "closed" ? "Closed" : "Answered"}
            </span>
            {v.priority === "high" && <span className="rounded-full bg-red-500 px-3 py-1 font-semibold">High priority</span>}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <section className="card p-5">
          <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase">Question</h2>
          <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{v.question || v.subject}</p>
          {v.suggestion && (
            <div className="mt-4 rounded-lg border-l-4 bg-slate-50 p-3" style={{ borderLeftColor: brand }}>
              <div className="text-xs font-bold tracking-wide text-slate-500 uppercase">Our suggestion</div>
              <p className="mt-1 leading-relaxed whitespace-pre-line">{v.suggestion}</p>
            </div>
          )}
          {(v.costImpact || v.scheduleImpact) && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {v.costImpact && (
                <div>
                  <dt className="text-slate-500">Cost impact</dt>
                  <dd className="font-semibold">{IMPACT[v.costImpact]}</dd>
                </div>
              )}
              {v.scheduleImpact && (
                <div>
                  <dt className="text-slate-500">Schedule impact</dt>
                  <dd className="font-semibold">{IMPACT[v.scheduleImpact]}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {v.plan && (
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
              <MapPin className="h-4 w-4" /> Location on the plan
            </h2>
            <PlanCrop src={v.plan.url} width={v.plan.width} height={v.plan.height} x={v.plan.x} y={v.plan.y} label={v.plan.sheetName} />
          </section>
        )}

        {v.photos.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">Photos</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {v.photos.map((p, i) => (
                <button key={i} className="relative overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" onClick={() => setOpen(i)} aria-label={`Enlarge photo${p.caption ? `: ${p.caption}` : ""}`}>
                  <div className="relative aspect-[4/3]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || "Photo"} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                    {p.annotations?.length ? <AnnotationSvg shapes={p.annotations} w={p.width || 4} h={p.height || 3} /> : null}
                  </div>
                  {p.caption && <div className="truncate px-2 py-1 text-left text-xs font-semibold">{p.caption}</div>}
                </button>
              ))}
            </div>
          </section>
        )}

        {v.answer && (
          <section className="card border-l-4 border-l-emerald-500 p-5" aria-live="polite">
            <h2 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-emerald-700 uppercase">
              <Check className="h-4 w-4" /> {waiting ? "Earlier answer" : "Answer"}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{v.answer}</p>
            <p className="mt-2 text-sm text-slate-500">{[v.answeredBy, v.answeredAt ? whenText(v.answeredAt) : ""].filter(Boolean).join(" · ")}</p>
            {sent && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Thanks — {companyInText} has your answer.</p>}
          </section>
        )}

        {waiting && (
          <form className="card space-y-3 p-5 print:hidden" onSubmit={submit}>
            <h2 className="text-base font-bold">Your answer</h2>
            <textarea className="input min-h-36 text-[15px]" placeholder="Type your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={5000} required aria-label="Your answer" />
            <label className="block text-sm">
              <span className="label">Your name</span>
              <input className="input" autoComplete="name" placeholder="Name, company" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </label>
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
            <button className="btn btn-brand h-12 w-full text-base" disabled={busy || !answer.trim() || !name.trim()} style={{ background: brand, borderColor: brand }}>
              {busy ? "Sending…" : "Send answer"}
            </button>
            <p className="text-center text-xs text-slate-500">No account needed. {v.sender.company || "Your contractor"} gets your answer right away.</p>
          </form>
        )}

        <div className="flex justify-center print:hidden">
          <button className="btn btn-sm" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
        </div>
      </main>
      <footer className="text-sm text-white/70 print:hidden" style={{ background: brand }}>
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <span className="font-bold text-white">{company}</span>
          {v.sender.phone ? ` · ${v.sender.phone}` : ""}
        </div>
      </footer>
      {open != null && v.photos[open] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)}>
          <button className="absolute top-4 right-4 text-white" aria-label="Close" autoFocus>
            <X className="h-7 w-7" />
          </button>
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${v.photos[open].width || 4} / ${v.photos[open].height || 3}`, height: "min(90vh, 100%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.photos[open].url} alt={v.photos[open].caption || "Photo"} className="h-full w-full object-contain" />
            {v.photos[open].annotations?.length ? <AnnotationSvg shapes={v.photos[open].annotations!} w={v.photos[open].width || 4} h={v.photos[open].height || 3} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
