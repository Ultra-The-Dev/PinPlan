// Floor names read off a plan sheet: "1ST. FL", "FIRST FLOOR", "2ND FLR", "LEVEL 2", "L2", "GROUND FLOOR", "BASEMENT",
// "CELLAR", "ATTIC", "ROOF", "MEZZANINE", "LOWER LEVEL", "UNIT 3B"… The title block (bottom-right corner, or a
// vertical strip down the right edge) wins, then large type anywhere. Room labels, notes, schedules and elevation
// marks ("FIN. FL. ELEV", "FLOOR DRAIN", "STAIR TO 2ND FLOOR") don't count. Pure: no DOM, no PDF.js. The same rules
// live in Swift (ios/PinPlanCore/Sources/PinPlanCore/FloorName.swift); docs/sheet-index-links.md.

/** One text run on a page: a relative 0–1 box (y from the top). Same shape as `PageTextItem`. */
export interface FloorTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Kind = "ordinal" | "named" | "number" | "code" | "word" | "unit" | "site";

interface Hit {
  /** Friendly name in Title Case, e.g. "1st Fl", "Level 2". */
  name: string;
  /** Canonical key so "FIRST FLOOR", "1st Fl" and "1ST FLR" compare equal. */
  key: string;
  kind: Kind;
  start: number;
  end: number;
}

const ORD_WORDS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH"];
const ORDW = ORD_WORDS.join("|");
const ORDN = String.raw`\d{1,2}\s?(?:ST|ND|RD|TH)\.?`;
const ORD = `(?:${ORDN}|${ORDW})`;
const FLW = String.raw`(?:FLOOR|FLR\.?|FL\.?)(?![A-Z])`;

