// /welcome: what PinPlan does for an installer, in their words. Static (server) markup with small client islands.
import {
  ArrowRight,
  Calculator,
  Camera,
  Cctv,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Layers,
  Lightbulb,
  MapPin,
  Monitor,
  Network,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Speaker,
  Tablet,
  Users,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { PLANS, TRIAL_DAYS, monthlyPrice } from "@/lib/plans";
import PlanIllustration, { TakeoffCard } from "./PlanIllustration";
import { DeletedNotice, Faq, SitePage, TryDemoLink } from "./Site";

const TRADES = [
  { icon: Cctv, label: "Security cameras" },
  { icon: Network, label: "Network & Wi-Fi" },
  { icon: Speaker, label: "Audio / video" },
  { icon: Lightbulb, label: "Smart home & lighting" },
];

const FLOW = [
  { icon: MapPin, title: "Pin devices", body: "Drop cameras, APs, speakers and keypads right on the floor plan." },
  { icon: Layers, title: "Per-floor takeoff", body: "Counts and cable footage for every floor, always in step with the plan." },
  { icon: Calculator, title: "Priced estimate", body: "Your catalog prices, markup, labor and wire by the foot." },
  { icon: FileSignature, title: "Proposal & e-sign", body: "A branded link your client signs on their phone." },
  { icon: Camera, title: "Field docs", body: "Photos, checklists and daily logs on the same job." },
];

export default function Landing() {
  const plan = PLANS[0];
  return (
    <SitePage>
      <DeletedNotice />
      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,var(--color-brand-100),transparent_70%)] opacity-70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-20">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-soft ring-1 ring-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> For low-voltage installers
            </span>
            <h1 className="mt-5 text-[2.15rem] leading-[1.08] font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
              Pin it on the plan.
              <br />
              <span className="text-brand-600">Price it before you leave the site.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              PinPlan turns a floor plan into a per-floor device takeoff, a priced estimate and a client proposal they sign on their phone — then keeps your crew’s
              photos, checklists and daily logs on the same job.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="btn btn-brand h-12 px-5 text-[15px]">
                Start {TRIAL_DAYS}-day free trial <ArrowRight />
              </Link>
              <Link href="/pricing" className="btn h-12 px-5 text-[15px]">
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Just looking? <TryDemoLink className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900" /> — your jobs stay on this
              device.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {TRADES.map((t) => (
                <li key={t.label} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  <t.icon className="h-3.5 w-3.5 text-slate-400" /> {t.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="rounded-2xl bg-white p-2 shadow-pop ring-1 ring-slate-200 sm:p-3">
              <PlanIllustration className="block h-auto w-full" />
            </div>
            <TakeoffCard className="relative mx-auto -mt-10 sm:absolute sm:right-[-12px] sm:-bottom-8 sm:mt-0 lg:right-[-24px]" />
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="border-y border-slate-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-center text-sm font-medium text-slate-500">From walkthrough to signed job, in one app</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((f, i) => (
              <li key={f.title} className="relative rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-600 shadow-soft ring-1 ring-slate-200">
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs text-slate-400">0{i + 1}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-snug text-slate-500">{f.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 space-y-16 px-4 py-16 sm:space-y-24 sm:px-6 sm:py-24">
        <Feature
          eyebrow="Plans & devices"
          title="Count from the plan, not from memory"
          points={[
            "Upload the architect’s PDF or a photo of the plan — every floor becomes a sheet.",
            "Pin cameras, access points, speakers, TVs, keypads and fixtures; draw LED and cable runs to the rack.",
            "Set the scale once and lengths come out in feet, with slack and drops added for you.",
            "The AI plan reader suggests devices — nothing counts until you accept it.",
          ]}
          visual={<DeviceList />}
        />
        <Feature
          flip
          eyebrow="Takeoff & estimate"
          title="Your takeoff and estimate, already done"
          points={[
            "A per-floor takeoff of every device and foot of wire, straight from what’s pinned.",
            "Priced from your own catalog with markup, labor and tax; mark items tentative for options.",
            "Export the takeoff and plan sheets as PDF, or send the estimate to Billdu in one tap.",
          ]}
          visual={<EstimateMock />}
        />
        <Feature
          eyebrow="Client proposals"
          title="Proposals your client signs on their phone"
          points={[
            "Publish a branded proposal link with your logo, plans and terms.",
            "Clients tick optional add-ons, sign with their finger and accept — no account needed.",
            "See when it’s opened and accepted; the job turns Approved and the add-ons switch on.",
          ]}
          visual={<ProposalMock />}
        />
        <Feature
          flip
          eyebrow="In the field"
          title="Photos, checklists and logs where the work is"
          points={[
            "Job photos pinned to the plan, with mark-up and comments.",
            "Rough-in and trim-out checklists your techs tick off on site.",
            "Daily logs and photo reports ready to send to the GC or homeowner.",
          ]}
          visual={<FieldMock />}
        />
        <Feature
          eyebrow="Your team"
          title="One company, everyone on the same jobs"
          points={[
            "Invite office staff and technicians with a code — each gets their own login.",
            "Technicians see plans, devices, photos and tasks, but never your prices.",
            "Everyone’s changes sync to every device the moment they’re back online.",
          ]}
          visual={<TeamMock />}
        />
      </section>

      {/* Devices / offline */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Works on iPad, iPhone and web — even offline.</h2>
            <p className="mt-4 max-w-md leading-relaxed text-white/70">
              Basements and new builds rarely have signal. PinPlan keeps every job on the device and syncs when you’re back online, so the walkthrough never waits for a
              connection.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {[
              { icon: Tablet, t: "iPad", d: "Walk the site with the plan" },
              { icon: Smartphone, t: "iPhone", d: "Photos and checklists" },
              { icon: Monitor, t: "Web", d: "Estimates in the office" },
              { icon: WifiOff, t: "Offline", d: "Syncs when you’re back" },
            ].map((x) => (
              <li key={x.t} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <x.icon className="h-5 w-5 text-brand-300" />
                <div className="mt-3 font-medium">{x.t}</div>
                <div className="text-white/60">{x.d}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="card flex flex-col gap-6 p-6 ring-1 ring-slate-200/70 sm:p-8 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Simple pricing for the whole company</h2>
            <p className="mt-2 text-slate-600">
              <span className="font-semibold text-slate-900">${plan.basePrice}/month</span> includes {plan.includedSeats} users, then ${plan.seatPrice} per extra user. A crew of
              six is ${monthlyPrice(plan, 6)}/month. Start with a {TRIAL_DAYS}-day free trial.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/pricing" className="btn h-11 px-5">
              Pricing details
            </Link>
            <Link href="/signup" className="btn btn-brand h-11 px-5">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 pb-16 sm:px-6 sm:pb-24">
        <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight text-slate-900">Questions installers ask</h2>
        <Faq
          items={[
            ["Do I need internet on site?", "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online."],
            [
              "What plans can I use?",
              "Architect PDFs (every page becomes a sheet), photos or scans of a printed plan, or a sketch. Set the scale once from any known dimension.",
            ],
            ["Can my technicians use it without seeing prices?", "Yes. Technicians get their own login and see plans, devices, photos, checklists and tasks — never prices, estimates or proposals."],
            ["Does it work with my accounting?", "Estimates, orders and invoices go straight to Billdu. You can also export the takeoff, estimate and plan sheets as PDF or CSV."],
            [
              `What happens after the ${TRIAL_DAYS}-day trial?`,
              <>
                Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See <Link href="/pricing" className="underline underline-offset-2">pricing</Link>.
              </>,
            ],
            ["Is my data private?", "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings."],
          ]}
        />
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-brand-600 px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your next walkthrough could end with a signed proposal.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">Set up your company in two minutes. Bring your crew when you’re ready.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn h-12 border-white bg-white px-6 text-[15px] text-brand-700 hover:bg-brand-50 hover:text-brand-700">
              Start free trial <ArrowRight />
            </Link>
            <Link href="/login" className="btn btn-ghost h-12 px-6 text-[15px] text-white hover:bg-white/10 hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}

function Feature(props: { eyebrow: string; title: string; points: string[]; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
      <div className={props.flip ? "md:order-2" : ""}>
        <div className="text-sm font-semibold text-brand-600">{props.eyebrow}</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{props.title}</h2>
        <ul className="mt-5 space-y-3">
          {props.points.map((p) => (
            <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-slate-600">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand-500" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={props.flip ? "md:order-1" : ""}>{props.visual}</div>
    </div>
  );
}

function MockFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200 sm:p-5">
      <div className="card overflow-hidden ring-1 ring-slate-200/70">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="ml-2 truncate text-xs font-medium text-slate-500">{title}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function DeviceList() {
  const items: [React.ElementType, string, string, string][] = [
    [Cctv, "Turret camera 4K", "Exterior · eave", "#c2410c"],
    [Network, "Wi-Fi 7 access point", "Ceiling · hallway", "#2563eb"],
    [Speaker, "6.5″ in-ceiling speaker", "Living · pair", "#7c3aed"],
    [Lightbulb, "Keypad, 6-button", "Entry · 48″ AFF", "#b45309"],
  ];
  return (
    <MockFrame title="1st floor · Sheet A-101">
      <ul className="space-y-2">
        {items.map(([Icon, name, where, c]) => (
          <li key={name} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/60">
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: c }}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
              <span className="block truncate text-xs text-slate-500">{where}</span>
            </span>
            <MapPin className="h-4 w-4 text-slate-300" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 ring-1 ring-brand-200">
        <Sparkles className="h-3.5 w-3.5" /> Plan reader found 6 more devices — review to add them
      </div>
    </MockFrame>
  );
}

function EstimateMock() {
  const rows: [string, string, string][] = [
    ["Turret camera 4K — installed", "8", "$3,360.00"],
    ["Wi-Fi 7 access point — installed", "4", "$1,780.00"],
    ["In-ceiling speaker pair", "6", "$2,940.00"],
    ["Cat6 plenum, per ft", "1,240", "$868.00"],
  ];
  return (
    <MockFrame title="Estimate · 14 Harbor View Rd">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([d, q, t]) => (
            <tr key={d} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-2 text-slate-700">{d}</td>
              <td className="py-2 pr-2 text-right font-mono text-slate-500 tabular-nums">{q}</td>
              <td className="py-2 text-right font-mono text-slate-900 tabular-nums">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
        <span className="text-sm text-slate-500">Total incl. tax</span>
        <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">$9,846.00</span>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="btn btn-sm btn-primary">
          <Receipt /> Send to Billdu
        </span>
        <span className="btn btn-sm">
          <FileSignature /> Client proposal
        </span>
      </div>
    </MockFrame>
  );
}

function ProposalMock() {
  return (
    <div className="mx-auto max-w-xs rounded-[2rem] bg-ink p-2.5 shadow-pop">
      <div className="overflow-hidden rounded-[1.5rem] bg-white">
        <div className="bg-slate-900 px-5 py-4 text-white">
          <div className="text-[11px] text-white/60">Proposal from</div>
          <div className="font-semibold">Brightline Integration</div>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Security & network</span>
            <span className="font-mono tabular-nums">$9,846</span>
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-brand-800 ring-1 ring-brand-200">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-brand-600 text-white">
              <CheckCircle2 className="h-3 w-3" />
            </span>
            Add: garage camera <span className="ml-auto font-mono">+$420</span>
          </label>
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4">
            <svg viewBox="0 0 200 40" className="h-8 w-full" aria-hidden>
              <path d="M8 30c14-22 22-22 24-6s10 10 18-6 14-14 16 2 12 12 22-4 18-10 26 2 20 10 34-6" fill="none" stroke="#1c1a18" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="mt-1 text-[11px] text-slate-400">Signed by Dana Whitfield</div>
          </div>
          <span className="btn btn-brand w-full">Accept proposal</span>
        </div>
      </div>
    </div>
  );
}

function FieldMock() {
  return (
    <MockFrame title="Daily log · Tue">
      <div className="grid grid-cols-3 gap-2">
        {["#efece7", "#e2ded7", "#ccc6bd"].map((c, i) => (
          <div key={c} className="relative aspect-square rounded-lg" style={{ background: c }}>
            <Camera className="absolute top-2 left-2 h-3.5 w-3.5 text-slate-500" />
            {i === 1 && <span className="absolute right-2 bottom-2 h-6 w-6 rounded-full border-2 border-red-500" />}
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {[
          ["Rough-in: all low-voltage brackets set", true],
          ["Home runs labelled at the rack", true],
          ["Photo every wall before drywall", false],
        ].map(([t, done]) => (
          <li key={String(t)} className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ClipboardCheck className="h-4 w-4 text-slate-300" />}
            <span className={done ? "text-slate-500 line-through decoration-slate-300" : "text-slate-800"}>{t}</span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function TeamMock() {
  const people: [string, string, string, string][] = [
    ["JL", "Jordan Lee", "Owner", "bg-slate-900 text-white"],
    ["PR", "Priya Raman", "Office", "bg-brand-100 text-brand-800"],
    ["MK", "Marcus King", "Technician", "bg-slate-100 text-slate-700"],
    ["AT", "Ana Torres", "Technician", "bg-slate-100 text-slate-700"],
  ];
  return (
    <MockFrame title="Settings · Team">
      <ul className="divide-y divide-slate-100">
        {people.map(([i, n, r, c]) => (
          <li key={n} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i}</span>
            <span className="flex-1 text-sm font-medium text-slate-900">{n}</span>
            <span className={`chip ${c}`}>{r}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Technicians never see prices
        <Users className="ml-auto h-3.5 w-3.5 text-slate-400" />
      </div>
    </MockFrame>
  );
}
