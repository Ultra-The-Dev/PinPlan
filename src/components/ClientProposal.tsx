"use client";
// What the client sees: the installer's proposal by link — plans, scope, price, optional add-ons, sign and accept.
import { Check, Printer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/estimate";
import { floorLabels, GROUP_LABELS, packClientNote, proposalTotals, sectionTotals, type ClientPin, type ProposalLine } from "@/lib/proposal";
import { notifyProposalResponse } from "@/lib/emailClient";
import { fetchPublicProposal, respondToProposal, type PublicProposal } from "@/lib/proposalCloud";
import { supabaseConfigured } from "@/lib/supabase";
import SignaturePad from "./SignaturePad";

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
    <div className="mt-4">
      <span className="label">Point at the plan (optional)</span>
      <p id={hintId} className="-mt-0.5 mb-2 text-xs text-slate-500">
        Tap a spot to drop a numbered pin, then say what should change there. Tap a pin’s × to remove it. With a keyboard: Tab to the plan, move with the arrow keys (Shift for bigger steps) and press Enter.
      </p>
      <div className="space-y-3">
        {withImage.map((f) => (
          <figure key={f.name} className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            <div
              className="relative cursor-crosshair select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-inset"
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
                  <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-brand-600 shadow-[0_0_0_1px_white]" />
                  <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-brand-600 shadow-[0_0_0_1px_white]" />
                </span>
              )}
              {pins.map((p, i) =>
                p.floor === f.name ? (
                  <span
                    key={i}
                    className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md ring-2 ring-white"
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  >
                    {i + 1}
                  </span>
                ) : null,
              )}
            </div>
            <figcaption className="border-t border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{f.name}</figcaption>
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
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{i + 1}</span>
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
              <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-500" aria-label={`Remove pin ${i + 1}`} title="Remove pin" onClick={() => onChange(pins.filter((_, j) => j !== i))}>
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
  const topRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!token || !supabaseConfigured) return;
    fetchPublicProposal(token)
      .then((r) => {
        setP(r);
        if (r) setChosen(r.status === "accepted" ? r.chosenOptions : r.snapshot.lines.filter((l) => l.optional && l.included).map((l) => l.key));
        if (r?.snapshot.client.name) setName(r.snapshot.client.name);
      })
      .catch((e) => setError(/does not exist|schema cache|could not find/i.test(e.message) ? "This proposal link isn't available right now. Please contact the company that sent it." : e.message));
  }, [token]);

  const s = p?.snapshot;
  const totals = useMemo(() => (s ? proposalTotals(s, chosen) : null), [s, chosen]);
  const sections = useMemo(() => (s ? sectionTotals(s.lines, chosen) : null), [s, chosen]);

  if (!token || !supabaseConfigured || p === null)
    return <Notice title="This link isn't available" body="It may have been withdrawn or replaced by an updated proposal. Please contact the company that sent it." />;
  if (error) return <Notice title="Couldn't open the proposal" body={error} />;
  if (!p || !s || !totals || !sections) return <p className="p-10 text-center text-slate-500">Loading your proposal…</p>;

  const cur = s.currency;
  const review = s.kind === "review";
  const answered = p.status === "accepted" || p.status === "declined";
  const locked = answered || p.expired;
  const base = s.lines.filter((l) => !l.optional);
  const options = s.lines.filter((l) => l.optional);
  const groups = (Object.keys(GROUP_LABELS) as ProposalLine["group"][]).filter((g) => base.some((l) => l.group === g));

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      setP(await respondToProposal(token, { accept, name, signature: accept ? signature : null, options: chosen, note: review && !accept ? packClientNote(note, pins) : note }));
      // Lets the installer know by email (when the server has email set up).
      notifyProposalResponse(token);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const brand = s.business.brandColor || "#0a1b54";
  const accent = s.business.accentColor || "#13e57c";
  const theme = {
    "--brand": brand,
    "--accent": accent,
    fontFamily: "Manrope, var(--font-sans), system-ui, sans-serif",
  } as React.CSSProperties;

  return (
    <div className="proposal min-h-full bg-[#f4f6fb] text-[#111a33] print:bg-white" style={theme}>
      {/* The company's typeface (Manrope); falls back to the app font if it can't load. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
      {/* Letterhead */}
      <header ref={topRef} className="border-b border-[#e3e7f1] bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
          <div className="mr-auto flex items-center">
            {s.business.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.business.logo} alt={s.business.name} className="h-14 w-auto max-w-[240px] object-contain sm:h-16" />
            ) : (
              <div className="text-xl font-extrabold tracking-tight text-[var(--brand)]">{s.business.name || "Proposal"}</div>
            )}
          </div>
          <div className="min-w-0 text-right text-sm leading-relaxed break-words text-slate-500">
            {s.business.phone && (
              <a href={`tel:${s.business.phone.replace(/[^+\d]/g, "")}`} className="block font-semibold text-[var(--brand)]">
                {s.business.phone}
              </a>
            )}
            <div>{[s.business.email, s.business.website].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn btn-sm print:hidden" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
        </div>
      </header>

      {/* Title band in the brand colours, like the company site */}
      <section className="relative overflow-hidden bg-[var(--brand)] text-white print:bg-white print:text-black" style={{ backgroundImage: `radial-gradient(60% 120% at 100% 0%, ${accent}33 0%, transparent 60%), linear-gradient(180deg, #13294f 0%, ${brand} 100%)` }}>
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
          {s.business.tagline && <div className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">{s.business.tagline}</div>}
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight break-words text-balance sm:text-4xl">{s.title}</h1>
          <dl className="mt-5 grid gap-x-8 gap-y-1.5 text-sm text-white/80 sm:grid-cols-2 print:text-slate-600">
            <div className="flex gap-2">
              <dt className="text-white/55">Prepared for</dt>
              <dd className="font-semibold text-white print:text-black">{s.client.name || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-white/55">Date</dt>
              <dd>{fmtDate(s.createdAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-white/55">Project</dt>
              <dd>{s.client.address || "—"}</dd>
            </div>
            {s.validUntil && (
              <div className="flex gap-2">
                <dt className="text-white/55">Valid until</dt>
                <dd>{fmtDate(s.validUntil)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
            {s.scope.map((x) => (
              <div key={x.label} className="min-w-0 rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/15 sm:px-4 print:ring-slate-300">
                <div className="truncate text-xs text-white/60 print:text-slate-500">{x.label}</div>
                <div className="mt-0.5 text-lg font-extrabold break-words text-[var(--accent)] tabular-nums sm:text-2xl print:text-black">{x.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {answered && (
          <div className={`mb-6 rounded-2xl px-5 py-4 ring-1 ${p.status === "accepted" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
            {review ? (
              p.status === "accepted" ? (
                <div>
                  <div className="flex items-center gap-2 font-bold">
                    <Check className="h-5 w-5" /> Layout approved by {p.clientName} on {fmtDate(p.respondedAt)}
                  </div>
                  <p className="mt-1 text-sm">Thank you! {s.business.name || "We"} will follow up with pricing for this layout.</p>
                </div>
              ) : (
                <div>
                  <div className="font-bold">Thanks — we got your change request ({fmtDate(p.respondedAt)}).</div>
                  <p className="mt-1 text-sm">{s.business.name || "We"} will update the plan and send you a new version to review.</p>
                </div>
              )
            ) : p.status === "accepted" ? (
              <>
                <div className="flex items-center gap-2 font-bold">
                  <Check className="h-5 w-5" /> Accepted by {p.clientName} on {fmtDate(p.respondedAt)}
                </div>
                <p className="mt-1 text-sm">
                  Total {formatMoney(p.acceptedTotal ?? totals.total, cur)}. {s.business.name || "We"} will be in touch to schedule the work{s.depositPct ? ` and send the ${s.depositPct}% deposit invoice` : ""}. You can print this page for your records.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 font-bold">
                <X className="h-5 w-5" /> You declined this proposal on {fmtDate(p.respondedAt)}. Thank you for letting us know.
              </div>
            )}
          </div>
        )}
        {!answered && p.expired && (
          <div className="mb-6 rounded-2xl bg-amber-50 px-5 py-4 text-amber-900 ring-1 ring-amber-200">
            This proposal expired on {fmtDate(p.validUntil)}. Please ask {s.business.name || "us"} for an updated one.
          </div>
        )}

        {s.message && (
          <section className="card mb-6 border-l-4 border-[var(--accent)] p-6 text-[15px] leading-relaxed whitespace-pre-line text-slate-700">{s.message}</section>
        )}

        {s.legend && s.legend.length > 0 && (
          <section className="card mt-6 break-inside-avoid p-6 sm:p-8">
            <h2 className="text-lg font-extrabold text-[var(--brand)]">What the symbols mean</h2>
            <p className="mt-1 text-sm text-slate-500">
              Each symbol on the plans below is one item.{s.legend.some((l) => /optional/.test(l.count)) ? " Items marked “?” are optional — tell us if you want them." : ""}
            </p>
            <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {s.legend.map((l) => (
                <li key={l.key} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
                    {l.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.icon} alt="" className="h-8 w-8" />
                    ) : l.key.startsWith("led:") ? (
                      <span className="h-1.5 w-8 rounded-full" style={{ background: l.color }} />
                    ) : (
                      <span className="h-6 w-6 rounded" style={{ background: l.color }} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{l.name}</span>
                      <span className="shrink-0 font-semibold text-[var(--brand)] tabular-nums">{l.count}</span>
                    </span>
                    <span className="block text-slate-500">{l.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.floors.some((f) => f.image || f.items.length) && (
          <section className="mt-6">
            <h2 className="mb-3 px-1 text-lg font-extrabold text-[var(--brand)]">{review ? "Where everything goes" : "Your plans"}</h2>
            {review && <p className="-mt-2 mb-3 px-1 text-sm text-slate-500">Tap a plan to open it full size and zoom in.</p>}
            <div className="space-y-5">
              {s.floors.map((f) => (
                <figure key={f.name} className="card overflow-hidden break-inside-avoid">
                  {f.image && (
                    <a href={f.image} target="_blank" rel="noreferrer" title="Open full size">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image} alt={`${f.name} plan with device locations`} className="w-full bg-white" loading="lazy" />
                    </a>
                  )}
                  <figcaption className="border-t border-slate-100 px-5 py-3">
                    <div className="font-medium">{f.name}</div>
                    {f.items.length > 0 && (
                      <div className="mt-1 text-sm text-slate-500">{f.items.map((i) => `${i.name} ${i.count}`).join(" · ")}</div>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {!review && (
        <section className="card mt-6 p-6 sm:p-8">
          <h2 className="text-lg font-extrabold text-[var(--brand)]">Investment</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {groups.map((g) => (
              <div key={g} className="py-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-semibold text-slate-500">{GROUP_LABELS[g]}</div>
                  {s.detail === "sections" && <div className="font-medium tabular-nums">{formatMoney(sections.get(g) ?? 0, cur)}</div>}
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {base
                    .filter((l) => l.group === g)
                    .map((l) => (
                      <li key={l.key} className="flex gap-3 text-sm">
                        <span className="min-w-0 flex-1 break-words">
                          {l.description}
                          {s.detail === "lines" && (
                            <span className="block text-xs text-slate-500 tabular-nums sm:hidden">
                              {+l.qty.toFixed(2)} {l.unit}
                              {l.unitPrice ? ` × ${formatMoney(l.unitPrice, cur)}` : ""}
                            </span>
                          )}
                        </span>
                        {s.detail === "lines" ? (
                          <>
                            <span className="hidden text-slate-500 tabular-nums whitespace-nowrap sm:inline">
                              {+l.qty.toFixed(2)} {l.unit}
                              {l.unitPrice ? ` × ${formatMoney(l.unitPrice, cur)}` : ""}
                            </span>
                            <span className="w-24 text-right font-medium tabular-nums">{l.total ? formatMoney(l.total, cur) : <span className="font-normal text-slate-500">Included</span>}</span>
                          </>
                        ) : (
                          <span className="text-slate-500 tabular-nums">
                            {+l.qty.toFixed(2)} {l.unit}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          {options.length > 0 && (
            <div className="mt-4 rounded-xl p-4 ring-1" style={{ background: `${accent}14`, borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
              <div className="font-bold text-[var(--brand)]">Optional add-ons</div>
              <p className="text-sm text-slate-600">{locked ? "Add-ons included in your total are ticked." : "Tick any you'd like included — the total updates."}</p>
              <ul className="mt-2 space-y-1">
                {options.map((l) => (
                  <li key={l.key}>
                    <label className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${locked ? "" : "cursor-pointer hover:bg-amber-100/50"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        disabled={locked}
                        checked={chosen.includes(l.key)}
                        onChange={(e) => setChosen((c) => (e.target.checked ? [...c, l.key] : c.filter((k) => k !== l.key)))}
                      />
                      <span className="min-w-0 flex-1">
                        {l.description}
                        <span className="text-slate-500"> · {+l.qty.toFixed(2)} {l.unit}</span>
                      </span>
                      <span className="font-medium tabular-nums">+{formatMoney(l.total, cur)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <dl className="mt-5 space-y-1.5 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotal, cur)}</dd>
            </div>
            {s.taxPct > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax ({s.taxPct}%)</dt>
                <dd className="tabular-nums">{formatMoney(totals.tax, cur)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-base font-semibold">Total</dt>
              <dd className="text-3xl font-extrabold text-[var(--brand)] tabular-nums">{formatMoney(totals.total, cur)}</dd>
            </div>
            {totals.deposit != null && (
              <div className="flex justify-between text-slate-600">
                <dt>Deposit due on approval ({s.depositPct}%)</dt>
                <dd className="tabular-nums">{formatMoney(totals.deposit, cur)}</dd>
              </div>
            )}
          </dl>
        </section>
        )}

        {s.terms && (
          <section className="mt-6 px-1 text-sm leading-relaxed text-slate-600">
            <h2 className="mb-1.5 font-semibold text-slate-800">Terms</h2>
            <p className="whitespace-pre-line">{s.terms}</p>
          </section>
        )}

        {!locked && (
          <section className="card mt-6 p-6 sm:p-8 print:hidden">
            {!declining ? (
              <>
                <h2 className="text-lg font-extrabold text-[var(--brand)]">{review ? "Does this layout look right?" : "Approve this proposal"}</h2>
                {review && <p className="mt-1 text-sm text-slate-500">Approve it, or ask for changes — move a camera, add a speaker, anything.</p>}
                <label className="mt-4 block text-sm">
                  <span className="label">Your full name</span>
                  <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <div className="mt-4">
                  <span className="label">Signature</span>
                  <SignaturePad onChange={setSignature} name={name} />
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  {review ? (
                    <span>I’ve reviewed the plan and approve where everything is placed. I understand pricing will follow.</span>
                  ) : (
                    <span>
                      I approve the work described above for <strong>{formatMoney(totals.total, cur)}</strong>
                      {s.terms ? " and agree to the terms" : ""}.
                    </span>
                  )}
                </label>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    className="btn h-12 rounded-full px-7 text-[15px] font-bold disabled:opacity-50"
                    style={{ background: accent, color: brand }}
                    disabled={busy || !name.trim() || !signature || !agree}
                    onClick={() => void respond(true)}
                  >
                    <Check /> {busy ? "Sending…" : review ? "Approve layout" : `Accept — ${formatMoney(totals.total, cur)}`}
                  </button>
                  <button className={review ? "btn" : "btn btn-ghost text-slate-500"} onClick={() => setDeclining(true)}>
                    {review ? "Request changes" : "Decline"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">{review ? "What would you like changed?" : "Decline this proposal"}</h2>
                {review && (
                  <label className="mt-4 block text-sm">
                    <span className="label">Your name</span>
                    <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                )}
                <label className="mt-4 block text-sm">
                  <span className="label">{review ? "Changes (by floor and room helps — or pin them on the plan below)" : "Anything we should know? (optional)"}</span>
                  <textarea
                    className="input min-h-28"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={review ? "e.g. 2nd floor: move the bedroom TV to the other wall; add a speaker in the office…" : "Timing, budget, scope changes…"}
                  />
                </label>
                {review && <PinPad floors={s.floors} pins={pins} onChange={setPins} />}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-4 flex gap-3">
                  <button
                    className="btn"
                    onClick={() => {
                      // The signature pad comes back empty, so don't keep a signature the client can't see.
                      setSignature(null);
                      setDeclining(false);
                    }}
                  >
                    Back
                  </button>
                  <button className={review ? "btn btn-brand" : "btn btn-danger"} disabled={busy || (review && !note.trim() && !pins.length)} onClick={() => void respond(false)}>
                    {busy ? "Sending…" : review ? "Send change request" : "Decline proposal"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
      <footer className="bg-[var(--brand)] text-white/70 print:bg-white print:text-slate-500">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm sm:px-6">
          <div className="mr-auto">
            <div className="font-bold text-white print:text-black">{s.business.name}</div>
            {s.business.serviceArea && <div>{s.business.serviceArea}</div>}
          </div>
          <div className="min-w-0 text-right break-words">
            Questions? {s.business.phone ? <a className="font-semibold text-[var(--accent)]" href={`tel:${s.business.phone.replace(/[^+\d]/g, "")}`}>{s.business.phone}</a> : null}
            {s.business.email ? (
              <>
                {" · "}
                <a className="text-white/80 underline-offset-2 hover:underline" href={`mailto:${s.business.email}`}>
                  {s.business.email}
                </a>
              </>
            ) : null}
          </div>
        </div>
      </footer>
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
