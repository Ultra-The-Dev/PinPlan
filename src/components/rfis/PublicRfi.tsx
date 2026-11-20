"use client";
// What the GC / architect / owner sees from an RFI link: the question, our suggestion, photos (with mark-up), the spot
// on the plan and the due date, and a box to answer it. No login; everything goes through /api/rfis/public.
import { Check, MapPin, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicRfiView } from "@/lib/rfis";
import AnnotationSvg from "../photos/AnnotationSvg";
import PlanCrop from "./PlanCrop";
import { ClientLoading, ClientNotice, ClientPage, ContactFooter, Cover, Dock, Letterhead, PrintButton, scrollToId, TitleBlock, type TbCell } from "../client/ClientPage";

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

  if (!token || problem === "missing") return <ClientNotice title="This link isn’t available" body="It may have been withdrawn. Please contact the company that sent it." />;
  if (problem === "setup") return <ClientNotice title="Online answers aren’t set up" body="Please reply to the email you received instead." />;
  if (problem === "error") return <ClientNotice title="Couldn’t load this question" body="Check your connection and reload the page." />;
  if (!v) return <ClientLoading text="Loading…" />;

  const company = v.sender.company || "Your contractor";
  const companyInText = v.sender.company || "your contractor";
  const waiting = v.status === "open";
  const business = { name: v.sender.company, logo: v.sender.logo, phone: v.sender.phone, email: v.sender.email, website: v.sender.website };
  const to = [v.toName, v.toCompany].filter(Boolean).join(", ");

  const cells: TbCell[] = [
    ...(v.address ? [{ label: "Job site", value: v.address }] : []),
    ...(v.sentAt ? [{ label: "Sent", value: dayText(v.sentAt) }] : []),
    ...(v.costImpact ? [{ label: "Cost impact", value: IMPACT[v.costImpact] }] : []),
    ...(v.scheduleImpact ? [{ label: "Schedule impact", value: IMPACT[v.scheduleImpact] }] : []),
    ...(v.priority === "high" ? [{ label: "Priority", value: <span className="text-[var(--cp-bad)]">High</span> }] : []),
    ...(v.due && waiting ? [{ label: "Answer needed by", value: dayText(v.due), key: true, wide: true }] : []),
  ];
  const info = cells.filter((c) => !c.wide).length;

  let foot: React.ReactNode;
  let footTone: "ok" | "neutral" | undefined;
  if (waiting) {
    foot = (
      <>
        <p>{v.answer ? "An earlier answer is below. Send a new one if anything changed." : "Read the question, then type your answer at the bottom. No account needed."}</p>
        <button type="button" className="cp-btn cp-btn-block-sm cp-noprint" onClick={() => scrollToId("respond", "textarea")}>
          Answer the question
        </button>
      </>
    );
  } else {
    footTone = v.status === "closed" ? "neutral" : "ok";
    foot = (
      <p>
        <Check className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>{v.status === "closed" ? "Closed" : "Answered"}</strong>
        {v.answeredBy ? ` by ${v.answeredBy}` : ""}
        {v.answeredAt ? ` on ${whenText(v.answeredAt)}` : ""}. {sent ? `Thanks, ${companyInText} has your answer.` : ""}
      </p>
    );
  }

  return (
    <ClientPage brandColor={v.sender.brandColor} accentColor={v.sender.brandColor}>
      <Letterhead business={business} tools={<PrintButton label="Print or save PDF" />} />
      <Cover
        kind={`Request for information ${v.code}`}
        title={v.subject}
        sub={
          to || v.sender.contact ? (
            <>
              {to ? (
                <>
                  To <strong>{to}</strong>
                </>
              ) : null}
              {to && v.sender.contact ? ", from " : v.sender.contact ? "From " : ""}
              {v.sender.contact ? `${v.sender.contact} at ${company}` : ""}
            </>
          ) : null
        }
      />
      <TitleBlock id="cp-next" cells={cells} cols={Math.max(1, Math.min(4, info))} foot={foot} footTone={footTone} />

      <main className="cp-wrap cp-body">
        <div className="cp-sheet">
          <section className="cp-sec">
            <h2 className="cp-h2">Question</h2>
            <p className="cp-letter mt-3">{v.question || v.subject}</p>
            {v.suggestion && (
              <div className="mt-5 border-l-4 border-[var(--cp-rule)] pl-4">
                <h3 className="cp-h3">Our suggestion</h3>
                <p className="mt-1 whitespace-pre-line text-[var(--cp-text)]">{v.suggestion}</p>
              </div>
            )}
          </section>

          {v.plan && (
            <section className="cp-sec">
              <h2 className="cp-h2 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[var(--cp-redline)]" aria-hidden /> Where on the plan
              </h2>
              <div className="mt-4">
                <PlanCrop src={v.plan.url} width={v.plan.width} height={v.plan.height} x={v.plan.x} y={v.plan.y} label={v.plan.sheetName} />
              </div>
            </section>
          )}

          {v.photos.length > 0 && (
            <section className="cp-sec">
              <h2 className="cp-h2">Photos</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.photos.map((p, i) => (
                  <button key={i} className="cp-plan mt-0 text-left" onClick={() => setOpen(i)} aria-label={`Enlarge photo${p.caption ? `: ${p.caption}` : ""}`}>
                    <div className="relative aspect-[4/3] bg-[var(--cp-paper)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.caption || "Photo"} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                      {p.annotations?.length ? <AnnotationSvg shapes={p.annotations} w={p.width || 4} h={p.height || 3} /> : null}
                    </div>
                    {p.caption && <div className="truncate border-t border-[var(--cp-hair)] px-3 py-2 text-sm font-semibold">{p.caption}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {v.answer && (
            <section className="cp-sec" aria-live="polite">
              <h2 className="cp-h2 flex items-center gap-2">
                <Check className="h-5 w-5 text-[var(--cp-ok)]" aria-hidden /> {waiting ? "Earlier answer" : "Answer"}
              </h2>
              <p className="cp-letter mt-3">{v.answer}</p>
              <p className="cp-meta mt-2">{[v.answeredBy, v.answeredAt ? whenText(v.answeredAt) : ""].filter(Boolean).join(", ")}</p>
              {sent && (
                <p className="cp-note mt-4 font-semibold" data-tone="ok">
                  Thanks, {companyInText} has your answer.
                </p>
              )}
            </section>
          )}
        </div>

        {waiting && (
          <form id="respond" className="cp-sheet cp-respond cp-sec cp-noprint" onSubmit={submit}>
            <h2 className="cp-h2">Your answer</h2>
            <p className="cp-intro">No account needed. {company} gets your answer right away.</p>
            <div className="mt-6">
              <div className="cp-field">
                <textarea className="input min-h-40" placeholder="Type your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={5000} required aria-label="Your answer" />
              </div>
              <label className="cp-field block">
                <span className="cp-label">Your name</span>
                <input className="input" autoComplete="name" placeholder="Name, company" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              </label>
            </div>
            {err && (
              <p className="cp-note mt-4" data-tone="bad" role="alert">
                {err}
              </p>
            )}
            <div className="cp-actions">
              <button className="cp-btn cp-btn-block-sm" disabled={busy || !answer.trim() || !name.trim()}>
                {busy ? "Sending…" : "Send answer"}
              </button>
            </div>
          </form>
        )}
      </main>

      <ContactFooter business={business} ask="Questions about this?" />

      {waiting && (
        <Dock watch="cp-next" target="respond">
          <button type="button" className="cp-btn" onClick={() => scrollToId("respond", "textarea")}>
            Answer the question
          </button>
        </Dock>
      )}
      {open != null && v.photos[open] && (
        <div className="cp-viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)}>
          <button className="cp-viewer-close" aria-label="Close" autoFocus>
            <X className="h-7 w-7" />
          </button>
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${v.photos[open].width || 4} / ${v.photos[open].height || 3}`, height: "min(90vh, 100%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.photos[open].url} alt={v.photos[open].caption || "Photo"} className="h-full w-full object-contain" />
            {v.photos[open].annotations?.length ? <AnnotationSvg shapes={v.photos[open].annotations!} w={v.photos[open].width || 4} h={v.photos[open].height || 3} /> : null}
          </div>
        </div>
      )}
    </ClientPage>
  );
}
