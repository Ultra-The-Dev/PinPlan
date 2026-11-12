// Plan reader: prompts, JSON schemas and validation for "explain this sheet" and "ask about this sheet".
// Pure (no SDK) so it can be unit-tested and shared by the route.

export const NOTE_CATEGORIES = ["lowVoltage", "electrical", "lighting", "av", "security", "network", "shades", "general"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export interface PlanPoint {
  x: number;
  y: number;
}
export interface PlanRoom extends PlanPoint {
  name: string;
  size: string | null;
}
export interface PlanDimension extends PlanPoint {
  text: string;
  feet: number | null;
  describes: string | null;
}
export interface PlanNote extends PlanPoint {
  text: string;
  category: NoteCategory;
}
export interface PlanExplanation {
  sheetTitle: string;
  sheetType: string;
  scale: string | null;
  summary: string;
  rooms: PlanRoom[];
  dimensions: PlanDimension[];
  notes: PlanNote[];
  verify: string[];
}
export interface PlanAnswer {
  answer: string;
  points: (PlanPoint & { label: string })[];
}

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
const point = { x: { type: "number" }, y: { type: "number" } };

export const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sheetTitle", "sheetType", "scale", "summary", "rooms", "dimensions", "notes", "verify"],
  properties: {
    sheetTitle: { type: "string" },
    sheetType: { type: "string" },
    scale: nullable({ type: "string" }),
    summary: { type: "string" },
    rooms: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "size", "x", "y"], properties: { name: { type: "string" }, size: nullable({ type: "string" }), ...point } },
    },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "feet", "describes", "x", "y"],
        properties: { text: { type: "string" }, feet: nullable({ type: "number" }), describes: nullable({ type: "string" }), ...point },
      },
    },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "category", "x", "y"],
        properties: { text: { type: "string" }, category: { type: "string", enum: [...NOTE_CATEGORIES] }, ...point },
      },
    },
    verify: { type: "array", items: { type: "string" } },
  },
} as const;

export const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "points"],
  properties: {
    answer: { type: "string" },
    points: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "x", "y"], properties: { label: { type: "string" }, ...point } },
    },
  },
} as const;

const SYSTEM_BASE = `You read architectural floor plans for a low-voltage / smart-home installer (cameras, Wi-Fi, speakers, TVs, LED strip lighting, motorized shades, structured wiring).
Coordinates: x and y are fractions of the image width and height (0 = left/top, 1 = right/bottom) for where the item appears on the sheet.
Only report what is actually printed or clearly drawn on the sheet. If something is unclear, say so instead of guessing. Never invent dimensions.`;

export function buildExplainPrompt(context: { sheetName?: string; knownScale?: string | null }) {
  return `${SYSTEM_BASE}

Read this sheet${context.sheetName ? ` ("${context.sheetName}")` : ""}${context.knownScale ? `; its scale is ${context.knownScale}` : ""} and return:
- sheetTitle and sheetType (e.g. "1st floor plan", "LED lighting plan", "reflected ceiling plan", "elevation").
- scale exactly as printed, or null if none / "NTS".
- summary: 3-6 plain-language sentences an installer can act on — what the sheet shows and what matters for low-voltage work.
- rooms: each labelled room with its printed size (e.g. "14'-6\\" × 12'-0\\"") or null.
- dimensions: each printed dimension string as written, its value in decimal feet, and what it measures (e.g. "kitchen wall", "stair run") or null.
- notes: every note, callout or legend line relevant to the work (LED zones/LF/switch labels, device symbols, ceiling heights, millwork, power/driver locations, conduit, closets), categorised.
- verify: short bullet questions/risks to confirm on site or with the architect (missing dimensions, unclear symbols, conflicts).`;
}

export function buildAskPrompt(question: string, context: { sheetName?: string; knownScale?: string | null }) {
  return `${SYSTEM_BASE}

The installer is looking at this sheet${context.sheetName ? ` ("${context.sheetName}")` : ""}${context.knownScale ? ` (scale ${context.knownScale})` : ""} and asks:
"""${question.slice(0, 2000)}"""

Answer concisely and practically, citing what is printed on the sheet. If the sheet doesn't show it, say so and suggest how to find out.
In points, list the locations on the sheet your answer refers to (label + x/y), or an empty list.`;
}

// ---- validation ----

const clamp01 = (v: unknown) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0.5;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
};
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

export function parseExplanation(raw: string): PlanExplanation {
  const o = (extractJson(raw) ?? {}) as Record<string, unknown>;
  return {
    sheetTitle: str(o.sheetTitle, 120),
    sheetType: str(o.sheetType, 80),
    scale: str(o.scale, 60) || null,
    summary: str(o.summary, 2000),
    rooms: arr(o.rooms, 80)
      .map((r) => r as Record<string, unknown>)
      .filter((r) => str(r.name))
      .map((r) => ({ name: str(r.name, 80), size: str(r.size, 60) || null, x: clamp01(r.x), y: clamp01(r.y) })),
    dimensions: arr(o.dimensions, 200)
      .map((d) => d as Record<string, unknown>)
      .filter((d) => str(d.text))
      .map((d) => ({
        text: str(d.text, 40),
        feet: typeof d.feet === "number" && Number.isFinite(d.feet) && d.feet > 0 && d.feet < 2000 ? d.feet : null,
        describes: str(d.describes, 120) || null,
        x: clamp01(d.x),
        y: clamp01(d.y),
      })),
    notes: arr(o.notes, 120)
      .map((n) => n as Record<string, unknown>)
      .filter((n) => str(n.text))
      .map((n) => ({
        text: str(n.text, 400),
        category: (NOTE_CATEGORIES as readonly string[]).includes(n.category as string) ? (n.category as NoteCategory) : "general",
        x: clamp01(n.x),
        y: clamp01(n.y),
      })),
    verify: arr(o.verify, 30).map((v) => str(v, 300)).filter(Boolean),
  };
}

export function parseAnswer(raw: string): PlanAnswer {
  const o = (extractJson(raw) ?? {}) as Record<string, unknown>;
  const answer = str(o.answer, 4000) || (typeof raw === "string" && !raw.trim().startsWith("{") ? raw.trim().slice(0, 4000) : "");
  return {
    answer,
    points: arr(o.points, 20)
      .map((p) => p as Record<string, unknown>)
      .map((p) => ({ label: str(p.label, 80) || "Here", x: clamp01(p.x), y: clamp01(p.y) })),
  };
}
