"use client";
// What the client sees: a change order by link — what changes and why, the price, photos — then sign and approve
// (or reject with a note). Answers go through /api/change-orders/public; the page never touches the database.
import { Check, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PublicCoResponse } from "@/lib/changeOrders";
import { formatMoney } from "@/lib/estimate";
import SignaturePad from "../SignaturePad";
import { fmtPct } from "@/lib/percent";
import { ClientLoading, ClientNotice, ClientPage, ContactFooter, Cover, Dock, Letterhead, PrintButton, scrollToId, TitleBlock, type TbCell } from "../client/ClientPage";

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
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }
    } catch {
      setFormError("Couldn't send your answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ClientLoading text="Loading your change order…" />;
  if (error || !data) return <ClientNotice title="Change order unavailable" body={error} />;

  const v = data.view;
  const cur = v.currency || "USD";
  const schedule = scheduleText(v.scheduleDays);
  const answered = data.status !== "sent";
  const total = formatMoney(v.total, cur);
  const company = v.business.name || "We";

  const cells: TbCell[] = [
    { label: "Date", value: v.sentAt ? new Date(v.sentAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "" },
    { label: "Reason", value: v.reasonLabel },
    ...(schedule ? [{ label: "Schedule", value: schedule }] : []),
    ...(v.project.address ? [{ label: "Job site", value: v.project.address }] : []),
    { label: v.total < 0 ? "Credit to your contract" : "Change to your contract", value: total, key: true, wide: true, testId: "co-total" },
  ];

  let foot: React.ReactNode;
  let footTone: "ok" | "neutral" | undefined;
  if (data.status === "approved") {
    footTone = "ok";
    foot = (
      <p>
        <Check className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>
          Approved{data.approvedName ? ` by ${data.approvedName}` : ""} on {fmtDate(data.respondedAt)}.
        </strong>{" "}
        Thank you. {company} will schedule the work. You can print this page for your records.
      </p>
    );
  } else if (answered) {
    footTone = "neutral";
    foot = (
      <p>
        <X className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>You declined this change on {fmtDate(data.respondedAt)}.</strong> Thank you for letting us know. {company} will be in touch.
      </p>
    );
  } else {
    foot = (
      <>
        <p>Read what changes and why, then sign at the bottom to approve.</p>
        <button type="button" className="cp-btn cp-btn-block-sm cp-noprint" onClick={() => scrollToId("respond", "input")}>
          Review and approve
        </button>
      </>
    );
  }

  const missing = [!name.trim() && "type your name", !signature && "sign", !agree && "tick the box"].filter(Boolean) as string[];

  return (
    <ClientPage brandColor={v.business.brandColor} accentColor={v.business.accentColor}>
      <Letterhead business={v.business} tools={<PrintButton />} />
      <Cover
        kind={`Change order ${v.code}`}
        title={v.title}
        sub={v.project.clientName ? <>For <strong>{v.project.clientName}</strong></> : null}
      />
      <TitleBlock id="cp-next" cells={cells} cols={Math.min(4, cells.length - 1)} foot={foot} footTone={footTone} />

      <main className="cp-wrap cp-body">
        <div className="cp-sheet">
          {v.description && (
            <section className="cp-sec">
              <h2 className="cp-h2">Why it changes</h2>
              <p className="cp-letter mt-3">{v.description}</p>
            </section>
          )}

          <section className="cp-sec">
            <h2 className="cp-h2">What changes</h2>
            <ul className="cp-rows mt-4 border-t-2 border-[var(--cp-ink)]">
              {v.lines.map((l, i) => (
                <li key={i} className="cp-row">
                  <span>
                    <span className="font-semibold">{l.description}</span>
                    <span className="cp-meta block">
                      {qtyText(l.qty)} {l.unit} × {formatMoney(l.unitPrice, cur)}
                    </span>
                  </span>
                  <span className={`cp-amt ${l.total < 0 ? "text-[var(--cp-ok)]" : ""}`}>{formatMoney(l.total, cur)}</span>
                </li>
              ))}
            </ul>
            <dl className="cp-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(v.subtotal, cur)}</dd>
              </div>
              {v.tax !== 0 && (
                <div>
                  <dt>Tax ({fmtPct(v.taxPct)}%)</dt>
                  <dd>{formatMoney(v.tax, cur)}</dd>
                </div>
              )}
              <div className="cp-grand">
                <dt>Total change</dt>
                <dd>{total}</dd>
              </div>
            </dl>
          </section>

          {v.photos.length > 0 && (
            <section className="cp-sec">
              <h2 className="cp-h2">Photos</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.photos.map((p, i) => (
                  <figure key={i} className="cp-plan mt-0">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="aspect-[4/3] object-cover" loading="lazy" />
                    </a>
                    {p.caption && <figcaption className="text-sm">{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>

        {!answered && (
          <section id="respond" className="cp-sheet cp-respond cp-sec cp-noprint">
            <h2 className="cp-h2">{rejecting ? "Decline this change" : "Approve this change"}</h2>
            <p className="cp-intro">
              {rejecting
                ? "Let us know why, and we'll follow up."
                : `By signing you approve ${v.code} and agree to the change of ${total}${schedule ? ` (${schedule.toLowerCase()})` : ""} to your contract.`}
            </p>
            <div className="mt-6">
              <div className="cp-field">
                <label className="cp-label" htmlFor="co-name">
                  Your name
                </label>
                <input id="co-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              {!rejecting && (
                <div className="cp-field">
                  <span className="cp-label">Signature</span>
                  <SignaturePad onChange={setSignature} name={name} />
                </div>
              )}
              <div className="cp-field">
                <label className="cp-label" htmlFor="co-comment">
                  {rejecting ? "Reason" : "Comment (optional)"}
                </label>
                <textarea id="co-comment" className="input min-h-[88px]" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
            </div>
            {!rejecting && (
              <label className="cp-agree" data-on={agree}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I approve this change order and the amount above.</span>
              </label>
            )}
            {formError && (
              <p className="cp-note mt-4" data-tone="bad" role="alert">
                {formError}
              </p>
            )}
            <div className="cp-actions">
              {rejecting ? (
                <>
                  <button className="cp-btn cp-btn-danger cp-btn-block-sm" disabled={busy || !comment.trim()} onClick={() => void answer("reject")}>
                    <X /> Decline change order
                  </button>
                  <button className="cp-btn cp-btn-quiet cp-btn-block-sm" disabled={busy} onClick={() => setRejecting(false)}>
                    Back
                  </button>
                </>
              ) : (
                <>
                  <button className="cp-btn cp-btn-block-sm" disabled={busy || missing.length > 0} onClick={() => void answer("approve")}>
                    <Check /> {busy ? "Sending…" : "Approve and sign"}
                  </button>
                  <button className="cp-btn cp-btn-quiet cp-btn-block-sm" disabled={busy} onClick={() => setRejecting(true)}>
                    Decline
                  </button>
                </>
              )}
            </div>
            {!rejecting && missing.length > 0 && !busy && <p className="cp-hint">To approve, {missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>}
          </section>
        )}
      </main>

      <ContactFooter business={v.business} ask="Questions about this change?" />

      {!answered && (
        <Dock watch="cp-next" target="respond">
          <div className="cp-dock-fig">
            <span>Change</span>
            <strong>{total}</strong>
          </div>
          <button type="button" className="cp-btn" onClick={() => scrollToId("respond", "input")}>
            Review and approve
          </button>
        </Dock>
      )}
    </ClientPage>
  );
}
