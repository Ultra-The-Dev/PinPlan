// Plan legend for clients: what each symbol on the plan means, with a plain-English line and how many there are.
// Pure — symbol images are passed in so this also runs in tests.
import { CATEGORIES, CLOSET_KINDS } from "./catalog";
import type { Takeoff } from "./takeoff";
import type { DeviceType } from "./types";

export interface LegendItem {
  /** Device type id, "closet:<kind>" or "led:<id>". */
  key: string;
  name: string;
  /** What it is, for a homeowner. */
  description: string;
  category: string;
  /** Symbol image (PNG data URL) for devices; a colour swatch for LED lines and closets. */
  icon?: string;
  color?: string;
  count: string;
}

/** Short explanations of the standard device types; custom types fall back to their category. */
export const CLIENT_DESCRIPTIONS: Record<string, string> = {
  "cam-indoor": "Security camera inside the home, viewable on your phone.",
  "cam-outdoor": "Weatherproof security camera on the outside of the home.",
  vs: "Screen or wall-mounted iPad to view your cameras.",
  wap: "Ceiling Wi-Fi access point for strong wireless coverage.",
  "net-switch": "Network switch that connects the wired devices.",
  "data-drop": "Wired internet jack (Cat6) in the wall.",
  speaker: "Speaker built into the ceiling for music around the home.",
  tv: "TV location, wired for picture, sound and internet.",
  sh: "Smart-home control point (hub or controller location).",
  keypad: "Wall keypad to control lights, scenes or shades.",
  "led-ceiling": "Hidden LED strip lighting in the ceiling moulding.",
  "led-furniture": "LED strip lighting built into furniture.",
  "led-cabinet": "LED strip lighting under or inside cabinets.",
  "led-bench": "LED strip lighting under a bench.",
  "led-bed": "LED backlight behind the bed.",
  "led-stair": "LED lights on the stair steps.",
  "led-spot-ceiling": "Small LED spotlight in the ceiling.",
  "led-driver": "LED power supply / lighting zone.",
  shade: "Motorized curtain or shade.",
};

const CATEGORY_TEXT: Record<string, string> = {
  security: "Security",
  network: "Network",
  audio: "Audio",
  video: "Video",
  smarthome: "Smart home",
  lighting: "Lighting",
  shades: "Shades",
  infrastructure: "Equipment",
};

const describe = (d: DeviceType) => CLIENT_DESCRIPTIONS[d.id] ?? `${CATEGORY_TEXT[d.category] ?? "Device"} — ${d.name}.`;

/** Everything a client sees on the plan, grouped by category order, with counts ("3", "2 + 1 optional", "45 LF"). */
export function buildLegend(takeoff: Takeoff, catalog: DeviceType[], icon: (d: DeviceType) => string | undefined): LegendItem[] {
  const t = takeoff.total;
  const order = new Map(CATEGORIES.map((c, i) => [c.id as string, i]));
  const out: (LegendItem & { o: number })[] = [];
  for (const d of catalog) {
    if (d.kind === "led") {
      const ft = t.ledFt[d.id] ?? 0;
      const opt = t.ledTentativeFt[d.id] ?? 0;
      if (!ft && !opt) continue;
      out.push({
        key: `led:${d.id}`,
        name: d.name,
        description: describe(d),
        category: CATEGORY_TEXT[d.category] ?? d.category,
        color: d.color,
        count: opt ? (ft ? `${ft} LF + ${opt} LF optional` : `${opt} LF optional`) : `${ft} LF`,
        o: order.get(d.category) ?? 99,
      });
      continue;
    }
    const n = t.counts[d.id] ?? 0;
    if (!n) continue;
    const opt = t.tentative[d.id] ?? 0;
    const firm = n - opt;
    out.push({
      key: d.id,
      name: d.name,
      description: describe(d),
      category: CATEGORY_TEXT[d.category] ?? d.category,
      icon: icon(d),
      color: d.color,
      count: opt ? (firm ? `${firm} + ${opt} optional` : `${opt} optional`) : String(firm),
      o: order.get(d.category) ?? 99,
    });
  }
  for (const k of CLOSET_KINDS) {
    const n = t.closets[k.id];
    if (n)
      out.push({
        key: `closet:${k.id}`,
        name: k.name,
        description: "Where the equipment and cables come together.",
        category: "Equipment",
        color: k.color,
        count: String(n),
        o: 100,
      });
  }
  return out.sort((a, b) => a.o - b.o).map(({ o: _o, ...x }) => x);
}
