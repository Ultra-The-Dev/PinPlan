// The hero: an electrical first-floor plan with devices pinned on it, the count that comes out of it and the quote the
// client approved. Every figure is computed from the pins and runs below with the electrical trade pack's own
// symbols and starting prices (src/lib/trades.ts), the way computeTakeoff/buildEstimate do it in the app.
import { msg, useT } from "@/lib/i18n";
import { tradePack } from "@/lib/trades";
import { SymbolMark } from "./Symbol";

const PACK = tradePack("electrical");
const SEED = Object.fromEntries(PACK.catalog.map((s) => [s.id, s]));
const PX_PER_FT = 12;

/** Short names for the count. */
const LABEL: Record<string, string> = {
  "el-rec15": msg("Receptacles"),
  "el-gfci": msg("GFCI receptacles"),
  "el-sw": msg("Switches"),
  "el-sw3": msg("3-way switches"),
  "el-can6": msg("Recessed lights"),
  "el-surf": msg("Surface fixtures"),
  "el-smoke": msg("Smoke alarms"),
};

type Pin = [id: keyof typeof LABEL, x: number, y: number];
const PINS: Pin[] = [
  // Kitchen
  ["el-gfci", 262, 40], ["el-gfci", 340, 40], ["el-gfci", 398, 96],
  ["el-can6", 270, 92], ["el-can6", 350, 92], ["el-can6", 270, 150], ["el-can6", 350, 150], ["el-sw", 238, 184],
  // Garage
  ["el-gfci", 206, 60], ["el-surf", 126, 96], ["el-surf", 126, 190], ["el-sw", 206, 166], ["el-gfci", 72, 244],
  // Laundry
  ["el-gfci", 60, 370], ["el-surf", 126, 322], ["el-rec15", 166, 370], ["el-sw", 206, 346],
  // Dining
  ["el-can6", 512, 112], ["el-rec15", 594, 60], ["el-rec15", 594, 170], ["el-sw3", 430, 184],
  // Living
  ["el-sw3", 318, 216], ["el-can6", 290, 244], ["el-can6", 410, 244], ["el-can6", 290, 330], ["el-can6", 410, 330],
  ["el-smoke", 350, 287], ["el-rec15", 238, 252], ["el-rec15", 350, 370], ["el-rec15", 462, 290],
  // Office
  ["el-sw", 494, 274], ["el-can6", 545, 245], ["el-rec15", 594, 230], ["el-rec15", 540, 286], ["el-smoke", 585, 282],
  // Bath
  ["el-gfci", 594, 330], ["el-can6", 545, 345], ["el-sw", 494, 368],
];

const PANEL = { x: 48, y: 52 };
/** Circuits drawn on the plan, panel first. */
const RUNS: { wire: string; pts: [number, number][] }[] = [
  { wire: "12/2 NM-B", pts: [[PANEL.x, PANEL.y], [206, 60], [262, 40], [340, 40], [398, 96]] },
  { wire: "12/2 NM-B", pts: [[PANEL.x, PANEL.y], [72, 244], [60, 370]] },
  { wire: "14/2 NM-B", pts: [[238, 184], [270, 150], [270, 92], [350, 92], [350, 150]] },
];

