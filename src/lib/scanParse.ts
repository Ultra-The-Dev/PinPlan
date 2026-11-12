// Pure helpers for the AI scan assist: the JSON schema Claude must answer with, and
// server-side validation/clamping of whatever comes back. No browser or server imports here.

export interface ScanCatalogEntry {
  id: string;
  name: string;
  symbol: string;
  category: string;
}

export interface ScanLedCallout {
  zone: string;
  lf: number | null;
  switchLabel: string;
  x: number;
  y: number;
  confidence: number;
}

export interface ScanSymbol {
  deviceTypeId: string | null;
  symbolText: string;
  x: number;
  y: number;
  confidence: number;
  tentative: boolean;
}

export interface ScanResult {
  floorName: string;
  ledCallouts: ScanLedCallout[];
  symbols: ScanSymbol[];
}

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });

/** JSON schema used for structured output (all objects closed, all keys required). */
export const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["floorName", "ledCallouts", "symbols"],
  properties: {
    floorName: { type: "string", description: "Floor / sheet name from the title block, e.g. ATTIC, 1ST. FL. Empty if not visible." },
    ledCallouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["zone", "lf", "switchLabel", "x", "y", "confidence"],
        properties: {
          zone: { type: "string", description: "LED zone number as printed, or empty" },
          lf: nullable({ type: "number", description: "Run length in linear feet" }),
          switchLabel: { type: "string", description: "Switch label such as S21, or empty" },
          x: { type: "number", description: "Horizontal position 0-1 relative to image width" },
          y: { type: "number", description: "Vertical position 0-1 relative to image height" },
          confidence: { type: "number", description: "0-1" },
        },
      },
    },
    symbols: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["deviceTypeId", "symbolText", "x", "y", "confidence", "tentative"],
        properties: {
          deviceTypeId: nullable({ type: "string", description: "Catalog id that best matches, or null" }),
          symbolText: { type: "string", description: "Text/letters inside or next to the hand-drawn symbol" },
          x: { type: "number" },
          y: { type: "number" },
          confidence: { type: "number" },
          tentative: { type: "boolean", description: "True if a ? is drawn beside the symbol" },
        },
      },
    },
  },
} as const;

export const TITLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["floorName"],
  properties: { floorName: { type: "string" } },
} as const;

const clamp01 = (v: unknown, percentOk = false): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return null;
  // Positions given as percentages (0-100) are rescaled; small overshoots are clamped.
  const s = percentOk && n > 1.5 && n <= 100 ? n / 100 : n;
  return Math.min(1, Math.max(0, s));
};
const str = (v: unknown, max = 40): string => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 && n < 10_000 ? Math.round(n * 10) / 10 : null;
};

/** Max suggestions kept per sheet, to protect the UI from runaway output. */
export const MAX_ITEMS = 400;

/**
 * Validate and clamp a model response. Unknown catalog ids become null, positions are clamped
 * to 0–1, confidences to 0–1, items without a usable position are dropped.
 */
export function parseScanResult(raw: unknown, catalogIds: string[]): ScanResult {
  const obj = (typeof raw === "string" ? safeJson(raw) : raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") throw new Error("Scan response was not a JSON object");
  const ids = new Set(catalogIds);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const ledCallouts: ScanLedCallout[] = [];
  for (const it of arr(obj.ledCallouts)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const x = clamp01(r.x, true);
    const y = clamp01(r.y, true);
    if (x == null || y == null) continue;
    ledCallouts.push({ zone: str(r.zone, 12), lf: num(r.lf), switchLabel: str(r.switchLabel, 40), x, y, confidence: clamp01(r.confidence) ?? 0.5 });
    if (ledCallouts.length >= MAX_ITEMS) break;
  }

  const symbols: ScanSymbol[] = [];
  for (const it of arr(obj.symbols)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const x = clamp01(r.x, true);
    const y = clamp01(r.y, true);
    if (x == null || y == null) continue;
    const id = typeof r.deviceTypeId === "string" && ids.has(r.deviceTypeId) ? r.deviceTypeId : null;
    symbols.push({ deviceTypeId: id, symbolText: str(r.symbolText, 12), x, y, confidence: clamp01(r.confidence) ?? 0.5, tentative: r.tentative === true });
    if (symbols.length >= MAX_ITEMS) break;
  }

  return { floorName: str(obj.floorName, 60), ledCallouts, symbols };
}

function safeJson(s: string): unknown {
  const t = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* fallthrough */
      }
    }
    return null;
  }
}

/** Title-case a title-block name: "1ST. FL" -> "1st Fl", "ATTIC" -> "Attic". */
export function prettyFloorName(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, suf) => n + suf.toLowerCase());
}

export function buildScanPrompt(catalog: ScanCatalogEntry[], mode: "full" | "title"): string {
  if (mode === "title")
    return "This is one sheet of an architectural plan set. Read the sheet's floor/plan name from the title block (for example ATTIC, 1ST. FL, 2ND FL, CELLAR). Return it in floorName exactly as printed, or an empty string if none is visible.";
  const list = catalog.map((c) => `- ${c.id}: ${c.name} (symbol "${c.symbol}", ${c.category})`).join("\n");
  return `This is one sheet of an architectural floor plan that a low-voltage / smart-home installer has marked up by hand (usually blue pen). Extract three things:

1. floorName: the floor name from the title block (e.g. ATTIC, 1ST. FL, CELLAR), as printed.
2. ledCallouts: the architect's red LED strip callouts. Each has a zone number, a length in LF (linear feet) and often a switch label like S21. Give the position of the callout text.
3. symbols: every hand-drawn device symbol the installer added (circled letters, small drawings). Do not include the architect's printed symbols. For each, pick the best matching catalog id below, or null if none fits. Set tentative=true when a "?" is written beside it. Typical marks: circled W = Wi-Fi access point, circled S = speaker, C / camera drawing = camera (outdoor if on an exterior wall facing out), TV = TV location, SH = smart-home control point, VS = camera monitor / iPad display, M = motorized shade.

Positions x and y are fractions of the image width and height (0 = left/top, 1 = right/bottom), at the centre of the item. Confidence is 0-1. Do not count or total anything; just list what you see. If unsure about an item, include it with a low confidence rather than leaving it out.

Catalog:
${list}`;
}
