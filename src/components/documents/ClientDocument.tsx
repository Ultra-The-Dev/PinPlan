"use client";
// What the client sees at /d?t=…: the company's quote / invoice / credit note, PDF download, accept (sign) or decline a
// quote, and how to pay an invoice. No account needed: the link token is the key.
import { Check, Download, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchPublicDoc, respondToDoc, type PublicDoc } from "@/lib/docActions";
import { formatDocDate, formatDocMoney, payUrl } from "@/lib/documents";
import { downloadBlob, slug } from "@/lib/download";
import { supabaseConfigured } from "@/lib/supabase";
import SignaturePad from "../SignaturePad";
import DocView from "./DocView";
import { ClientLoading, ClientNotice, ClientPage, ContactFooter, Cover, Dock, Letterhead, PrintButton, scrollToId, TitleBlock, type TbCell } from "../client/ClientPage";

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

  if (!token || !supabaseConfigured || d === null) return <ClientNotice title="This link isn't available" body="It may have been withdrawn or replaced by an updated version. Please contact the company that sent it." />;
  if (error && !d) return <ClientNotice title="Couldn't open the document" body={error} />;
  if (!d) return <ClientLoading text="Loading…" />;

  const s = d.snapshot;
  const money = (n: number) => formatDocMoney(n, s.currency, s.locale);
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
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      top.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
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

  const isQuote = d.kind === "quote";
  const isInvoice = d.kind === "invoice";
  const heading = `${s.title}${d.number ? ` ${d.number}` : ""}`;
  const site = s.client.siteAddress || s.client.billingAddress || "";
  const day = (x: string | null | undefined) => formatDocDate(x, s.locale);

  const cells: TbCell[] = [
    { label: "Date", value: day(s.issueDate) || "—" },
    ...(isQuote && s.validUntil ? [{ label: "Valid until", value: day(s.validUntil) }] : []),
    ...(isInvoice && (d.dueDate || s.dueDate) ? [{ label: "Due", value: day(d.dueDate || s.dueDate) }] : []),
  ];
  if (isInvoice && d.status !== "void") {
    cells.push({ label: s.deductions?.length ? "This invoice" : "Total", value: money(s.totals.total), key: true });
    cells.push({ label: d.status === "paid" ? "Paid" : "Balance due", value: money(d.status === "paid" ? d.amountPaid : d.balanceDue), key: true });
  } else {
    cells.push({
      label: "Total",
      value: (
        <>
          {money(s.totals.total)}
          {isQuote && s.totals.deposit ? <small className="mt-1 block">Deposit on approval: {money(s.totals.deposit)}</small> : null}
        </>
      ),
      key: true,
      wide: true,
    });
  }

  const when = d.respondedAt ? new Date(d.respondedAt).toLocaleDateString(s.locale) : "";
  let foot: React.ReactNode = null;
  let footTone: "ok" | "warn" | "neutral" | undefined;
  if (isQuote && d.status === "accepted") {
    footTone = "ok";
    foot = (
      <p>
        <Check className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>
          Approved{d.signerName ? ` by ${d.signerName}` : ""}
          {when ? ` on ${when}` : ""}.
        </strong>{" "}
        Thank you! {s.business.name || "We"} will be in touch to schedule the work{s.totals.deposit ? ` and send the deposit invoice (${money(s.totals.deposit)})` : ""}.
      </p>
    );
  } else if (isQuote && d.status === "declined") {
    footTone = "neutral";
    foot = (
      <p>
        <X className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>You declined this on {when || "—"}.</strong> Thank you for letting us know.
      </p>
    );
  } else if (isQuote && d.expired) {
    footTone = "warn";
    foot = (
      <p>
        <strong>This expired.</strong> Please ask {s.business.name || "us"} for an updated one.
      </p>
    );
  } else if (canAnswer) {
    foot = (
      <>
        <p>Read it through, then {needSig ? "sign" : "confirm"} at the bottom to approve.</p>
        <button type="button" className="cp-btn cp-btn-block-sm cp-noprint" onClick={() => scrollToId("respond", "input")}>
          Review and approve
        </button>
      </>
    );
  } else if (isInvoice && d.status === "void") {
    footTone = "neutral";
    foot = (
      <p>
        <strong>This invoice was voided.</strong> Nothing is due on it.
      </p>
    );
  } else if (isInvoice && d.status === "paid") {
    footTone = "ok";
    foot = (
      <p>
        <Check className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>Paid in full{d.paidAt ? ` on ${day(d.paidAt)}` : ""}.</strong> Thank you!
      </p>
    );
  } else if (isInvoice && d.balanceDue > 0) {
    footTone = d.overdue ? "warn" : undefined;
    foot = (
      <>
        <p>
          {d.overdue ? <strong>This invoice is past due. </strong> : null}
          {pay ? "Pay online, or see how to pay at the end of the invoice." : "See how to pay at the end of the invoice."}
        </p>
        {pay ? (
          <a className="cp-btn cp-btn-block-sm cp-noprint" href={pay} target="_blank" rel="noreferrer noopener">
            Pay {money(d.balanceDue)} online
          </a>
        ) : null}
      </>
    );
  }

  const missing = [!name.trim() && "type your name", needSig && !signature && "sign", !agree && "tick the box"].filter(Boolean) as string[];

  return (
    <ClientPage brandColor={s.business.brandColor} accentColor={s.business.accentColor}>
      <div ref={top}>
        <Letterhead
          business={s.business}
          tools={
            <>
              <button type="button" className="cp-tool cp-noprint" onClick={() => void pdf()} disabled={busy === "pdf"} aria-label="Download PDF">
                <Download /> {busy === "pdf" ? "Preparing…" : "PDF"}
              </button>
              <PrintButton />
            </>
          }
        />
      </div>
      <Cover kind={site || s.title} title={heading} sub={s.client.name ? <>For <strong>{s.client.name}</strong>{s.client.company ? `, ${s.client.company}` : ""}</> : null} />
      <TitleBlock id="cp-next" cells={cells} cols={Math.max(1, cells.filter((c) => !c.key).length)} foot={foot} footTone={footTone} />

      <main className="cp-wrap cp-body">
        <div className="cp-sheet overflow-hidden">
          <DocView snap={s} live={live} payLink={pay} />
        </div>

        {canAnswer && (
          <section id="respond" className="cp-sheet cp-respond cp-sec cp-noprint">
            {!declining ? (
              <>
                <h2 className="cp-h2">Approve this {s.title.toLowerCase()}</h2>
                <p className="cp-intro">
                  {needSig ? "Sign below" : "Confirm below"} to approve the work for {money(s.totals.total)}.
                </p>
                <div className="mt-6">
                  <label className="cp-field block">
                    <span className="cp-label">Your full name</span>
                    <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  {needSig && (
                    <div className="cp-field">
                      <span className="cp-label">Signature</span>
                      <SignaturePad onChange={setSignature} name={name} />
                    </div>
                  )}
                </div>
                <label className="cp-agree" data-on={agree}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    I approve the work described above for <strong className="num">{money(s.totals.total)}</strong>
                    {s.terms ? " and agree to the terms" : ""}.
                  </span>
                </label>
                {error && (
                  <p className="cp-note mt-4" data-tone="bad" role="alert">
                    {error}
                  </p>
                )}
                <div className="cp-actions">
                  <button className="cp-btn cp-btn-block-sm" disabled={!!busy || missing.length > 0} onClick={() => void respond(true)}>
                    <Check /> {busy === "accept" ? "Sending…" : `Approve ${money(s.totals.total)}`}
                  </button>
                  <button className="cp-btn cp-btn-quiet cp-btn-block-sm" onClick={() => setDeclining(true)}>
                    Decline
                  </button>
                </div>
                {missing.length > 0 && !busy && <p className="cp-hint">To approve, {missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>}
              </>
            ) : (
              <>
                <h2 className="cp-h2">Decline this {s.title.toLowerCase()}</h2>
                <div className="mt-6">
                  <label className="cp-field block">
                    <span className="cp-label">Your name</span>
                    <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="cp-field block">
                    <span className="cp-label">Anything we should know? (optional)</span>
                    <textarea className="input min-h-28" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Timing, budget, scope changes…" />
                  </label>
                </div>
                {error && (
                  <p className="cp-note mt-4" data-tone="bad" role="alert">
                    {error}
                  </p>
                )}
                <div className="cp-actions">
                  <button className="cp-btn cp-btn-danger cp-btn-block-sm" disabled={!!busy} onClick={() => void respond(false)}>
                    {busy === "decline" ? "Sending…" : "Decline"}
                  </button>
                  <button
                    className="cp-btn cp-btn-quiet cp-btn-block-sm"
                    onClick={() => {
                      setSignature(null);
                      setDeclining(false);
                    }}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        {!canAnswer && error && (
          <p className="cp-note mt-5" data-tone="bad" role="alert">
            {error}
          </p>
        )}
      </main>

      <ContactFooter business={s.business} ask={`Questions about this ${s.title.toLowerCase()}?`} />

      {canAnswer ? (
        <Dock watch="cp-next" target="respond">
          <div className="cp-dock-fig">
            <span>Total</span>
            <strong>{money(s.totals.total)}</strong>
          </div>
          <button type="button" className="cp-btn" onClick={() => scrollToId("respond", "input")}>
            Review and approve
          </button>
        </Dock>
      ) : pay ? (
        <Dock watch="cp-next" target="cp-pay-end">
          <div className="cp-dock-fig">
            <span>Balance</span>
            <strong>{money(d.balanceDue)}</strong>
          </div>
          <a className="cp-btn" href={pay} target="_blank" rel="noreferrer noopener">
            Pay online
          </a>
        </Dock>
      ) : null}
      {pay ? <span id="cp-pay-end" aria-hidden /> : null}
    </ClientPage>
  );
}
