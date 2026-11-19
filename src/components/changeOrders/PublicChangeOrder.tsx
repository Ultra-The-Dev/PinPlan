"use client";
// What the client sees: a change order by link — what changes and why, the price, photos — then sign and approve
// (or reject with a note). Answers go through /api/change-orders/public; the page never touches the database.
import { docAccent, docBrand } from "@/lib/brandDefaults";
import { CalendarClock, Check, Printer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PublicCoResponse } from "@/lib/changeOrders";
import { formatMoney } from "@/lib/estimate";
import SignaturePad from "../SignaturePad";

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

function scheduleText(days: number | null): string | null {
  if (!days) return null;
  const n = Math.abs(days);
  return `${days > 0 ? "Adds" : "Saves"} ${qtyText(n)} working day${n === 1 ? "" : "s"}`;
}

export default function PublicChangeOrder() {
  const token = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<PublicCoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setError("This link is missing its code. Please open the link from your email again.");
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(`/api/change-orders/public?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError((j as { error?: string }).error ?? "This change order isn't available.");
      else setData(j as PublicCoResponse);
    } catch {
      setError("Couldn't load the change order. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function answer(decision: "approve" | "reject") {
    setBusy(true);
    setFormError(null);
    try {
      const r = await fetch("/api/change-orders/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, decision, name, signature: decision === "approve" ? signature : null, comment }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setFormError((j as { error?: string }).error ?? "Couldn't send your answer. Please try again.");
      else {
        setData(j as PublicCoResponse);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setFormError("Couldn't send your answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-10 text-center text-slate-500">Loading your change order…</p>;
  if (error || !data)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-lg font-semibold">Change order unavailable</p>
        <p className="mt-2 text-slate-500">{error}</p>
      </div>
    );

  const v = data.view;
  const cur = v.currency || "USD";
  const brand = docBrand(v.business.brandColor);
  const accent = docAccent(v.business.accentColor);
  const theme = { "--brand": brand, "--accent": accent } as React.CSSProperties;
  const schedule = scheduleText(v.scheduleDays);
  const answered = data.status !== "sent";

  return (
    <div className="proposal min-h-full bg-[#f4f6fb] text-[#111a33] print:bg-white" style={theme}>
      <header className="border-b border-[#e3e7f1] bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
          <div className="mr-auto flex items-center">
            {v.business.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.business.logo} alt={v.business.name} className="h-12 w-auto max-w-[220px] object-contain sm:h-14" />
            ) : (
              <div className="text-xl font-extrabold tracking-tight text-[var(--brand)]">{v.business.name || "Change order"}</div>
            )}
          </div>
          <div className="min-w-0 text-right text-sm leading-relaxed break-words text-slate-500">
            {v.business.phone && (
              <a href={`tel:${v.business.phone.replace(/[^+\d]/g, "")}`} className="block font-semibold text-[var(--brand)]">
                {v.business.phone}
              </a>
            )}
            <div>{[v.business.email, v.business.website].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn btn-sm print:hidden" onClick={() => window.print()}>
            <Printer /> Print
          </button>
        </div>
      </header>

      <section className="bg-[var(--brand)] text-white print:bg-white print:text-black">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">Change order {v.code}</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight break-words text-balance sm:text-3xl">{v.title}</h1>
          <dl className="mt-4 grid gap-x-8 gap-y-1.5 text-sm text-white/80 sm:grid-cols-2 print:text-slate-600">
            <div className="flex gap-2">
              <dt className="text-white/55">For</dt>
              <dd className="font-semibold text-white print:text-black">{v.project.clientName || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-white/55">Date</dt>
              <dd>{fmtDate(v.sentAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-white/55">Project</dt>
              <dd>{v.project.address || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-white/55">Reason</dt>
              <dd>{v.reasonLabel}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-xs text-white/60 print:text-slate-500">Change amount</div>
              <div className="text-3xl font-extrabold text-[var(--accent)] tabular-nums print:text-black" data-testid="co-total">
                {formatMoney(v.total, cur)}
              </div>
            </div>
            {schedule && (
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm ring-1 ring-white/20">
                <CalendarClock className="h-4 w-4" /> {schedule}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {answered && (
          <div
            role="status"
            className={`rounded-2xl px-5 py-4 ring-1 ${data.status === "approved" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}
          >
            {data.status === "approved" ? (
              <>
                <div className="flex items-center gap-2 font-bold">
                  <Check className="h-5 w-5" /> Approved{data.approvedName ? ` by ${data.approvedName}` : ""} on {fmtDate(data.respondedAt)}
                </div>
                <p className="mt-1 text-sm">Thank you. {v.business.name || "We"} will schedule the work. You can print this page for your records.</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 font-bold">
                  <X className="h-5 w-5" /> You declined this change on {fmtDate(data.respondedAt)}.
                </div>
                <p className="mt-1 text-sm">Thank you for letting us know. {v.business.name || "We"} will be in touch.</p>
              </>
            )}
          </div>
        )}

        {v.description && (
          <section className="card border-l-4 border-[var(--accent)] p-5 text-[15px] leading-relaxed whitespace-pre-line text-slate-700">{v.description}</section>
        )}

        <section className="card overflow-hidden">
          <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold tracking-wide text-[var(--brand)] uppercase">What changes</h2>
          <ul className="divide-y divide-slate-100">
            {v.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">{l.description}</div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {qtyText(l.qty)} {l.unit} × {formatMoney(l.unitPrice, cur)}
                  </div>
                </div>
                <div className={`shrink-0 font-semibold tabular-nums ${l.total < 0 ? "text-emerald-700" : ""}`}>{formatMoney(l.total, cur)}</div>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(v.subtotal, cur)}</dd>
            </div>
            {v.tax !== 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax ({v.taxPct}%)</dt>
                <dd className="tabular-nums">{formatMoney(v.tax, cur)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <dt>Total change</dt>
              <dd className="tabular-nums">{formatMoney(v.total, cur)}</dd>
            </div>
          </dl>
        </section>

        {v.photos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-[var(--brand)] uppercase">Photos</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {v.photos.map((p, i) => (
                <figure key={i} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </a>
                  {p.caption && <figcaption className="px-2 py-1.5 text-xs text-slate-600">{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        {!answered && (
          <section className="card p-5 print:hidden">
            <h2 className="text-lg font-bold">{rejecting ? "Decline this change" : "Approve this change"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rejecting
                ? "Let us know why, and we'll follow up."
                : `By signing you approve ${v.code} and agree to the change of ${formatMoney(v.total, cur)}${schedule ? ` (${schedule.toLowerCase()})` : ""} to your contract.`}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="co-name">
                  Your name
                </label>
                <input id="co-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              {!rejecting && (
                <div>
                  <span className="label">Signature</span>
                  <SignaturePad onChange={setSignature} />
                </div>
              )}
              <div>
                <label className="label" htmlFor="co-comment">
                  {rejecting ? "Reason" : "Comment (optional)"}
                </label>
                <textarea id="co-comment" className="input min-h-[72px]" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              {!rejecting && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I approve this change order and the amount above.</span>
                </label>
              )}
              {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
              <div className="flex flex-wrap gap-2">
                {rejecting ? (
                  <>
                    <button className="btn btn-danger" disabled={busy || !comment.trim()} onClick={() => void answer("reject")}>
                      <X /> Decline change order
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>
                      Back
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-brand flex-1 sm:flex-none" disabled={busy || !name.trim() || !signature || !agree} onClick={() => void answer("approve")}>
                      <Check /> {busy ? "Sending…" : "Approve and sign"}
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(true)}>
                      Decline
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="pt-2 text-center text-xs text-slate-400">
          {[v.business.name, v.business.address].filter(Boolean).join(" · ")}
        </footer>
      </div>
    </div>
  );
}
