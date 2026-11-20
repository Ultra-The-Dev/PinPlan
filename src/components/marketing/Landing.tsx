"use client";
// /welcome: what the product does for a contractor, in their words, in the order a job actually runs.
// A client component so the text follows the visitor's language (it still renders in English on the server).
// Layout and rules: docs/brand.md. One bold thing on the page: the hero plan on the ink drafting table.
import Link from "next/link";
import { msg, useT } from "@/lib/i18n";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS, monthlyPrice } from "@/lib/plans";
import { closetMeta } from "@/lib/catalog";
import { tradePack } from "@/lib/trades";
import type { TradeId } from "@/lib/types";
import HeroPlan from "./HeroPlan";
import { ApproveVisual, CountVisual, CrewVisual, FieldVisual, InvoiceVisual, PlansVisual, QuoteVisual } from "./StepVisuals";
import { DeletedNotice, Faq, SitePage, TryDemoLink } from "./Site";
import { Symbol, SymbolMark } from "./Symbol";
import { rich } from "../auth/rich";

/** How a job runs, start to finish. Numbered because it is a sequence. */
const STEPS: { title: string; body: string }[] = [
  { title: msg("Upload the plans"), body: msg("Drop in the PDF set or a photo of the drawings. Every page becomes a floor.") },
  { title: msg("Pin every device"), body: msg("Tap a device from your trade’s list, then tap where it goes on the plan.") },
  { title: msg("Get the count"), body: msg("Devices and wire add up per floor as you pin. Nothing is counted twice.") },
  { title: msg("Send the quote"), body: msg("Your prices turn the count into a quote the client signs on their phone.") },
  { title: msg("Bill and build"), body: msg("Invoice from the approved quote while the crew works from the same plans.") },
];

/** Four real starting devices per trade, looked up from the trade packs. */
const TRADES: { id: TradeId; picks: string[] }[] = [
  { id: "electrical", picks: ["el-rec15", "el-sw", "el-can6", "el-smoke"] },
  { id: "lowvoltage", picks: ["cam-indoor", "wap", "speaker", "tv"] },
  { id: "fire", picks: ["fa-smoke", "fa-pull", "fa-hs", "fa-mon"] },
  { id: "hvac", picks: ["hv-supply", "hv-return", "hv-tstat", "hv-mini"] },
  { id: "plumbing", picks: ["pl-wc", "pl-lav", "pl-ks", "pl-hb"] },
  { id: "solar", picks: ["pv-module", "pv-mi", "pv-rsd", "ev-charger"] },
];

