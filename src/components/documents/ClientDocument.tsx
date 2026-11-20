"use client";
// What the client sees at /d?t=…: the company's quote / invoice / credit note, PDF download, accept (sign) or decline a
// quote, and how to pay an invoice. No account needed: the link token is the key.
import { docBrand } from "@/lib/brandDefaults";
import { Check, Download, Printer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchPublicDoc, respondToDoc, type PublicDoc } from "@/lib/docActions";
import { formatDocMoney, payUrl } from "@/lib/documents";
import { downloadBlob, slug } from "@/lib/download";
import { supabaseConfigured } from "@/lib/supabase";
import SignaturePad from "../SignaturePad";
import DocView from "./DocView";

function notifyResponse(token: string) {
  try {
    void fetch("/api/notify/document-response", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => undefined);
  } catch {
    /* the company still sees the answer in the app */
  }
}

export default function ClientDocument() {
  const token = useSearchParams().get("t") ?? "";
  const [d, setD] = useState<PublicDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !supabaseConfigured) return;
    fetchPublicDoc(token)
      .then((r) => {
        setD(r);
        if (r?.snapshot.client.name) setName(r.snapshot.client.name);
      })
      .catch((e) => setError(/does not exist|schema cache|could not find/i.test(e.message) ? "This link isn't available right now. Please contact the company that sent it." : e.message));
  }, [token]);

  if (!token || !supabaseConfigured || d === null) return <Notice title="This link isn't available" body="It may have been withdrawn or replaced by an updated version. Please contact the company that sent it." />;
  if (error && !d) return <Notice title="Couldn't open the document" body={error} />;
  if (!d) return <p className="p-10 text-center text-slate-500">Loading…</p>;

  const s = d.snapshot;
  const money = (n: number) => formatDocMoney(n, s.currency, s.locale);
  const brand = docBrand(s.business.brandColor);
  const live = { status: d.status, number: d.number, amountPaid: d.amountPaid, balanceDue: d.balanceDue, paidAt: d.paidAt, overdue: d.overdue, expired: d.expired };
  const pay = d.kind === "invoice" && d.status !== "void" && d.balanceDue > 0 ? payUrl(s.payment.payUrl, { number: d.number, balanceDue: d.balanceDue, currency: s.currency }) : null;
  const answered = d.status === "accepted" || d.status === "declined";
  const canAnswer = d.kind === "quote" && !answered && !d.expired && (d.status === "sent" || d.status === "viewed");
  const needSig = s.requireSignature;

  async function respond(accept: boolean) {
    setBusy(accept ? "accept" : "decline");
    setError(null);
    try {
      setD(await respondToDoc(token, { accept, name, signature: accept ? signature : null, note }));
      notifyResponse(token);
      top.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy("pdf");
    try {
      const { renderDocPdf } = await import("./DocPdf");
      downloadBlob(await renderDocPdf({ snap: s, live, payLink: pay }), `${slug(`${s.title}-${d!.number ?? ""}`)}.pdf`);
    } catch (e) {
      setError(`PDF failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-full bg-[#f4f6fb] pb-16 print:bg-white print:pb-0" ref={top}>
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
          <div className="mr-auto min-w-0 truncate text-sm font-semibold" style={{ color: brand }}>
            {s.business.name || s.title}
          </div>
          <button className="btn btn-sm" onClick={() => void pdf()} disabled={busy === "pdf"}>
            <Download /> {busy === "pdf" ? "Preparing…" : "PDF"}
          </button>
          <button className="btn btn-sm" onClick={() => window.print()}>
            <Printer /> <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-2 pt-4 sm:px-4 sm:pt-8 print:p-0">
        {d.kind === "quote" && answered && (
          <div className={`mb-4 rounded-2xl px-5 py-4 ring-1 ${d.status === "accepted" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
            {d.status === "accepted" ? (
              <>
                <div className="flex items-center gap-2 font-bold">
                  <Check className="h-5 w-5" /> Accepted{d.signerName ? ` by ${d.signerName}` : ""}
                  {d.respondedAt ? ` on ${new Date(d.respondedAt).toLocaleDateString(s.locale)}` : ""}
                </div>
                <p className="mt-1 text-sm">
                  Thank you! {s.business.name || "We"} will be in touch to schedule the work{s.totals.deposit ? ` and send the deposit invoice (${money(s.totals.deposit)})` : ""}.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 font-bold">
                <X className="h-5 w-5" /> You declined this on {d.respondedAt ? new Date(d.respondedAt).toLocaleDateString(s.locale) : "—"}. Thank you for letting us know.
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl shadow-pop ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
          <DocView snap={s} live={live} payLink={pay} />
        </div>

        {canAnswer && (
          <section className="card mt-5 p-5 sm:p-7 print:hidden">
            {!declining ? (
              <>
                <h2 className="text-lg font-extrabold" style={{ color: brand }}>
                  Accept this {s.title.toLowerCase()}
                </h2>
                <label className="mt-4 block text-sm">
                  <span className="label">Your full name</span>
                  <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                {needSig && (
                  <div className="mt-4">
                    <span className="label">Signature</span>
                    <SignaturePad onChange={setSignature} name={name} />
                  </div>
                )}
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    I accept the work described above for <strong>{money(s.totals.total)}</strong>
                    {s.terms ? " and agree to the terms" : ""}.
                  </span>
                </label>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="btn h-12 rounded-full px-7 text-[15px] font-bold text-white disabled:opacity-50"
                    style={{ background: brand }}
                    disabled={!!busy || !name.trim() || (needSig && !signature) || !agree}
                    onClick={() => void respond(true)}
                  >
                    <Check /> {busy === "accept" ? "Sending…" : `Accept — ${money(s.totals.total)}`}
                  </button>
                  <button className="btn btn-ghost text-slate-500" onClick={() => setDeclining(true)}>
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Decline this {s.title.toLowerCase()}</h2>
                <label className="mt-4 block text-sm">
                  <span className="label">Your name</span>
                  <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="mt-3 block text-sm">
                  <span className="label">Anything we should know? (optional)</span>
                  <textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Timing, budget, scope changes…" />
                </label>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-4 flex gap-3">
                  <button
                    className="btn"
                    onClick={() => {
                      setSignature(null);
                      setDeclining(false);
                    }}
                  >
                    Back
                  </button>
                  <button className="btn btn-danger" disabled={!!busy} onClick={() => void respond(false)}>
                    {busy === "decline" ? "Sending…" : "Decline"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        {d.kind === "quote" && d.expired && !answered && (
          <p className="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-amber-200">This expired. Please ask {s.business.name || "us"} for an updated one.</p>
        )}
        <p className="mt-6 text-center text-xs text-slate-400 print:hidden">
          Questions? {s.business.phone ? <a href={`tel:${s.business.phone.replace(/[^+\d]/g, "")}`} className="underline">{s.business.phone}</a> : null}
          {s.business.phone && s.business.email ? " · " : ""}
          {s.business.email ? <a href={`mailto:${s.business.email}`} className="underline">{s.business.email}</a> : null}
        </p>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-500">{body}</p>
    </div>
  );
}