const RE_ORD = new RegExp(String.raw`\b(${ORD}(?:\s*(?:&|AND|/|,)\s*${ORD})*)\s*(${FLW})`, "g");
const RE_NAMED = new RegExp(String.raw`\b(GROUND|MAIN|UPPER|LOWER|TOP|GARDEN|STREET|ENTRY|ENTRANCE)\s+(FLOOR|FLR\.?|FL\.?|LEVEL|LVL\.?)(?![A-Z])`, "g");
const RE_NAMED_LVL = /\b(BASEMENT|CELLAR|PARKING|GARAGE|PODIUM|MEZZANINE|ROOF|PLAZA|CONCOURSE|LOBBY)\s+(LEVEL|LVL\.?)(?![A-Z])/g;
const RE_NUM = /\b(LEVEL|LVL\.?|FLOOR|FLR\.?)\s*(?:#|NO\.?)?\s*-?\s*(\d{1,3}|[BPM]\d{1,2}|[A-Z])(?![A-Z0-9'"%])/g;
const RE_CODE = /^\s*L\s*-?\s*(\d{1,2})(?:\s+(?:FLOOR\s+)?PLANS?)?\s*$/;
const RE_WORD = /\b(SUB-?BASEMENT|BASEMENT|CELLAR|ATTIC|ROOF|MEZZANINE|PENTHOUSE|CRAWL\s?SPACE)(?![A-Z])/g;
const RE_UNIT = /\b(UNIT|APT\.?|APARTMENT|SUITE|STE\.?)\s*#?\s*(\d{1,4}[A-Z]?|[A-Z]\d{0,3})(?![A-Z0-9'"])/g;
const RE_SITE = /\bSITE\s+PLANS?\b/g;

/** Words right after a floor phrase that make it a thing on that floor, or an elevation mark. */
const REJECT_AFTER =
  /^(?:ELEV|EL\b|EL\.|LINE|LVL\b|HEIGHT|HT\b|DRAINS?\b|BOX(?:ES)?\b|OUTLETS?\b|SINKS?\b|JOISTS?\b|ACCESS|HATCH|VENTS?\b|VENTILATION|STAIRS?\b|DOORS?\b|FANS?\b|INSULATION|MOUNTED|PENETRATIONS?|TRUSS|SHEATHING|OVERHANG|SLOPE|PITCH|EAVES?\b|RAFTERS?\b|ABOVE|BELOW|SPACE|TILE|FINISH|=|\+|\d|TOP\b|DECK|MEMBRANE|SURFACE|LOAD|ASSEMBLY|TYPE\b|MATERIAL|COVERING|EQUIPMENT|MOUNT\b|DUCT|LADDER|SCUTTLE|WALKWAY|HR\b|HOUR|%|DB\b|LUX\b|FC\b|DIAGRAM|SENSOR|SWITCH|METER|CONTROL|GAUGE|INDICATOR|OF\b)/;
/** Words just before it that do the same ("T.O. 2ND FLOOR", "SOUND LEVEL 2", "FIN. FL"). */
const REJECT_BEFORE =
  /(?:\bT\.?\s?O\.?|\bTOP\s+OF|\bFIN\.?|\bFINISH(?:ED)?|\bF\.F\.?|\bBOTTOM\s+OF|\bB\.O\.?|\bSOUND|\bLIGHT(?:ING)?|\bWATER|\bNOISE|\bSECURITY|\bACCESS|\bPOWER|\bSIGNAL|\bSERVICE|\bBATTERY|\bGRADE|\bLUX|\bPRIORITY|\bALARM|\bTHREAT|\bUSER|\bTRIM|\bOIL|\bFUEL|\bTANK|\bAUDIO|\bVOLUME|\bINPUT|\bOUTPUT|\bMIC|\bRAISED|\bEXISTING\s+ROOF|\bNEW\s+ROOF|\bMETAL|\bFLAT|\bPITCHED|\bSHINGLE|\bGREEN)\s*[.:-]?\s*$/;
/** Words that make a line a sentence or a pointer rather than a name ("STAIR DOWN TO BASEMENT", "SEE 2ND FLOOR"). */
const CONNECTORS = /\b(?:SEE|REFER|PER|PROVIDE|VERIFY|INSTALL|INSTALLED|SHALL|CONTRACTOR|UP|DN|DOWN|TO|FROM|OPEN|ABOVE|BELOW|BETWEEN|THRU|THROUGH|VIA|ROUTE|RUN|FEED|FEEDS|SERVING|SERVES|LOCATED|ON|AT|IN|BY|WITH|FOR|INTO|ONTO|UNDER|OVER)\b/;
/** Words a sheet title carries besides the floor ("FIRST FLOOR ELECTRICAL POWER PLAN"). */
const FILLER = new Set(
  "PLAN PLANS FLOOR LEVEL ELECTRICAL POWER LIGHTING LOW VOLTAGE LV SECURITY AV AUDIO VIDEO DATA TELECOM COMM COMMUNICATIONS TECHNOLOGY FIRE ALARM MECHANICAL HVAC PLUMBING ARCHITECTURAL STRUCTURAL FRAMING REFLECTED CEILING RCP DEMOLITION DEMO NEW EXISTING PROPOSED LAYOUT DEVICE DEVICES SYSTEMS SYSTEM PARTIAL ENLARGED OVERALL FURNITURE FINISH FINISHES DIMENSION DIMENSIONED SHEET AND & - – — : / NORTH SOUTH EAST WEST AREA PART WING OPTION SMART HOME AUTOMATION NETWORK WIFI SPEAKER SPEAKERS LED LEDS SITE KEY THE"
    .split(/\s+/),
);

const toUpper = (s: string) => s.toUpperCase().replace(/[‘’`´]/g, "'").replace(/\s+/g, " ");

/** "1ST." → "1st", "FL." → "Fl", "3B" stays, "&" stays. */
function titleWord(w: string): string {
  const bare = w.replace(/\.+$/, "");
  if (!bare) return "";
  const ord = /^(\d+)(ST|ND|RD|TH)$/.exec(bare);
  if (ord) return ord[1] + ord[2].toLowerCase();
  if (/\d/.test(bare)) return bare.toUpperCase();
  if (!/[A-Z]/i.test(bare)) return bare;
  return bare
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join("-");
}

/** Title Case a printed phrase, keeping its wording: "1ST. FL" → "1st Fl", "LOWER LEVEL" → "Lower Level". */
export function titleCaseName(s: string): string {
  return s
    .trim()
    .replace(/(\d)\s+(ST|ND|RD|TH)\b/gi, "$1$2")
    .replace(/\s*([&/,])\s*/g, (_, c) => (c === "," ? ", " : ` ${c} `))
    .split(/\s+/)
    .map(titleWord)
    .filter(Boolean)
    .join(" ");
}

function ordinalNumber(tok: string): number | null {
  const n = /^(\d{1,2})/.exec(tok);
  if (n) return Number(n[1]);
  const i = ORD_WORDS.indexOf(tok.replace(/\.$/, ""));
  return i >= 0 ? i + 1 : null;
}

function rejected(u: string, start: number, end: number): boolean {
  const after = u.slice(end).replace(/^[\s.,:;-]+/, "");
  if (REJECT_AFTER.test(after)) return true;
  if (REJECT_BEFORE.test(u.slice(Math.max(0, start - 24), start))) return true;
  return false;
}

/** Every floor phrase in a piece of text (upper-cased), in reading order. Overlapping matches keep the first. */
function hits(text: string, wholeLine = false): Hit[] {
  const u = toUpper(text);
  const out: Hit[] = [];
  const push = (h: Hit) => {
    if (out.some((o) => h.start < o.end && o.start < h.end)) return;
    out.push(h);
  };
  for (const m of u.matchAll(RE_ORD)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (rejected(u, start, end)) continue;
    const ords = m[1].split(/\s*(?:&|AND|\/|,)\s*/).map((o) => ordinalNumber(o.replace(/\s/g, "")));
    push({ name: titleCaseName(m[0]), key: `f${ords.join("+")}`, kind: "ordinal", start, end });
  }
  for (const re of [RE_NAMED, RE_NAMED_LVL]) {
    for (const m of u.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (rejected(u, start, end)) continue;
      const w = m[1];
      const key = w === "GROUND" ? "g" : w === "MAIN" ? "main" : `${w.toLowerCase()}`;
      push({ name: titleCaseName(m[0]), key, kind: "named", start, end });
    }
  }
  for (const m of u.matchAll(RE_NUM)) {
    const start = m.index!;
    const end = start + m[0].length;
    const isFloor = m[1].startsWith("FL");
    // "FLOOR A" isn't a level; a bare letter only follows LEVEL ("LEVEL B").
    if (isFloor && /^[A-Z]$/.test(m[2])) continue;
    if (/^\d+$/.test(m[2]) && Number(m[2]) > 150) continue;
    if (rejected(u, start, end)) continue;
    push({ name: `${titleWord(m[1])} ${m[2]}`, key: `${isFloor ? "fn" : "l"}${m[2].toLowerCase()}`, kind: "number", start, end });
  }
  if (wholeLine) {
    const m = RE_CODE.exec(u);
    if (m) push({ name: `Level ${Number(m[1])}`, key: `l${Number(m[1])}`, kind: "code", start: 0, end: u.length });
  }
  for (const m of u.matchAll(RE_UNIT)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (rejected(u, start, end)) continue;
    push({ name: `${titleWord(m[1])} ${m[2]}`, key: `unit:${m[2].toLowerCase()}`, kind: "unit", start, end });
  }
  for (const m of u.matchAll(RE_WORD)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (rejected(u, start, end)) continue;
    const word = m[1].replace(/\s/g, "");
    const name = word === "CRAWLSPACE" ? "Crawl Space" : titleCaseName(m[1]);
    push({ name, key: word.toLowerCase().replace(/-/g, ""), kind: "word", start, end });
  }
  for (const m of u.matchAll(RE_SITE)) push({ name: "Site Plan", key: "site", kind: "site", start: m.index!, end: m.index! + m[0].length });
  return out.sort((a, b) => a.start - b.start);
}

const STRENGTH: Record<Kind, number> = { ordinal: 3, named: 3, number: 3, code: 3, unit: 2, word: 1, site: 1 };

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
const hasPlan = (u: string) => /\bPLANS?\b/.test(u);
/** Nothing but title words left once the floor phrase is taken out ("FIRST FLOOR POWER PLAN", "ATTIC"). */
function standalone(u: string, h: Hit): boolean {
  const rest = (u.slice(0, h.start) + " " + u.slice(h.end)).replace(/[()[\]"',.:;]/g, " ");
  return tokens(rest).every((w) => FILLER.has(w) || (w.length <= 1 && /^[A-Z0-9]$/.test(w)));
}

/** Floor name from plain text (no positions): titles ("… PLAN") first, then anything not inside a note. */
function fromText(text: string): string | null {
  const u = toUpper(text);
  const all = hits(u, tokens(u).length <= 4);
  let best: { h: Hit; score: number } | null = null;
  for (const h of all) {
    const after = tokens(u.slice(h.end)).slice(0, 4).join(" ");
    const plan = h.kind === "site" || /^(?:[A-Z&/-]+\s+){0,3}PLANS?\b/.test(after);
    // "STAIR DOWN TO BASEMENT" is a pointer, not a name; "… TO BASEMENT FIRST FLOOR PLAN" still has its title.
    const pointer = CONNECTORS.test(tokens(u.slice(0, h.start)).slice(-3).join(" "));
    if (pointer && !plan) continue;
    if ((h.kind === "unit" || h.kind === "site") && !plan && tokens(u).length > 4) continue;
    const score = STRENGTH[h.kind] + (plan ? 3 : 0) - (pointer ? 2 : 0);
    if (!best || score > best.score) best = { h, score };
  }
  return best?.h.name ?? null;
}

interface Line {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Type size (height of a horizontal line, width of a vertical one). */
  size: number;
  vertical: boolean;
}

/** Group horizontal runs into lines; vertical runs (title strips turned 90°) stay as they are. */
function linesFrom(items: FloorTextItem[]): Line[] {
  const vertical: Line[] = [];
  const horiz: FloorTextItem[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    if (it.str.trim().length >= 2 && it.h > it.w * 1.5) vertical.push({ ...it, size: it.w, vertical: true });
    else horiz.push(it);
  }
  const sorted = [...horiz].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: (Line & { parts: FloorTextItem[] })[] = [];
  const cy = (r: { y: number; h: number }) => r.y + r.h / 2;
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(cy(l) - cy(it)) < Math.min(l.h, it.h) * 0.5 && Math.abs(l.h - it.h) < Math.max(l.h, it.h) * 0.35 && it.x - (l.x + l.w) < it.h * 2.5 && it.x + it.w > l.x - it.h * 2.5);
    if (line) {
      line.parts.push(it);
      const x0 = Math.min(line.x, it.x);
      const y0 = Math.min(line.y, it.y);
      line.w = Math.max(line.x + line.w, it.x + it.w) - x0;
      line.h = Math.max(line.y + line.h, it.y + it.h) - y0;
      line.x = x0;
      line.y = y0;
    } else lines.push({ str: "", x: it.x, y: it.y, w: it.w, h: it.h, size: it.h, vertical: false, parts: [it] });
  }
  const out: Line[] = lines.map((l) => ({
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    size: Math.max(...l.parts.map((p) => p.h)),
    vertical: false,
    str: l.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str.trim())
      .join(" ")
      .replace(/\s+/g, " "),
  }));
  return [...out, ...vertical];
}

/** Where a title block sits: the bottom-right 30% (or a vertical strip down the right edge). */
function region(l: Line): number {
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  if (cx >= 0.7 && cy >= 0.7) return 3;
  if (l.vertical && cx >= 0.8) return 3;
  if (cx >= 0.82 || cy >= 0.86) return 1.5;
  return 0;
}

export interface FloorNameMatch {
  name: string;
  key: string;
  /** The printed line it came from. */
  line: string;
  score: number;
}

/** The best floor-name candidate with its line and score (for tests and debugging), or null. */
export function findFloorName(input: FloorTextItem[] | string): FloorNameMatch | null {
  if (typeof input === "string") {
    const name = fromText(input);
    return name ? { name, key: floorKey(name), line: input, score: 0 } : null;
  }
  const lines = linesFrom(input).filter((l) => l.str.length <= 80);
  if (!lines.length) return null;
  const maxSize = Math.max(...lines.map((l) => l.size)) || 1;
  let best: FloorNameMatch | null = null;
  for (const l of lines) {
    const u = toUpper(l.str);
    const words = tokens(u);
    const plan = hasPlan(u);
    if (words.length > 10 && !plan) continue;
    if (CONNECTORS.test(u)) continue;
    const reg = region(l);
    const rel = l.size / maxSize;
    for (const h of hits(u, true)) {
      const alone = standalone(u, h);
      const strength = STRENGTH[h.kind];
      if (strength < 3 && !alone && !plan) continue;
      if (!alone && !plan && !reg && rel < 0.6) continue;
      if (h.kind === "word" && !reg && rel < 0.6 && !plan) continue;
      const score = strength + (alone ? 3 : 0) + (plan ? 2 : 0) + reg + 3 * rel;
      if (!best || score > best.score) best = { name: h.name, key: h.key, line: l.str, score };
    }
  }
  return best;
}

/**
 * The floor a sheet shows, as a friendly name in the plan's own words: "1st Fl", "First Floor", "Level 2", "Basement",
 * "Unit 3B". Positioned text (PDF text layer or OCR) uses the title block first, then large type; plain text uses
 * titles ("… PLAN") first. Null when nothing qualifies.
 */
export function parseFloorName(input: FloorTextItem[] | string): string | null {
  return findFloorName(input)?.name ?? null;
}

/** A key that matches the same floor however it is written: "FIRST FLOOR" = "1st Fl" = "1ST FLR" → "f1". */
export function floorKey(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "";
  const h = hits(s, tokens(s).length <= 4)[0];
  return h?.key ?? s.toLowerCase().replace(/\s+/g, " ");
}

/** True for a name the app made up ("Sheet 3", "Page 2", a photo's file name), so a name read from the plan may replace it. */
export function isDefaultSheetName(name: string | null | undefined, fileBase?: string | null): boolean {
  const s = (name ?? "").trim();
  if (!s) return true;
  if (/^(?:sheet|page|floor|plan|untitled)\s*#?\s*\d*$/i.test(s)) return true;
  if (fileBase && s === fileBase.trim()) return true;
  return /^(?:img|image|scan|photo|dsc|dscn|pxl|screenshot|whatsapp image)[\s_-]?\d/i.test(s);
}

/** The name to propose for a sheet: its floor if found, else the sheet title (Title Case), else the sheet number, else the current name. */
export function proposeSheetName(parts: { floor?: string | null; title?: string | null; number?: string | null }, current: string): string {
  return parts.floor?.trim() || (parts.title?.trim() ? titleCaseName(parts.title) : "") || parts.number?.trim() || current;
}