export default function Landing() {
  const t = useT();
  const plan = PLANS[0];
  return (
    <SitePage>
      <DeletedNotice />
      <Hero />

      {/* How a job runs */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-20">
        <div className="mx-auto max-w-[1240px] px-4 pt-20 pb-20 sm:px-6 lg:pt-28 lg:pb-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <h2 id="how-title" className="mk-h2 max-w-[14em]">
              {t("One job, from the first walkthrough to the final invoice")}
            </h2>
            <p className="mk-lede lg:pb-1">{t("Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.")}</p>
          </div>
          <ol className="mk-steps mt-14 grid gap-9 lg:mt-20 lg:grid-cols-5 lg:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative pl-14 lg:pt-16 lg:pl-0">
                <span className="mk-step-pin absolute top-0 left-0">{i + 1}</span>
                <h3 className="text-[21px] leading-tight font-semibold" style={{ fontStretch: "75%" }}>
                  {t(s.title)}
                </h3>
                <p className="mt-2 max-w-[22em] text-[15px] leading-relaxed text-mk-pencil">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trades: a drawing legend, one column per trade */}
      <section id="trades" aria-labelledby="trades-title" className="scroll-mt-20 border-t border-mk-rule bg-mk-sheet">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <h2 id="trades-title" className="mk-h2 max-w-[13em]">
              {t("Your trade’s devices, already on the list")}
            </h2>
            <p className="mk-lede lg:pb-1">
              {t("Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.")}
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[4px] border border-mk-rule bg-mk-rule sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
            {TRADES.map((tr) => {
              const pack = tradePack(tr.id);
              const items = tr.picks.map((id) => pack.catalog.find((c) => c.id === id)).filter((c) => !!c);
              const ends = pack.closets.map((c) => t(closetMeta(c).name));
              return (
                <div key={tr.id} className="relative bg-mk-sheet px-5 pt-6 pb-5 sm:px-6">
                  <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: pack.color }} aria-hidden="true" />
                  <h3 className="text-[22px] leading-tight font-bold" style={{ fontStretch: "75%" }}>
                    {t(pack.name)}
                  </h3>
                  <ul className="mt-4 space-y-2.5 text-[15px]">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <Symbol symbol={c.symbol} color={c.color} shape={c.shape} size={30} className="shrink-0" />
                        <span className="min-w-0">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-dashed border-mk-rule pt-3 text-[14px] leading-snug">
                    <dt className="text-mk-pencil">{t("Runs to")}</dt>
                    <dd>{ends.slice(0, 2).join(", ")}</dd>
                    <dt className="text-mk-pencil">{t(pack.wireNoun)}</dt>
                    <dd>{t("{list} and more", { list: pack.wireTypes.slice(0, 3).join(", ") })}</dd>
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Feature
        id="takeoff"
        title={t("Count from the plan, floor by floor")}
        body={t("Tap a device, tap the plan. Device and wire counts add up as you pin, with wire lengths in feet and slack included. Electrical jobs also get circuits and a panel schedule.")}
        points={[
          t("Letters on the plan, like the legend on the drawings"),
          t("Wire runs drawn back to the panel, rack or closet"),
          t("Set the scale once from any known dimension"),
          t("Counts come only from what’s on the plan"),
          t("Export the count and marked-up sheets as PDF"),
        ]}
        visual={
          <div className="space-y-4 lg:space-y-5">
            <div className="lg:mr-16">
              <PlansVisual />
            </div>
            <div className="lg:ml-16">
              <CountVisual />
            </div>
          </div>
        }
      />

      <Feature
        id="quotes"
        flip
        title={t("A quote your client signs on their phone")}
        body={t("Your material and labor prices, markup and wire by the foot turn the count into a quote. Send the client a link: they tick the options they want, sign with a finger and approve. No account or app for them.")}
        points={[
          t("Starting prices for your trade, all editable"),
          t("Change the plan and the quote follows"),
          t("See when it’s opened and when it’s approved"),
          t("The approved options are added to the job"),
        ]}
        visual={
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_270px]">
            <QuoteVisual />
            <div className="md:mt-20">
              <ApproveVisual />
            </div>
          </div>
        }
        wide
      />

      <Feature
        id="invoices"
        title={t("Bill the deposit, progress and final")}
        body={t("Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.")}
        points={[t("Quote and invoice numbering, tax and terms set once"), t("See what’s paid and what’s left on every job"), t("Change orders signed the same way as quotes")]}
        visual={<InvoiceVisual />}
      />

      <Feature
        id="field"
        flip
        title={t("Run the job in the field")}
        body={t("The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.")}
        points={[t("Photos pinned to the spot on the plan"), t("Daily logs and photo reports ready to send")]}
        visual={<FieldVisual />}
      />

      {/* Offline + devices */}
      <section aria-labelledby="offline-title" className="mk-dark mk-table">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
          <div>
            <h2 id="offline-title" className="mk-h2 max-w-[11em]">
              {t("No signal in the basement? Keep working.")}
            </h2>
            <p className="mk-lede mt-5">
              {t("Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.")}
            </p>
            <dl className="mt-10 grid gap-x-8 gap-y-5 text-[15px] sm:grid-cols-2">
              {[
                [msg("iPad"), msg("Walk the site with the plans")],
                [msg("iPhone"), msg("Photos, checklists and tasks")],
                [msg("Web"), msg("Quotes and invoices at the desk")],
                [msg("Large plan sets"), msg("Opens fast; pinch, zoom and flip sheets")],
              ].map(([term, d]) => (
                <div key={term} className="border-t border-white/15 pt-3">
                  <dt className="font-semibold">{t(term)}</dt>
                  <dd className="text-mk-on-dark">{t(d)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <DevicesDrawing />
        </div>
      </section>

      {/* Crew: language and what each login sees */}
      <section id="crew" aria-labelledby="crew-title" className="scroll-mt-20">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
            <div>
              <h2 id="crew-title" className="mk-h2 max-w-[12em]">
                {t("The crew reads it in their language. The client gets English.")}
              </h2>
              <p className="mk-lede mt-5">
                {t("Each person picks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese or Vietnamese, and the choice stays with their login. Plans, checklists, tasks and daily logs read in their language; quotes, invoices and client emails always go out in English.")}
              </p>
              <p className="mt-4 text-[15px] text-mk-pencil">{t("All eight languages work in the web app today, in any computer, tablet or phone browser, and on the iPad and iPhone app.")}</p>
            </div>
            <CrewVisual />
          </div>

          <div className="mt-20 grid gap-12 border-t border-mk-rule pt-16 lg:mt-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pt-20">
            <div>
              <h3 className="mk-h3 max-w-[14em]">{t("The office sees the money. The crew sees the work.")}</h3>
              <p className="mk-body mt-4">
                {t("Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.")}
              </p>
              <dl className="mt-8 space-y-4 text-[15px]">
                {[
                  [msg("Owner and office"), msg("Plans, counts, prices, quotes, invoices and settings.")],
                  [msg("Technicians"), msg("Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs.")],
                ].map(([term, d]) => (
                  <div key={term} className="grid gap-1 border-l-2 border-mk-graphite pl-4">
                    <dt className="font-semibold">{t(term)}</dt>
                    <dd className="text-mk-pencil">{t(d)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <TeamCompare />
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section aria-labelledby="price-title" className="border-t border-mk-rule bg-mk-sheet">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-16">
            <div>
              <h2 id="price-title" className="mk-h2">
                {t("One price for the company")}
              </h2>
              <p className="mk-lede mt-5">
                {t.tn(
                  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} day.",
                  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} days.",
                  TRIAL_DAYS,
                )}
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                <Link href="/signup" className="mk-btn mk-btn-primary">
                  {t("Start free trial")}
                </Link>
                <Link href="/pricing" className="mk-btn mk-btn-line">
                  {t("See pricing")}
                </Link>
              </div>
            </div>
            <TitleBlock
              cells={[
                { label: t("Monthly"), value: `$${plan.basePrice}`, note: t.tn("includes {n} user", "includes {n} users", plan.includedSeats), big: true },
                { label: t("Each extra user"), value: `$${plan.seatPrice}`, note: t("a month"), big: true },
                { label: t.tn("A crew of {n}", "A crew of {n}", 6), value: `$${monthlyPrice(plan, 6)}`, note: t("a month") },
                { label: t("Free trial"), value: t.tn("{n} day", "{n} days", TRIAL_DAYS), note: t("every feature") },
              ]}
              footnote={t("Prices in USD, plus applicable tax.")}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-mk-rule">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
          <div>
            <h2 id="faq-title" className="mk-h2">
              {t("Questions contractors ask")}
            </h2>
            <p className="mt-5 text-[15px] text-mk-pencil">
              {rich(t("Still deciding? {ask} or {demo}."), {
                ask: (
                  <Link href="/support" className="mk-link text-mk-graphite">
                    {t("Ask us anything")}
                  </Link>
                ),
                demo: <TryDemoLink className="mk-link text-mk-graphite" />,
              })}
            </p>
          </div>
          <Faq
            items={[
              [t("Do I need internet on site?"), t("No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online.")],
              [
                t("What plans can I use?"),
                t("PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension."),
              ],
              [
                t("Which trades does it work for?"),
                t("Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list."),
              ],
              [
                t("Can my technicians use it without seeing prices?"),
                t("Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app."),
              ],
              [
                t("Can my crew use it in their own language?"),
                t("Yes. Northpin speaks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese and Vietnamese. Anyone can switch from the menu or the page footer on the web, and the iPad and iPhone app follows the device language. The choice is saved on their login. Quotes, invoices and everything the client sees stay in English."),
              ],
              [
                t("Does it work with my accounting?"),
                t("Quotes, invoices and payments are built into {product}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.", { product: PRODUCT_NAME }),
              ],
              [
                t.tn("What happens after the {n}-day trial?", "What happens after the {n}-day trial?", TRIAL_DAYS),
                rich(t("Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See {pricing}."), {
                  pricing: (
                    <Link href="/pricing" className="mk-link">
                      {t("pricing")}
                    </Link>
                  ),
                }),
              ],
              [t("Is my data private?"), t("Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings.")],
            ]}
          />
        </div>
      </section>

      {/* Final call */}
      <section aria-labelledby="cta-title" className="bg-mk-marker text-white">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16 lg:py-24">
          <div>
            <h2 id="cta-title" className="mk-display">
              {t("Bring your next set of plans")}
            </h2>
          </div>
          <div>
            <p className="max-w-[34em] text-[17px] leading-relaxed">
              {t.tn(
                "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.",
                "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.",
                TRIAL_DAYS,
              )}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="mk-btn mk-btn-ink">
                {t("Start free trial")}
              </Link>
              <TryDemoLink className="mk-link min-h-12 px-1 text-left text-[15px] sm:text-center" />
            </div>
          </div>
        </div>
      </section>
    </SitePage>
  );
}

function Hero() {
  const t = useT();
  // One line per sentence: the three things the product does, in order.
  const lines = t("Pin the plan. Send the quote. Get it signed.")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return (
    <section aria-labelledby="hero-title">
      <div className="mk-dark mk-table flow-root">
        <div className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end lg:gap-12">
            <h1 id="hero-title" className="mk-display">
              {lines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </h1>
            <div className="lg:pb-2">
              <p className="mk-lede">
                {t(
                  "{product} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count, the wire and your price come straight from it.",
                  { product: PRODUCT_NAME },
                )}
              </p>
              <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                <Link href="/signup" className="mk-btn mk-btn-primary">
                  {t("Start free trial")}
                </Link>
                <Link href="#how" className="mk-btn mk-btn-line">
                  {t("See how it works")}
                </Link>
              </div>
              <p className="mt-5 text-[15px] text-mk-on-dark">
                {rich(
                  t.tn(
                    "Free for {n} day with every feature. Just looking? {demo}.",
                    "Free for {n} days with every feature. Just looking? {demo}.",
                    TRIAL_DAYS,
                  ),
                  { demo: <TryDemoLink className="mk-link" /> },
                )}
              </p>
            </div>
          </div>
          {/* The plan lies on the ink table and runs off its edge onto the paper below. */}
          <div className="relative z-10 mt-12 -mb-24 sm:-mb-32 lg:mt-16 lg:-mb-40">
            <HeroPlan />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1240px] px-4 pt-32 pb-2 sm:px-6 sm:pt-40 lg:pt-52">
        <TradeStrip />
      </div>
    </section>
  );
}

/** The six trades as a quiet line under the hero, each in its pack colour. No customer logos: these are the lists that ship. */
function TradeStrip() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 border-t border-mk-rule pt-6 lg:flex-row lg:items-baseline lg:gap-10">
      <p className="shrink-0 text-[15px] font-semibold">{t("Starting device lists and prices for")}</p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-[15px] text-mk-pencil">
        {TRADES.map((tr) => {
          const pack = tradePack(tr.id);
          return (
            <li key={tr.id} className="flex items-center gap-2">
              <span className="mk-trade-dot" style={{ background: pack.color }} aria-hidden="true" />
              {t(pack.name)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A feature: words on one side, a drawing of the app on the other. `flip` puts the drawing first on wide screens. */
function Feature({
  id,
  title,
  body,
  points,
  visual,
  flip = false,
  wide = false,
}: {
  id: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  /** Drawing first on wide screens. */
  flip?: boolean;
  /** Give the drawing two thirds of the width (a document and a phone side by side). */
  wide?: boolean;
}) {
  const cols = wide
    ? flip
      ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]"
      : "lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]"
    : flip
      ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]"
      : "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]";
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-mk-rule">
      <div className={`mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:gap-16 lg:py-28 ${cols}`}>
        <div className={`lg:sticky lg:top-28 lg:self-start ${flip ? "lg:order-2" : ""}`}>
          <h2 id={`${id}-title`} className="mk-h2 max-w-[12em]">
            {title}
          </h2>
          <p className="mk-body mt-5">{body}</p>
          <ul className="mt-7 space-y-2.5 text-[15px]">
            {points.map((d) => (
              <li key={d} className="flex gap-3">
                <span className="mt-[10px] h-[2px] w-3 shrink-0 bg-mk-marker" aria-hidden="true" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{visual}</div>
      </div>
    </section>
  );
}

/** The same job seen by the office and by a technician. */
function TeamCompare() {
  const t = useT();
  const el = tradePack("electrical");
  const rows = (
    [
      ["el-can6", "Recessed light 6\"", 20, 14],
      ["el-gfci", "GFCI receptacle", 10, 10],
      ["el-sw3", "3-way switch", 4, 1],
    ] as const
  ).map(([id, name, n, done]) => ({ name, n, done, s: el.catalog.find((c) => c.id === id)! }));
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      {(["Office", "Technician"] as const).map((who) => (
        <div key={who} className={`mk-sheet overflow-hidden text-[14px] ${who === "Technician" ? "sm:mt-10" : ""}`}>
          <div className="flex items-center justify-between gap-2 border-b border-mk-rule px-4 py-2.5">
            <span className="min-w-0 font-semibold">{t("Kitchen, first floor")}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold text-white ${who === "Office" ? "bg-mk-graphite" : "bg-mk-marker"}`}>
              {who === "Office" ? t("Office") : t("Technician")}
            </span>
          </div>
          <ul>
            {rows.map(({ name, n, done, s }) => (
              <li key={s.id} className="flex items-center gap-2.5 border-b border-mk-rule px-4 py-2.5 last:border-b-0">
                <Symbol symbol={s.symbol} color={s.color} shape={s.shape} size={22} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{name}</span>
                  <span className="block text-[13px] text-mk-pencil">{t("{n} on the plan", { n })}</span>
                </span>
                {who === "Office" ? (
                  <span className="mk-num font-semibold">${(n * (s.unitPrice + s.laborPrice)).toLocaleString("en-US")}</span>
                ) : (
                  <span className="mk-num text-right text-[13px] text-mk-pencil">{done === n ? t("All set") : t("{done} of {total} set", { done, total: n })}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-mk-rule bg-mk-paper px-4 py-2.5 text-[13px] text-mk-pencil">
            {who === "Office" ? t("Quote, invoices and margins") : t("Photos, checklist and today’s tasks")}
          </div>
        </div>
      ))}
    </div>
  );
}

/** iPad, iPhone and laptop drawn as plan linework, with the same lettered devices on each. */
function DevicesDrawing() {
  const t = useT();
  const el = tradePack("electrical");
  const sym = (id: string) => el.catalog.find((c) => c.id === id)!;
  const pins: [string, number, number, number][] = [
    // laptop
    ["el-can6", 238, 98, 7], ["el-can6", 330, 98, 7], ["el-gfci", 404, 96, 7], ["el-rec15", 250, 172, 7], ["el-sw", 330, 156, 7], ["el-smoke", 404, 176, 7],
    // iPad
    ["el-can6", 98, 162, 8], ["el-gfci", 166, 160, 8], ["el-sw", 110, 238, 8], ["el-rec15", 170, 266, 8],
    // iPhone
    ["el-gfci", 428, 212, 7], ["el-can6", 454, 256, 7],
  ];
  return (
    <svg viewBox="0 0 520 340" className="h-auto w-full" role="img" aria-label={t("The same plan open on an iPad, an iPhone and a laptop")}>
      <g fill="none" stroke="#a9bcd4" strokeWidth="1.5">
        {/* laptop */}
        <rect x="150" y="30" width="330" height="210" rx="10" fill="#0f2340" />
        <rect x="164" y="44" width="302" height="182" rx="2" fill="#fff" stroke="none" />
        <path d="M120 252h390l-14 22H134z" fill="#0f2340" />
        <path d="M200 70h230v130H200zM300 70v60M300 130h130M360 130v70" stroke="#0f2340" strokeWidth="2.2" />
        {/* iPad */}
        <rect x="40" y="96" width="180" height="234" rx="14" fill="#0f2340" />
        <rect x="52" y="108" width="156" height="210" rx="3" fill="#fff" stroke="none" />
        <path d="M70 134h120v156H70zM70 204h70M140 134v70M140 246h50" stroke="#0f2340" strokeWidth="2.2" />
        {/* iPhone */}
        <rect x="392" y="150" width="96" height="180" rx="16" fill="#0f2340" />
        <rect x="402" y="162" width="76" height="156" rx="7" fill="#fff" stroke="none" />
        <path d="M412 190h56v96h-56zM412 234h30" stroke="#0f2340" strokeWidth="2" />
      </g>
      {pins.map(([id, x, y, r], i) => {
        const s = sym(id);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <SymbolMark symbol={s.symbol} color={s.color} shape={s.shape} r={r} />
          </g>
        );
      })}
      {/* sync: the same job on every screen */}
      <g fill="none" stroke="#33a9ff" strokeWidth="1.5" strokeDasharray="4 4">
        <path d="M220 206c40 0 60-20 60-50" />
        <path d="M466 240c10-30 0-44-18-52" />
      </g>
    </svg>
  );
}

function TitleBlock({ cells, footnote }: { cells: { label: string; value: string; note: string; big?: boolean }[]; footnote?: string }) {
  return (
    <div className="mk-sheet grid grid-cols-2 self-start">
      {cells.map((c, i) => (
        <div key={c.label} className={`min-w-0 px-5 py-5 sm:px-7 sm:py-6 ${i % 2 === 0 ? "border-r border-mk-rule" : ""} ${i >= 2 ? "border-t border-mk-rule" : ""}`}>
          <div className="text-[14px] text-mk-pencil">{c.label}</div>
          <div className={`mk-figure mt-1.5 ${c.big ? "text-[48px] sm:text-[64px]" : "text-[28px] sm:text-[34px]"}`}>{c.value}</div>
          <div className="mt-1.5 text-[14px] text-mk-pencil">{c.note}</div>
        </div>
      ))}
      {footnote && <p className="col-span-2 border-t border-mk-rule px-5 py-3 text-[13px] text-mk-pencil sm:px-7">{footnote}</p>}
    </div>
  );
}
