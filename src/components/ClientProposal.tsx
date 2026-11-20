"use client";
// What the client sees by link (/p): the installer's quote (plans, scope, price, optional items, sign and approve), or a
// plan review (plans and symbols only: approve the layout or ask for changes). Frame and colours: ./client/ClientPage.
import { Check, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/estimate";
import { floorLabels, GROUP_LABELS, packClientNote, proposalTotals, sectionTotals, type ClientPin, type ProposalLine } from "@/lib/proposal";
import { notifyProposalResponse } from "@/lib/emailClient";
import { fetchPublicProposal, respondToProposal, type PublicProposal } from "@/lib/proposalCloud";
import { supabaseConfigured } from "@/lib/supabase";
import SignaturePad from "./SignaturePad";
import { fmtPct } from "@/lib/percent";
import { ClientLoading, ClientNotice, ClientPage, ContactFooter, Cover, Dock, Letterhead, PrintButton, scrollToId, TitleBlock, type TbCell } from "./client/ClientPage";

const shortDate = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const fmtDate = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");

/** Where a keyboard pin goes after an arrow key (Shift moves further), kept on the plan. */
export function moveCrosshair(at: { x: number; y: number }, key: string, big: boolean): { x: number; y: number } | null {
  const step = big ? 0.05 : 0.01;
  const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[key];
  if (!d) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
  return { x: clamp(at.x + d[0]), y: clamp(at.y + d[1]) };
}

/** Plan review change request: tap a plan (or use the arrow keys and Enter) to drop numbered pins, one note per pin. */
function PinPad({ floors, pins, onChange }: { floors: { name: string; image: string | null }[]; pins: ClientPin[]; onChange: (pins: ClientPin[]) => void }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = useRef<number | null>(null);
  // Keyboard crosshair: shown on the plan that has focus, moved with the arrows, Enter drops a pin there.
  const [cross, setCross] = useState<{ floor: string; x: number; y: number } | null>(null);
  const hintId = useId();
  const drop = (floor: string, x: number, y: number) => {
    onChange([...pins, { floor, x, y, note: "" }]);
    focus.current = pins.length;
  };
  useEffect(() => {
    // Jump to the note box of a pin that was just dropped.
    if (focus.current == null) return;
    inputs.current[focus.current]?.focus({ preventScroll: true });
    focus.current = null;
  }, [pins.length]);
  const labels = floorLabels(floors.map((f) => f.name));
  const withImage = floors.map((f, i) => ({ name: labels[i], image: f.image })).filter((f) => f.image);
  if (!withImage.length) return null;
  const set = (i: number, note: string) => onChange(pins.map((p, j) => (j === i ? { ...p, note } : p)));
  return (
    <div className="cp-field">
      <span className="cp-label">Point at the plan (optional)</span>
      <p id={hintId} className="mb-3 text-sm text-[var(--cp-pencil)]">
        Tap a spot to drop a numbered pin, then say what should change there. Tap a pin’s × to remove it. With a keyboard: Tab to the plan, move with the arrow keys (Shift for bigger steps) and press Enter.
      </p>
      <div className="space-y-3">
        {withImage.map((f) => (
          <figure key={f.name} className="cp-plan">
            <div
              className="relative cursor-crosshair select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--cp-focus)] focus-visible:ring-inset"
              tabIndex={0}
              role="application"
              aria-label={`${f.name} plan: tap a spot, or move the crosshair with the arrow keys and press Enter to drop a pin`}
              aria-describedby={hintId}
              onFocus={() => setCross((c) => (c?.floor === f.name ? c : { floor: f.name, x: 0.5, y: 0.5 }))}
              onBlur={() => setCross((c) => (c?.floor === f.name ? null : c))}
              onKeyDown={(e) => {
                const at = cross?.floor === f.name ? cross : { floor: f.name, x: 0.5, y: 0.5 };
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  drop(f.name, at.x, at.y);
                  return;
                }
                const next = moveCrosshair(at, e.key, e.shiftKey);
                if (!next) return;
                e.preventDefault();
                setCross({ floor: f.name, ...next });
              }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                if (!r.width || !r.height) return;
                const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
                drop(f.name, x, y);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.image!} alt={`${f.name} plan — tap to add a pin`} className="block w-full bg-white" draggable={false} />
              {cross?.floor === f.name && (
                <span aria-hidden className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2" style={{ left: `${cross.x * 100}%`, top: `${cross.y * 100}%` }}>
                  <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-[var(--cp-redline)] shadow-[0_0_0_1px_white]" />
                  <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-[var(--cp-redline)] shadow-[0_0_0_1px_white]" />
                </span>
              )}
              {pins.map((p, i) =>
                p.floor === f.name ? (
                  <span
                    key={i}
                    className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--cp-redline)] text-xs font-bold text-white shadow-md ring-2 ring-white"
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  >
                    {i + 1}
                  </span>
                ) : null,
              )}
            </div>
            <figcaption className="text-sm font-semibold">{f.name}</figcaption>
            <span className="sr-only" aria-live="polite">
              {cross?.floor === f.name ? `Crosshair ${Math.round(cross.x * 100)}% across, ${Math.round(cross.y * 100)}% down` : ""}
            </span>
          </figure>
        ))}
      </div>
      {pins.length > 0 && (
        <ol className="mt-3 space-y-2">
          {pins.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cp-redline)] text-xs font-bold text-white">{i + 1}</span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                aria-label={`Pin ${i + 1} on ${p.floor}: what should change here?`}
                className="input min-w-0 flex-1"
                placeholder={`${p.floor}: what should change here?`}
                value={p.note}
                onChange={(e) => set(i, e.target.value)}
              />
              <button type="button" className="cp-tool border-transparent" aria-label={`Remove pin ${i + 1}`} title="Remove pin" onClick={() => onChange(pins.filter((_, j) => j !== i))}>
                <X />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function ClientProposal() {
  const token = useSearchParams().get("t") ?? "";
  const [p, setP] = useState<PublicProposal | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [pins, setPins] = useState<ClientPin[]>([]);
  const [busy, setBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !supabaseConfigured) return;
    fetchPublicProposal(token)
      .then((r) => {
        setP(r);
        if (r) setChosen(r.status === "accepted" ? r.chosenOptions : r.snapshot.lines.filter((l) => l.optional && l.included).map((l) => l.key));
        if (r?.snapshot.client.name) setName(r.snapshot.client.name);
      })
      .catch((e) => setError(/does not exist|schema cache|could not find/i.test(e.message) ? "This link isn't available right now. Please contact the company that sent it." : e.message));
  }, [token]);

  const s = p?.snapshot;
  const totals = useMemo(() => (s ? proposalTotals(s, chosen) : null), [s, chosen]);
  const sections = useMemo(() => (s ? sectionTotals(s.lines, chosen) : null), [s, chosen]);

  if (!token || !supabaseConfigured || p === null)
    return <ClientNotice title="This link isn't available" body="It may have been withdrawn or replaced by an updated quote. Please contact the company that sent it." />;
  if (error && !p) return <ClientNotice title="Couldn't open this page" body={error} />;
  if (!p || !s || !totals || !sections) return <ClientLoading text="Loading…" />;

  const cur = s.currency;
  const review = s.kind === "review";
  const answered = p.status === "accepted" || p.status === "declined";
  const locked = answered || p.expired;
  const base = s.lines.filter((l) => !l.optional);
  const options = s.lines.filter((l) => l.optional);
  const groups = (Object.keys(GROUP_LABELS) as ProposalLine["group"][]).filter((g) => base.some((l) => l.group === g));
  const company = s.business.name || "We";
  const total = formatMoney(totals.total, cur);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      setP(await respondToProposal(token, { accept, name, signature: accept ? signature : null, options: chosen, note: review && !accept ? packClientNote(note, pins) : note }));
      // Lets the installer know by email (when the server has email set up).
      notifyProposalResponse(token);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      topRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Title block: the facts, then the key numbers.
  const approved = p.status === "accepted";
  const cells: TbCell[] = [
    { label: "Date", value: shortDate(s.createdAt) },
    ...(s.validUntil ? [{ label: "Valid until", value: shortDate(s.validUntil) }] : []),
    // A plan review's key numbers are its counts; a quote's is the price (the counts are in the plans section).
    ...(review ? s.scope.map((x) => ({ label: x.label, value: <span className="num">{x.value}</span>, key: true })) : []),
  ];
  if (!review)
    cells.push({
      label: approved ? "Approved total" : "Total",
      value: (
        <>
          {formatMoney(approved ? (p.acceptedTotal ?? totals.total) : totals.total, cur)}
          {totals.deposit != null && (
            <small className="mt-1 block">
              {s.depositPct}% deposit on approval: {formatMoney(totals.deposit, cur)}
            </small>
          )}
        </>
      ),
      key: true,
      wide: true,
    });

  let foot: React.ReactNode;
  let footTone: "ok" | "warn" | "neutral" | undefined;
  if (approved) {
    footTone = "ok";
    foot = (
      <p>
        <Check className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>
          {review ? "Layout approved" : "Approved"} by {p.clientName} on {fmtDate(p.respondedAt)}.
        </strong>{" "}
        {review
          ? `Thank you. ${company} will follow up with pricing for this layout.`
          : `${company} will be in touch to schedule the work${s.depositPct ? ` and send the ${s.depositPct}% deposit invoice` : ""}. You can print this page for your records.`}
      </p>
    );
  } else if (answered) {
    footTone = "neutral";
    foot = review ? (
      <p>
        <strong>We got your change request ({fmtDate(p.respondedAt)}).</strong> {company} will update the plan and send you a new version to review.
      </p>
    ) : (
      <p>
        <X className="mr-1.5 inline h-5 w-5 align-[-4px]" />
        <strong>You declined this quote on {fmtDate(p.respondedAt)}.</strong> Thank you for letting us know.
      </p>
    );
  } else if (p.expired) {
    footTone = "warn";
    foot = (
      <p>
        <strong>This quote expired on {fmtDate(p.validUntil)}.</strong> Please ask {s.business.name || "us"} for an updated one.
      </p>
    );
  } else {
    foot = (
      <>
        <p>{review ? "Check where everything goes, then approve the layout or tell us what to change." : "Read it through, then sign at the bottom to approve."}</p>
        <button type="button" className="cp-btn cp-btn-block-sm cp-noprint" onClick={() => scrollToId("respond", "input")}>
          {review ? "Review the layout" : "Review and approve"}
        </button>
      </>
    );
  }

  const missing = [!name.trim() && "type your name", !signature && "sign", !agree && "tick the box"].filter(Boolean) as string[];

  return (
    <ClientPage brandColor={s.business.brandColor} accentColor={s.business.accentColor}>
      <div ref={topRef}>
        <Letterhead business={s.business} tools={<PrintButton label="Print or save PDF" />} />
      </div>
      <Cover
        kind={review ? "Plan for your review" : "Quote"}
        title={s.title}
        sub={
          s.client.name || s.client.address ? (
            <>
              For {s.client.name ? <strong>{s.client.name}</strong> : null}
              {s.client.name && s.client.address ? ", " : ""}
              {s.client.address}
            </>
          ) : null
        }
      />
      <TitleBlock id="cp-next" cells={cells} cols={review ? Math.min(4, cells.length) : Math.max(1, cells.length - 1)} foot={foot} footTone={footTone} />

      <main className="cp-wrap cp-body">
        <div className="cp-sheet">
          {s.message && (
            <section className="cp-sec" aria-label={`Note from ${s.business.name || "the company"}`}>
              <p className="cp-letter">{s.message}</p>
              {s.business.name && <p className="cp-letter-sign">{s.business.name}</p>}
            </section>
          )}

          {s.legend && s.legend.length > 0 && (
            <section className="cp-sec">
              <h2 className="cp-h2">What the symbols mean</h2>
              <p className="cp-intro">
                Each symbol on the plans is one item.{s.legend.some((l) => /optional/.test(l.count)) ? " Items marked “?” are optional: tell us if you want them." : ""}
              </p>
              <ul className="cp-legend">
                {s.legend.map((l) => (
                  <li key={l.key}>
                    <span className="cp-symbol" aria-hidden>
                      {l.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.icon} alt="" className="h-8 w-8" />
                      ) : l.key.startsWith("led:") ? (
                        <span className="h-1.5 w-7 rounded-full" style={{ background: l.color }} />
                      ) : (
                        <span className="h-5 w-5 rounded-sm" style={{ background: l.color }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-bold">{l.name}</span>
                        <span className="num shrink-0 font-bold">{l.count}</span>
                      </span>
                      <span className="mt-0.5 block text-[15px] text-[var(--cp-pencil)]">{l.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.floors.some((f) => f.image || f.items.length) && (
            <section className="cp-sec">
              <h2 className="cp-h2">{review ? "Where everything goes" : "Your plans"}</h2>
              <p className="cp-intro">
                {!review && s.scope.length > 0 ? `${s.scope.map((x) => `${x.label}: ${x.value}`).join(", ")}. ` : ""}
                {s.floors.some((f) => f.image) ? <span className="cp-noprint">Tap a plan to open it full size and zoom in.</span> : null}
              </p>
              {s.floors.map((f) => (
                <figure key={f.name} className="cp-plan">
                  {f.image && (
                    <a href={f.image} target="_blank" rel="noreferrer" title="Open full size">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image} alt={`${f.name} plan with device locations`} loading="lazy" />
                    </a>
                  )}
                  <figcaption>
                    <div className="cp-h3">{f.name}</div>
                    {f.items.length > 0 && (
                      <dl className="cp-plan-items">
                        {f.items.map((i) => (
                          <div key={i.name}>
                            <dt>{i.name}</dt>
                            <dd>{i.count}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </figcaption>
                </figure>
              ))}
            </section>
          )}

          {!review && (
            <section className="cp-sec">
              <h2 className="cp-h2">Price</h2>
              <div className="mt-5">
                {groups.map((g) => (
                  <div key={g} className="cp-group">
                    <div className="cp-group-head">
                      <h3 className="cp-h3">{GROUP_LABELS[g]}</h3>
                      {s.detail === "sections" && <div className="num font-bold">{formatMoney(sections.get(g) ?? 0, cur)}</div>}
                    </div>
                    <ul className="cp-rows">
                      {base
                        .filter((l) => l.group === g)
                        .map((l) => (
                          <li key={l.key} className="cp-row">
                            <span>
                              {l.description}
                              <span className="cp-meta block">
                                {+l.qty.toFixed(2)} {l.unit}
                                {s.detail === "lines" && l.unitPrice ? ` × ${formatMoney(l.unitPrice, cur)}` : ""}
                              </span>
                            </span>
                            {s.detail === "lines" && (
                              <span className="cp-amt">{l.total ? formatMoney(l.total, cur) : <span className="font-normal text-[var(--cp-pencil)]">Included</span>}</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              {options.length > 0 && (
                <div className="cp-options">
                  <div className="cp-options-head">
                    <h3 className="cp-h3">Optional items</h3>
                    <p className="text-sm text-[var(--cp-pencil)]">{locked ? "Ticked items are in your total." : "Tick any you’d like included. The total updates."}</p>
                  </div>
                  <ul>
                    {options.map((l) => {
                      const on = chosen.includes(l.key);
                      return (
                        <li key={l.key}>
                          <label className="cp-option" data-on={on} aria-disabled={locked || undefined}>
                            <input
                              type="checkbox"
                              disabled={locked}
                              checked={on}
                              onChange={(e) => setChosen((c) => (e.target.checked ? [...c, l.key] : c.filter((k) => k !== l.key)))}
                            />
                            <span className="min-w-0 flex-1">
                              {l.description}
                              <span className="cp-meta block">
                                {+l.qty.toFixed(2)} {l.unit}
                              </span>
                            </span>
                            <span className="num shrink-0 font-semibold">+{formatMoney(l.total, cur)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <dl className="cp-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(totals.subtotal, cur)}</dd>
                </div>
                {s.taxPct > 0 && (
                  <div>
                    <dt>Tax ({fmtPct(s.taxPct)}%)</dt>
                    <dd>{formatMoney(totals.tax, cur)}</dd>
                  </div>
                )}
                <div className="cp-grand">
                  <dt>Total</dt>
                  <dd>{total}</dd>
                </div>
                {totals.deposit != null && (
                  <div>
                    <dt>Deposit due on approval ({s.depositPct}%)</dt>
                    <dd>{formatMoney(totals.deposit, cur)}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {s.terms && (
            <section className="cp-sec">
              <h2 className="cp-h3">Terms</h2>
              <p className="mt-2 max-w-[42em] text-[15px] whitespace-pre-line text-[var(--cp-text)]">{s.terms}</p>
            </section>
          )}
        </div>

        {!locked && (
          <section id="respond" className="cp-sheet cp-respond cp-sec cp-noprint">
            {!declining ? (
              <>
                <h2 className="cp-h2">{review ? "Does this layout look right?" : "Approve this quote"}</h2>
                <p className="cp-intro">{review ? "Approve it, or ask for changes: move a camera, add a speaker, anything." : `Sign below to approve the work for ${total}.`}</p>
                <div className="mt-6">
                  <label className="cp-field block">
                    <span className="cp-label">Your full name</span>
                    <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <div className="cp-field">
                    <span className="cp-label">Signature</span>
                    <SignaturePad onChange={setSignature} name={name} />
                  </div>
                </div>
                <label className="cp-agree" data-on={agree}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  {review ? (
                    <span>I’ve reviewed the plan and approve where everything is placed. I understand pricing will follow.</span>
                  ) : (
                    <span>
                      I approve the work described above for <strong className="num">{total}</strong>
                      {s.terms ? " and agree to the terms" : ""}.
                    </span>
                  )}
                </label>
                {error && (
                  <p className="cp-note mt-4" data-tone="bad" role="alert">
                    {error}
                  </p>
                )}
                <div className="cp-actions">
                  <button className="cp-btn cp-btn-block-sm" disabled={busy || missing.length > 0} onClick={() => void respond(true)}>
                    <Check /> {busy ? "Sending…" : review ? "Approve layout" : `Approve ${total}`}
                  </button>
                  <button className={`cp-btn ${review ? "cp-btn-line" : "cp-btn-quiet"} cp-btn-block-sm`} onClick={() => setDeclining(true)}>
                    {review ? "Request changes" : "Decline"}
                  </button>
                </div>
                {missing.length > 0 && !busy && <p className="cp-hint">To approve, {missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>}
              </>
            ) : (
              <>
                <h2 className="cp-h2">{review ? "What would you like changed?" : "Decline this quote"}</h2>
                {review && <p className="cp-intro">Say it in your own words. Naming the floor and room helps, or pin it on the plan.</p>}
                <div className="mt-6">
                  {review && (
                    <label className="cp-field block">
                      <span className="cp-label">Your name</span>
                      <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                  )}
                  <label className="cp-field block">
                    <span className="cp-label">{review ? "Changes" : "Anything we should know? (optional)"}</span>
                    <textarea
                      className="input min-h-32"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={review ? "e.g. 2nd floor: move the bedroom TV to the other wall; add a speaker in the office…" : "Timing, budget, scope changes…"}
                    />
                  </label>
                  {review && <PinPad floors={s.floors} pins={pins} onChange={setPins} />}
                </div>
                {error && (
                  <p className="cp-note mt-4" data-tone="bad" role="alert">
                    {error}
                  </p>
                )}
                <div className="cp-actions">
                  <button className={`cp-btn cp-btn-block-sm ${review ? "" : "cp-btn-danger"}`} disabled={busy || (review && !note.trim() && !pins.length)} onClick={() => void respond(false)}>
                    {busy ? "Sending…" : review ? "Send change request" : "Decline quote"}
                  </button>
                  <button
                    className="cp-btn cp-btn-quiet cp-btn-block-sm"
                    onClick={() => {
                      // The signature pad comes back empty, so don't keep a signature the client can't see.
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
      </main>

      <ContactFooter business={s.business} ask={review ? "Questions about the plan?" : "Questions about this quote?"} />

      {!locked && (
        <Dock watch="cp-next" target="respond">
          {!review && (
            <div className="cp-dock-fig">
              <span>Total</span>
              <strong>{total}</strong>
            </div>
          )}
          <button type="button" className="cp-btn" onClick={() => scrollToId("respond", "input")}>
            {review ? "Approve or ask for changes" : "Review and approve"}
          </button>
        </Dock>
      )}
    </ClientPage>
  );
}
