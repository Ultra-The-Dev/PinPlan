// /welcome: what the product does for a contractor, in their words, in the order a job actually runs.
// Server markup; the header, FAQ and demo link are small client islands.
import Link from "next/link";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS, monthlyPrice } from "@/lib/plans";
import { closetMeta } from "@/lib/catalog";
import { tradePack } from "@/lib/trades";
import type { TradeId } from "@/lib/types";
import HeroPlan from "./HeroPlan";
import { ApproveVisual, CountVisual, FieldVisual, InvoiceVisual, PlansVisual, QuoteVisual } from "./StepVisuals";
import { DeletedNotice, Faq, SitePage, TryDemoLink } from "./Site";
import { Symbol } from "./Symbol";

const STEPS: { id: string; title: string; body: string; detail: string[]; visual: React.ReactNode }[] = [
  {
    id: "plan",
    title: "Pin devices on the plans",
    body: "Upload the PDF set or a photo of the drawings. Every page becomes a floor you can pinch, zoom and flip through. Tap a device from your trade’s list and tap where it goes.",
    detail: ["Letters on the plan, like the legend on the drawings", "Wire runs drawn back to the panel, rack or closet", "Set the scale once from any known dimension"],
    visual: <PlansVisual />,
  },
  {
    id: "count",
    title: "Get the count for every floor",
    body: "Device and wire counts add up as you pin, floor by floor. Wire lengths come out in feet with slack included, and electrical jobs get circuits and a panel schedule.",
    detail: ["Counts come only from what’s on the plan", "Export the count and marked-up sheets as PDF"],
    visual: <CountVisual />,
  },
  {
    id: "quote",
    title: "Price it from your price list",
    body: "Your material and labor prices, markup and wire by the foot turn the count into a quote. Mark items optional and let the client decide.",
    detail: ["Starting prices for your trade, all editable", "Change the plan and the quote follows"],
    visual: <QuoteVisual />,
  },
  {
    id: "approve",
    title: "Your client approves on their phone",
    body: "Send the client a link. They read the quote, tick the options they want, sign with a finger and approve. No account or app for them.",
    detail: ["See when it’s opened and when it’s approved", "The approved options are added to the job"],
    visual: <ApproveVisual />,
  },
  {
    id: "bill",
    title: "Bill the deposit, progress and final",
    body: "Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.",
    detail: ["Quote and invoice numbering, tax and terms set once", "See what’s paid and what’s left on every job"],
    visual: <InvoiceVisual />,
  },
  {
    id: "field",
    title: "Run the job in the field",
    body: "The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.",
    detail: ["Photos pinned to the spot on the plan", "Daily logs and photo reports ready to send"],
    visual: <FieldVisual />,
  },
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
  const plan = PLANS[0];
  return (
    <SitePage>
      <DeletedNotice />
      <Hero />

      {/* How a job runs */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-mk-rule">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-[40rem]">
            <h2 id="how-title" className="mk-h2">
              One job, from the first walkthrough to the final invoice
            </h2>
            <p className="mk-lede mt-5">Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.</p>
          </div>
          <ol className="mk-rail mt-14 space-y-16 lg:mt-20 lg:space-y-24">
            {STEPS.map((s, i) => (
              <li key={s.id} className="relative grid gap-8 pl-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
                <span className="mk-step-pin absolute top-0 left-0">{i + 1}</span>
                <div className="lg:pt-0.5">
                  <h3 className="mk-h3">{s.title}</h3>
                  <p className="mk-body mt-3">{s.body}</p>
                  <ul className="mt-5 space-y-2 text-[15px]">
                    {s.detail.map((d) => (
                      <li key={d} className="flex gap-3">
                        <span className="mt-[9px] h-[2px] w-3 shrink-0 bg-mk-graphite" aria-hidden="true" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="-ml-14 min-w-0 lg:ml-0">{s.visual}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trades */}
      <section id="trades" aria-labelledby="trades-title" className="scroll-mt-20 border-t border-mk-rule bg-mk-sheet">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
            <h2 id="trades-title" className="mk-h2">
              Your trade’s devices, already on the list
            </h2>
            <p className="mk-lede lg:pt-2">
              Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.
            </p>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {TRADES.map((t) => {
              const pack = tradePack(t.id);
              const items = t.picks.map((id) => pack.catalog.find((c) => c.id === id)).filter((c) => !!c);
              const ends = pack.closets.map((c) => closetMeta(c).name);
              return (
                <div key={t.id} className="border-t-2 pt-4" style={{ borderColor: pack.color }}>
                  <h3 className="text-[20px] font-[750]" style={{ fontStretch: "75%" }}>
                    {pack.name}
                  </h3>
                  <ul className="mt-3 space-y-2 text-[15px]">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <Symbol symbol={c.symbol} color={c.color} shape={c.shape} size={30} />
                        <span className="min-w-0">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px] leading-snug">
                    <dt className="text-mk-pencil">Runs to</dt>
                    <dd>{ends.slice(0, 2).join(", ")}</dd>
                    <dt className="text-mk-pencil">{pack.wireNoun}</dt>
                    <dd>{pack.wireTypes.slice(0, 3).join(", ")} and more</dd>
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section aria-labelledby="team-title" className="border-t border-mk-rule">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
          <div>
            <h2 id="team-title" className="mk-h2">
              The office sees the money. The crew sees the work.
            </h2>
            <p className="mk-lede mt-5">
              Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.
            </p>
            <dl className="mt-8 space-y-4 text-[15px]">
              {[
                ["Owner and office", "Plans, counts, prices, quotes, invoices and settings."],
                ["Technicians", "Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs."],
              ].map(([t, d]) => (
                <div key={t} className="grid gap-1 border-l-2 border-mk-graphite pl-4">
                  <dt className="font-semibold">{t}</dt>
                  <dd className="text-mk-pencil">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
          <TeamCompare />
        </div>
      </section>

      {/* Offline + devices */}
      <section aria-labelledby="offline-title" className="mk-dark">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <h2 id="offline-title" className="mk-h2">
              No signal in the basement? Keep working.
            </h2>
            <p className="mk-lede mt-5">
              Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.
            </p>
            <ul className="mt-8 grid gap-x-8 gap-y-5 text-[15px] sm:grid-cols-2">
              {[
                ["iPad", "Walk the site with the plans"],
                ["iPhone", "Photos, checklists and tasks"],
                ["Web", "Quotes and invoices at the desk"],
                ["Large plan sets", "Opens fast; pinch, zoom and flip sheets"],
              ].map(([t, d]) => (
                <li key={t} className="border-t border-white/15 pt-3">
                  <div className="font-semibold">{t}</div>
                  <div className="text-mk-on-dark">{d}</div>
                </li>
              ))}
            </ul>
          </div>
          <DevicesDrawing />
        </div>
      </section>

      {/* Pricing teaser */}
      <section aria-labelledby="price-title" className="border-b border-mk-rule">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
            <div>
              <h2 id="price-title" className="mk-h2">
                One price for the company
              </h2>
              <p className="mk-lede mt-5">
                Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {TRIAL_DAYS} days.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="mk-btn mk-btn-primary">
                  Start free trial
                </Link>
                <Link href="/pricing" className="mk-btn mk-btn-line">
                  See pricing
                </Link>
              </div>
            </div>
            <TitleBlock
              cells={[
                { label: "Monthly", value: `$${plan.basePrice}`, note: `includes ${plan.includedSeats} users`, big: true },
                { label: "Each extra user", value: `$${plan.seatPrice}`, note: "a month", big: true },
                { label: "A crew of 6", value: `$${monthlyPrice(plan, 6)}`, note: "a month" },
                { label: "Free trial", value: `${TRIAL_DAYS} days`, note: "every feature" },
              ]}
              footnote="Prices in USD, plus applicable tax."
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
          <h2 id="faq-title" className="mk-h2">
            Questions contractors ask
          </h2>
          <Faq
            items={[
              ["Do I need internet on site?", "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online."],
              [
                "What plans can I use?",
                "PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension.",
              ],
              [
                "Which trades does it work for?",
                "Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list.",
              ],
              [
                "Can my technicians use it without seeing prices?",
                "Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app.",
              ],
              [
                "Does it work with my accounting?",
                `Quotes, invoices and payments are built into ${PRODUCT_NAME}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.`,
              ],
              [
                `What happens after the ${TRIAL_DAYS}-day trial?`,
                <>
                  Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See{" "}
                  <Link href="/pricing" className="mk-link">
                    pricing
                  </Link>
                  .
                </>,
              ],
              ["Is my data private?", "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings."],
            ]}
          />
        </div>
      </section>

      {/* Final call */}
      <section aria-labelledby="cta-title" className="bg-mk-marker text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-20">
          <div>
            <h2 id="cta-title" className="mk-h2 max-w-[16em]">
              Bring your next set of plans
            </h2>
            <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed">
              Set up your company, upload a plan and send a real quote during the {TRIAL_DAYS}-day trial. Bring the crew in when you’re ready.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="mk-btn mk-btn-ink">
              Start free trial
            </Link>
            <TryDemoLink className="mk-link h-12 px-2 text-left text-[15px] sm:text-center" />
          </div>
        </div>
      </section>
    </SitePage>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-4 pt-12 pb-20 sm:px-6 sm:pt-16 lg:pt-20 lg:pb-28">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-14">
          <h1 id="hero-title" className="mk-display">
            Pin the plan. Send the quote. Get it signed.
          </h1>
          <div className="lg:pb-2">
            <p className="mk-lede">
              {PRODUCT_NAME} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count,
              the wire and your price come straight from it.
            </p>
            <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row">
              <Link href="/signup" className="mk-btn mk-btn-primary">
                Start free trial
              </Link>
              <Link href="#how" className="mk-btn mk-btn-line">
                See how it works
              </Link>
            </div>
            <p className="mt-5 text-[15px] text-mk-pencil">
              Free for {TRIAL_DAYS} days with every feature. Just looking? <TryDemoLink className="mk-link text-mk-graphite" />.
            </p>
          </div>
        </div>
        <div className="mt-12 lg:mt-16">
          <HeroPlan />
        </div>
      </div>
    </section>
  );
}

/** The same job seen by the office and by a technician. */
function TeamCompare() {
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
        <div key={who} className="mk-sheet overflow-hidden text-[14px]">
          <div className="flex items-center justify-between border-b border-mk-rule px-4 py-2.5">
            <span className="font-semibold">Kitchen, first floor</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${who === "Office" ? "bg-mk-graphite text-white" : "bg-mk-marker text-white"}`}>{who}</span>
          </div>
          <ul>
            {rows.map(({ name, n, done, s }) => (
              <li key={s.id} className="flex items-center gap-2.5 border-b border-mk-rule px-4 py-2.5 last:border-b-0">
                <Symbol symbol={s.symbol} color={s.color} shape={s.shape} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{name}</span>
                  <span className="block text-[13px] text-mk-pencil">{n} on the plan</span>
                </span>
                {who === "Office" ? (
                  <span className="mk-num font-semibold">${(n * (s.unitPrice + s.laborPrice)).toLocaleString("en-US")}</span>
                ) : (
                  <span className="mk-num text-[13px] text-mk-pencil">{done === n ? "All set" : `${done} of ${n} set`}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-mk-rule bg-mk-paper px-4 py-2.5 text-[13px] text-mk-pencil">
            {who === "Office" ? "Quote, invoices and margins" : "Photos, checklist and today’s tasks"}
          </div>
        </div>
      ))}
    </div>
  );
}

/** iPad, iPhone and laptop drawn as plan linework. */
function DevicesDrawing() {
  return (
    <svg viewBox="0 0 520 330" className="h-auto w-full" role="img" aria-label="The same plan open on an iPad, an iPhone and a laptop">
      <g fill="none" stroke="#a9bcd4" strokeWidth="1.5">
        {/* laptop */}
        <rect x="150" y="30" width="330" height="210" rx="10" />
        <rect x="164" y="44" width="302" height="182" rx="2" strokeOpacity="0.5" />
        <path d="M120 252h390l-14 22H134z" />
        {/* plan on laptop */}
        <path d="M200 70h230v130H200zM300 70v60M300 130h130M360 130v70" stroke="#fff" strokeOpacity="0.5" />
        {/* iPad */}
        <rect x="40" y="96" width="180" height="230" rx="14" fill="#0f2340" />
        <rect x="52" y="108" width="156" height="206" rx="3" strokeOpacity="0.5" />
        <path d="M70 134h120v150H70zM70 200h70M140 134v66M140 240h50" stroke="#fff" strokeOpacity="0.5" />
        {/* iPhone */}
        <rect x="392" y="150" width="96" height="176" rx="16" fill="#0f2340" />
        <rect x="402" y="162" width="76" height="152" rx="6" strokeOpacity="0.5" />
        <path d="M412 190h56v90h-56zM412 232h30" stroke="#fff" strokeOpacity="0.5" />
      </g>
      {/* the same pins on each */}
      <g fill="#33a9ff">
        {[
          [240, 100], [340, 100], [400, 170], [250, 170],
          [96, 160], [168, 160], [110, 250], [172, 262],
          [428, 210], [454, 254],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" />
        ))}
      </g>
    </svg>
  );
}

function TitleBlock({ cells, footnote }: { cells: { label: string; value: string; note: string; big?: boolean }[]; footnote?: string }) {
  return (
    <div className="mk-sheet grid grid-cols-2 self-start">
      {cells.map((c, i) => (
        <div key={c.label} className={`px-5 py-5 sm:px-6 ${i % 2 === 0 ? "border-r border-mk-rule" : ""} ${i >= 2 ? "border-t border-mk-rule" : ""}`}>
          <div className="text-[14px] text-mk-pencil">{c.label}</div>
          <div className={`mk-figure mt-1 ${c.big ? "text-[44px] sm:text-[56px]" : "text-[28px] sm:text-[32px]"}`}>{c.value}</div>
          <div className="mt-1 text-[14px] text-mk-pencil">{c.note}</div>
        </div>
      ))}
      {footnote && <p className="col-span-2 border-t border-mk-rule px-5 py-3 text-[13px] text-mk-pencil sm:px-6">{footnote}</p>}
    </div>
  );
}
