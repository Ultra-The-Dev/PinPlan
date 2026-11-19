// Small, believable pictures of each step of a job, drawn in code. Figures come from the electrical trade pack so the
// names, symbols and prices are the ones a new company actually starts with.
import { TRADE_PACKS, tradePack } from "@/lib/trades";
import { HERO_TOTAL } from "./HeroPlan";
import { Symbol } from "./Symbol";

const EL = tradePack("electrical");
const seed = (id: string) => TRADE_PACKS.flatMap((p) => p.catalog).find((s) => s.id === id)!;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const price = (id: string) => seed(id).unitPrice + seed(id).laborPrice;

function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mk-sheet overflow-hidden text-[14px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-mk-rule px-4 py-2.5">
        <span className="font-semibold">{title}</span>
        {aside && <span className="text-[13px] text-mk-pencil">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** A tiny line drawing of a floor, for the sheet list. */
function Thumb({ variant }: { variant: number }) {
  const walls = ["M4 4h52v36H4zM22 4v20M22 24h34M40 24v16", "M4 4h52v36H4zM30 4v36M4 22h26M30 16h26", "M4 4h52v36H4zM18 4v36M18 20h38"][variant % 3];
  return (
    <svg viewBox="0 0 60 44" className="h-11 w-[60px] shrink-0 rounded-[2px] bg-white ring-1 ring-mk-rule" aria-hidden="true">
      <path d={walls} fill="none" stroke="#1c2a30" strokeWidth="1.4" />
    </svg>
  );
}

export function PlansVisual() {
  const sheets = [
    ["E-100", "Basement"],
    ["E-101", "First floor"],
    ["E-102", "Second floor"],
  ];
  const palette = ["el-rec15", "el-gfci", "el-sw", "el-sw3", "el-can6", "el-smoke"];
  return (
    <Panel title="Harbor View Rd, unit 2" aside="3 floors from one PDF">
      <ul>
        {sheets.map(([no, name], i) => (
          <li key={no} className={`flex items-center gap-3 px-4 py-2.5 ${i === 1 ? "bg-mk-paper" : ""} ${i > 0 ? "border-t border-mk-rule" : ""}`}>
            <Thumb variant={i} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{name}</span>
              <span className="block text-[13px] text-mk-pencil">Sheet {no}</span>
            </span>
            {i === 1 && <span className="rounded-full bg-mk-graphite px-2 py-0.5 text-[12px] font-semibold text-white">Open</span>}
          </li>
        ))}
      </ul>
      <div className="border-t border-mk-rule bg-mk-paper px-4 py-3">
        <div className="text-[13px] text-mk-pencil">Tap a device, then tap the plan</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {palette.map((id) => {
            const s = seed(id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-white py-1 pr-2 pl-1 text-[13px] ring-1 ring-mk-rule">
                <Symbol symbol={s.symbol} color={s.color} shape={s.shape} size={22} />
                {s.name.replace(/ \(.*\)$/, "").replace(/ 15A$/, "")}
              </span>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function CountVisual() {
  const rows: [string, string, number, number][] = [
    ["el-rec15", "Receptacles", 8, 11],
    ["el-gfci", "GFCI receptacles", 7, 3],
    ["el-can6", "Recessed lights", 11, 9],
    ["el-sw", "Switches", 5, 8],
    ["el-smoke", "Smoke alarms", 2, 4],
  ];
  return (
    <div className="space-y-4">
      <Panel title="Device and wire count" aside="Updated as you pin">
        <table className="w-full table-fixed text-[14px]">
          <thead>
            <tr className="text-left text-[13px] text-mk-pencil">
              <th className="py-2 pr-1 pl-3 font-medium sm:pl-4">Device</th>
              <th className="w-[44px] px-1 py-2 text-right font-medium sm:w-[56px] sm:px-2">1st fl</th>
              <th className="w-[48px] px-1 py-2 text-right font-medium sm:w-[60px] sm:px-2">2nd fl</th>
              <th className="w-[70px] py-2 pr-3 pl-1 text-right font-medium sm:w-[88px] sm:pr-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, name, a, b]) => {
              const s = seed(id);
              return (
                <tr key={id} className="border-t border-mk-rule">
                  <td className="px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Symbol symbol={s.symbol} color={s.color} shape={s.shape} size={22} className="shrink-0" />
                      <span className="truncate">{name}</span>
                    </span>
                  </td>
                  <td className="mk-num px-2 py-2 text-right">{a}</td>
                  <td className="mk-num px-2 py-2 text-right">{b}</td>
                  <td className="mk-num px-4 py-2 text-right font-semibold">
                    <span className="mk-hl">{a + b}</span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-mk-rule">
              <td className="truncate px-4 py-2">14/2 NM-B</td>
              <td className="mk-num px-2 py-2 text-right">286</td>
              <td className="mk-num px-2 py-2 text-right">341</td>
              <td className="mk-num px-4 py-2 text-right font-semibold">
                <span className="mk-hl">627 ft</span>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
      <Panel title="Panel schedule, MP" className="sm:ml-12">
        <ul className="text-[13px]">
          {[
            ["1", "Kitchen counter receptacles", "20 A"],
            ["3", "Kitchen and dining lights", "15 A"],
            ["5", "Laundry and garage", "20 A"],
          ].map(([c, n, a]) => (
            <li key={c} className="flex items-center gap-3 border-t border-mk-rule px-4 py-1.5 first:border-t-0">
              <span className="mk-num w-4 text-mk-pencil">{c}</span>
              <span className="min-w-0 flex-1 truncate">{n}</span>
              <span className="mk-num">{a}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function QuoteVisual() {
  const lines: [string, string, number][] = [
    ["el-can6", "Recessed light 6\"", 20],
    ["el-rec15", "Duplex receptacle 15A", 19],
    ["el-gfci", "GFCI receptacle", 10],
    ["el-sw", "Single-pole switch", 13],
  ];
  const sub = lines.reduce((s, [id, , n]) => s + n * price(id), 0) + 627 * (EL.wirePrices["14/2 NM-B"] ?? 0);
  return (
    <Panel title="Pricing" aside="From your price list">
      <table className="w-full text-[14px]">
        <tbody>
          {lines.map(([id, name, n]) => (
            <tr key={id} className="border-b border-mk-rule">
              <td className="py-2 pl-4">{name}</td>
              <td className="mk-num px-2 py-2 text-right whitespace-nowrap text-mk-pencil">
                {n} × {money(price(id))}
              </td>
              <td className="mk-num py-2 pr-4 text-right">{money(n * price(id))}</td>
            </tr>
          ))}
          <tr className="border-b border-mk-rule">
            <td className="py-2 pl-4">14/2 NM-B wire</td>
            <td className="mk-num px-2 py-2 text-right whitespace-nowrap text-mk-pencil">627 ft</td>
            <td className="mk-num py-2 pr-4 text-right">{money(627 * (EL.wirePrices["14/2 NM-B"] ?? 0))}</td>
          </tr>
          <tr className="border-b border-mk-rule bg-mk-paper">
            <td className="py-2 pl-4" colSpan={2}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded-[3px] border-[1.5px] border-mk-graphite" aria-hidden="true" />
                Optional: under-cabinet lights, 12 ft
              </span>
            </td>
            <td className="mk-num py-2 pr-4 text-right text-mk-pencil">+{money(12 * price("el-ucab"))}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-baseline justify-between px-4 py-3">
        <span className="text-mk-pencil">Markup 15%, labor included</span>
        <span className="mk-figure text-[24px]">{money(sub * 1.15)}</span>
      </div>
    </Panel>
  );
}

export function ApproveVisual() {
  return (
    <div className="mx-auto w-full max-w-[290px]">
      <div className="mk-phone">
        <div className="mk-screen text-[13px]">
          <div className="px-5 pt-6 pb-4">
            <div className="text-mk-pencil">Quote from Northline Electric</div>
            <div className="mk-figure mt-1 text-[30px]">{money(HERO_TOTAL)}</div>
            <div className="text-mk-pencil">First floor power and lighting</div>
          </div>
          <div className="space-y-2 border-t border-mk-rule px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-mk-graphite" aria-hidden="true">
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="#ffc933" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Add under-cabinet lights
              <span className="mk-num ml-auto">+{money(12 * price("el-ucab"))}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-[18px] w-[18px] rounded-[4px] border-[1.5px] border-mk-graphite" aria-hidden="true" />
              Add EV outlet in garage
              <span className="mk-num ml-auto text-mk-pencil">+{money(price("ev-outlet"))}</span>
            </div>
          </div>
          <div className="border-t border-mk-rule px-5 py-4">
            <div className="text-mk-pencil">Sign here</div>
            <svg viewBox="0 0 200 44" className="mt-1 h-10 w-full" aria-hidden="true">
              <path
                d="M8 32c10-18 18-26 21-18s-6 20 1 16 12-21 17-17-3 16 4 15 11-15 16-12 1 11 8 10 12-10 18-9 5 8 12 6 15-8 22-6 13 4 26 1"
                fill="none"
                stroke="#1c2a30"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path d="M6 40h188" stroke="#c9d1d3" />
            </svg>
            <div className="mt-3 flex h-11 items-center justify-center rounded-[10px] bg-mk-ok font-semibold text-white">Approved by Dana Whitfield</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoiceVisual() {
  const total = HERO_TOTAL;
  const deposit = Math.round(total * 0.5);
  const progress = Math.round(total * 0.3);
  const rows: [string, number, "Paid" | "Sent" | "Draft"][] = [
    ["Deposit, 50%", deposit, "Paid"],
    ["Progress, rough-in done", progress, "Sent"],
    ["Final", total - deposit - progress, "Draft"],
  ];
  const tone = { Paid: "bg-mk-ok text-white", Sent: "bg-mk-marker text-mk-graphite", Draft: "bg-mk-paper text-mk-pencil ring-1 ring-mk-rule" };
  return (
    <Panel title="Money" aside={`Approved quote ${money(total)}`}>
      <ul>
        {rows.map(([name, amount, status], i) => (
          <li key={name} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-mk-rule" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{name}</span>
              <span className="block text-[13px] text-mk-pencil">Invoice INV-2026-{String(41 + i).padStart(4, "0")}</span>
            </span>
            <span className="mk-num">{money(amount)}</span>
            <span className={`w-14 rounded-full py-0.5 text-center text-[12px] font-semibold ${tone[status]}`}>{status}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-mk-rule bg-mk-paper px-4 py-3">
        <span className="text-mk-pencil">Left to collect</span>
        <span className="mk-figure text-[22px]">{money(total - deposit)}</span>
      </div>
    </Panel>
  );
}

export function FieldVisual() {
  return (
    <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
      <div className="mk-sheet overflow-hidden">
        {/* A photo of an open stud bay with a box, marked up in red. */}
        <svg viewBox="0 0 240 200" className="block h-auto w-full" aria-hidden="true">
          <rect width="240" height="200" fill="#b9a68a" />
          <rect x="0" y="0" width="240" height="200" fill="url(#mk-osb)" opacity="0.35" />
          <defs>
            <pattern id="mk-osb" width="14" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 3h6M8 7h5M3 9h4" stroke="#8f7a5c" strokeWidth="1.4" />
            </pattern>
          </defs>
          {[22, 112, 202].map((x) => (
            <rect key={x} x={x} y="0" width="18" height="200" fill="#d9c49e" stroke="#a78f69" />
          ))}
          <path d="M131 0C128 40 150 60 150 92" fill="none" stroke="#e8e3d6" strokeWidth="4" />
          <path d="M136 0C136 30 160 60 160 92" fill="none" stroke="#e7b400" strokeWidth="4" />
          <rect x="140" y="90" width="28" height="42" rx="3" fill="#2f5fa8" />
          <rect x="146" y="98" width="16" height="26" rx="2" fill="#244a85" />
          {/* mark-up */}
          <ellipse cx="154" cy="111" rx="30" ry="36" fill="none" stroke="#c73a2c" strokeWidth="3" />
          <path d="M120 160L76 160M86 152l-10 8 10 8" fill="none" stroke="#c73a2c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="18" y="168" width="134" height="22" rx="4" fill="#c73a2c" />
          <text x="85" y="183" textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="600">
            Move box 6 in. left
          </text>
        </svg>
        <div className="px-3 py-2 text-[13px]">
          <span className="font-semibold">Kitchen, island wall</span>
          <span className="block text-mk-pencil">Pinned to E-101, tagged rough-in</span>
        </div>
      </div>
      <div className="space-y-4 text-[14px]">
        <Panel title="Rough-in checklist" aside="2 of 3">
          <ul className="space-y-2 px-4 py-3">
            {[
              ["Boxes set at 16 in. to center", true],
              ["Home runs labelled at the panel", true],
              ["Photo every wall before drywall", false],
            ].map(([t, done]) => (
              <li key={String(t)} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] ${done ? "bg-mk-graphite" : "border-[1.5px] border-mk-graphite"}`}
                  aria-hidden="true"
                >
                  {done && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3">
                      <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="#ffc933" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={done ? "text-mk-pencil line-through decoration-mk-rule" : ""}>{t}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Task">
          <div className="px-4 py-3">
            <div className="font-semibold">Pull circuits 7 to 12 to MP</div>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-mk-pencil">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mk-paper text-[11px] font-semibold text-mk-graphite ring-1 ring-mk-rule">MK</span>
              Marcus King, due Thursday
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