function runPath(pts: [number, number][]) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const chord = Math.hypot(dx, dy);
    // Electrical plans draw circuits as arcs between devices.
    const cx = (x0 + x1) / 2 - dy * 0.18;
    const cy = (y0 + y1) / 2 + dx * 0.18;
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1} ${y1}`;
    len += chord * 1.04;
  }
  return { d, len };
}
const RUN_PATHS = RUNS.map((r) => ({ ...r, ...runPath(r.pts) }));

// ---- the count and the price, from the pins and runs ----
const COUNT = Object.keys(LABEL)
  .map((id) => ({ id, n: PINS.filter((p) => p[0] === id).length, seed: SEED[id] }))
  .filter((r) => r.n > 0 && r.seed)
  .sort((a, b) => b.n - a.n);
const WIRE = Object.entries(
  RUN_PATHS.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.wire]: (acc[r.wire] ?? 0) + r.len / PX_PER_FT }), {}),
).map(([wire, ft]) => ({ wire, ft: Math.round(ft * 1.1) })); // + 10% slack
const DEVICES_TOTAL = COUNT.reduce((s, r) => s + r.n * (r.seed.unitPrice + r.seed.laborPrice), 0);
const WIRE_TOTAL = WIRE.reduce((s, w) => s + w.ft * (PACK.wirePrices[w.wire] ?? 0), 0);
export const HERO_TOTAL = Math.round(DEVICES_TOTAL + WIRE_TOTAL);
export const HERO_DEVICES = PINS.length;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function HeroPlan() {
  const t = useT();
  return (
    <figure className="relative">
      <figcaption className="sr-only">
        {t.tn(
          "An electrical floor plan with {n} device pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.",
          "An electrical floor plan with {n} devices pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.",
          HERO_DEVICES,
          { total: money(HERO_TOTAL) },
        )}
      </figcaption>
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_236px] md:items-start lg:grid-cols-[minmax(0,1fr)_256px] lg:gap-0">
        <PlanSheet />
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-1 md:pt-8 lg:-ml-6 lg:gap-5">
          <Tally />
          <QuoteCard className="md:hidden" />
          <div className="mk-phone mk-anim-rise hidden md:block lg:ml-8" style={{ ["--d" as string]: "2200ms" }}>
            <div className="mk-screen">
              <QuoteBody />
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

function PlanSheet() {
  const t = useT();
  return (
    <div className="mk-sheet overflow-hidden">
      <svg viewBox="0 -18 640 424" className="block h-auto w-full" style={{ fontFamily: "inherit" }}>
        {/* Overall dimension */}
        <g stroke="#526580" strokeWidth="0.8" fill="none">
          <path d="M30 -8H610M30 -13V-3M610 -13V-3" />
        </g>
        <rect x="294" y="-15" width="52" height="12" fill="#fff" />
        <text x="320" y="-5.5" textAnchor="middle" fontSize="9.5" fill="#526580">
          48&apos;-4&quot;
        </text>

        {/* Walls */}
        <g fill="none" stroke="#0f2340" strokeLinecap="square">
          <rect x="30" y="24" width="580" height="360" strokeWidth="6" />
          <path
            strokeWidth="3.5"
            d="M222 24V116M222 150V296M222 330V384M30 262H96M132 262H222M222 200H300M404 200H478M478 200H610M414 24V112M478 200V226M478 260V316M478 350V384M478 300H610"
          />
        </g>
        {/* Windows */}
        <g fill="#fff" stroke="#0f2340" strokeWidth="1">
          <rect x="300" y="21" width="56" height="6" />
          <rect x="484" y="21" width="80" height="6" />
          <rect x="300" y="381" width="110" height="6" />
          <rect x="607" y="214" width="6" height="48" />
        </g>
        {/* Overhead garage door */}
        <path d="M30 104V232" stroke="#fff" strokeWidth="7" />
        <path d="M36 104V232" stroke="#526580" strokeWidth="1" strokeDasharray="6 4" />
        {/* Door swings */}
        <g fill="none" stroke="#8a9bb3" strokeWidth="1">
          <path d="M222 150A34 34 0 0 1 188 116L222 116" />
          <path d="M222 330A34 34 0 0 0 256 296L222 296" />
          <path d="M132 262A36 36 0 0 0 96 226L96 262" />
          <path d="M478 260A34 34 0 0 1 512 226L478 226" />
          <path d="M478 350A34 34 0 0 1 512 316L478 316" />
        </g>
        {/* Room names, lettered the way plans are */}
        <g fill="#8a9bb3" fontSize="9" letterSpacing="1.4" fontWeight="600">
          <text x="80" y="140">GARAGE</text>
          <text x="80" y="300">LAUNDRY</text>
          <text x="300" y="128">KITCHEN</text>
          <text x="452" y="70">DINING</text>
          <text x="326" y="268">LIVING</text>
          <text x="510" y="214">OFFICE</text>
          <text x="520" y="376">BATH</text>
        </g>

        {/* Circuits */}
        <g fill="none" stroke="#0f2340" strokeWidth="1.3" strokeLinecap="round" opacity="0.7">
          {RUN_PATHS.map((r, i) => (
            <path key={i} d={r.d} className="mk-anim-run" style={{ ["--len" as string]: Math.ceil(r.len * 1.1), ["--i" as string]: i }} />
          ))}
        </g>

        {/* Panel */}
        <g transform={`translate(${PANEL.x} ${PANEL.y})`}>
          <rect x="-11" y="-16" width="22" height="32" rx="2" fill="#0f2340" />
          <text y="3.5" textAnchor="middle" fill="#33a9ff" fontSize="9.5" fontWeight="700" style={{ fontStretch: "75%" }}>
            MP
          </text>
        </g>

        {/* Devices */}
        {PINS.map(([id, x, y], i) => {
          const s = SEED[id];
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className="mk-anim-pin" style={{ ["--i" as string]: i, filter: "drop-shadow(0 1px 1.2px rgb(15 35 64 / 0.35))" }}>
                <SymbolMark symbol={s.symbol} color={s.color} shape={s.shape} r={10.5} />
              </g>
            </g>
          );
        })}
      </svg>
      {/* Title block */}
      <div className="grid grid-cols-[1fr_auto] border-t border-mk-rule text-[12px] leading-tight sm:grid-cols-[1.3fr_1fr_auto]">
        <div className="border-r border-mk-rule px-3 py-2">
          <div className="text-mk-pencil">{t("Job")}</div>
          <div className="font-semibold">Harbor View Rd, unit 2</div>
        </div>
        <div className="hidden border-r border-mk-rule px-3 py-2 sm:block">
          <div className="text-mk-pencil">{t("Floor")}</div>
          <div className="font-semibold">{t("First floor power and lighting")}</div>
        </div>
        <div className="px-3 py-2 text-right">
          <div className="text-mk-pencil">{t("Sheet")}</div>
          <div className="mk-figure text-[15px]">E-101</div>
        </div>
      </div>
    </div>
  );
}

function Tally({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <div className={`mk-sheet mk-anim-rise p-3.5 text-[13px] ${className}`} style={{ ["--d" as string]: "1500ms" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{t("First floor count")}</span>
        <span className="text-mk-pencil">{t.tn("{n} device", "{n} devices", HERO_DEVICES)}</span>
      </div>
      <ul className="mt-2.5 space-y-[5px]">
        {COUNT.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <svg viewBox="-11 -11 22 22" width="20" height="20" className="shrink-0">
              <SymbolMark symbol={r.seed.symbol} color={r.seed.color} shape={r.seed.shape} r={9} ring={false} />
            </svg>
            <span className="min-w-0 flex-1 truncate">{t(LABEL[r.id])}</span>
            <span className="mk-num font-semibold">{r.n}</span>
          </li>
        ))}
        {WIRE.map((w) => (
          <li key={w.wire} className="flex items-center gap-2 border-t border-dashed border-mk-rule pt-[5px]">
            <svg viewBox="0 0 18 18" width="18" height="18" className="shrink-0">
              <path d="M2 12Q9 3 16 12" fill="none" stroke="#0f2340" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 flex-1 truncate">{w.wire}</span>
            <span className="mk-num font-semibold">{t("{ft} ft", { ft: w.ft })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Signature() {
  return (
    <svg viewBox="0 0 160 36" className="h-8 w-full" aria-hidden="true">
      <path
        d="M6 26c8-14 14-20 17-14s-5 16 1 13 10-17 14-14-2 13 3 12 9-12 13-10 1 9 6 8 10-8 15-7 4 6 10 5 12-6 18-5 10 3 20 1"
        fill="none"
        stroke="#0f2340"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuoteBody() {
  const t = useT();
  const lines = COUNT.slice(0, 3);
  return (
    <div className="text-[12px]">
      <div className="bg-mk-graphite px-4 pt-5 pb-3 text-white">
        <div className="text-mk-on-dark">{t("Quote {number}", { number: "Q-1042" })}</div>
        <div className="mk-figure mt-0.5 text-[26px]">{money(HERO_TOTAL)}</div>
      </div>
      <div className="space-y-1.5 px-4 pt-3">
        {lines.map((r) => (
          <div key={r.id} className="flex justify-between gap-2">
            <span className="truncate text-mk-pencil">
              {t(LABEL[r.id])} ({r.n})
            </span>
            <span className="mk-num">{money(r.n * (r.seed.unitPrice + r.seed.laborPrice))}</span>
          </div>
        ))}
        <div className="text-mk-pencil">{t.tn("and {n} more line", "and {n} more lines", COUNT.length - lines.length + WIRE.length)}</div>
      </div>
      <div className="relative mx-4 mt-3 mb-4 border-t border-mk-rule pt-2">
        <Signature />
        <div className="text-[11px] text-mk-pencil">{t("Signed by {name}", { name: "Dana Whitfield" })}</div>
        <div className="mk-anim-stamp absolute -top-1 right-0 rounded-[3px] border-2 border-mk-ok px-1.5 py-0.5 text-[12px] font-bold text-mk-ok" style={{ fontStretch: "75%" }}>
          {t("Approved")}
        </div>
      </div>
    </div>
  );
}

function QuoteCard({ className = "" }: { className?: string }) {
  return (
    <div className={`mk-sheet mk-anim-rise overflow-hidden ${className}`} style={{ ["--d" as string]: "2200ms" }}>
      <QuoteBody />
    </div>
  );
}
