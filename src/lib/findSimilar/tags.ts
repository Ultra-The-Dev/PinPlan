// Find similar → Read tags (docs/find-similar.md): door and window tags ("D1", "D-12", "W3", "WD2") in a sheet's PDF
// text layer, one suggestion per tag on the plan. Pure; the text comes from PDF.js (importPlans.pageTextItems).
import { wordsOf, type TextItem } from "../sheetIndex";

/** Default tag prefixes for a device type, from its name: doors D / DR, windows W / WD / WIN, else none. */
export function defaultTagPrefixes(typeName: string): string {
  if (/\bwindows?\b/i.test(typeName)) return "W, WD, WIN";
  if (/\bdoors?\b/i.test(typeName)) return "D, DR";
  return "";
}

/** "D, DR" → ["DR", "D"] (upper case, letters / digits only, longest first so DR wins over D). */
export function parsePrefixes(input: string): string[] {
  const out = input
    .split(/[\s,;]+/)
    .map((p) => p.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
  return [...new Set(out)].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * A whole-word tag pattern: one of the prefixes, an optional "-" or ".", one to three digits, an optional letter
 * (D1, D-12, D.3, W3A, WD2). Null without prefixes (bare numbers would also match room numbers and dimensions).
 */
export function tagPattern(prefixes: string[]): RegExp | null {
  if (!prefixes.length) return null;
  const alt = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`^(?:${alt})[-.]?\\d{1,3}[A-Z]?$`);
}

/** Punctuation around a word that isn't part of the tag ("(D1)", "D1,", "W3:"). */
const cleanWord = (s: string) => s.toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");

export interface FoundTag {
  /** The tag as printed, cleaned (e.g. "D-12"). */
  tag: string;
  /** Centre of the tag, sheet-relative 0–1. */
  x: number;
  y: number;
}

/**
 * Tags that are rows of a schedule (a door or window table), not positions on the plan: four or more tags stacked in
 * one column (centres within half a percent across) with no gap of more than 3% of the page between neighbours.
 */
export function scheduleTags(tags: FoundTag[]): Set<FoundTag> {
  const out = new Set<FoundTag>();
  const sorted = [...tags].sort((a, b) => a.x - b.x);
  const used = new Set<FoundTag>();
  for (const t of sorted) {
    if (used.has(t)) continue;
    const col = sorted.filter((u) => Math.abs(u.x - t.x) <= 0.005).sort((a, b) => a.y - b.y);
    col.forEach((u) => used.add(u));
    // Split the column where the gap is large; keep runs of 4+.
    let run: FoundTag[] = [];
    const flush = () => {
      if (run.length >= 4) run.forEach((u) => out.add(u));
      run = [];
    };
    col.forEach((u, i) => {
      if (i && u.y - col[i - 1].y > 0.03) flush();
      run.push(u);
    });
    flush();
  }
  return out;
}

/**
 * Door / window tags on a page's text, sheet-relative. Skips schedules (tables of tags), and a tag printed twice on
 * the same spot (some PDFs draw text twice for boldness) counts once.
 */
export function findTags(items: TextItem[], prefixes: string[], opts: { skipSchedules?: boolean } = {}): FoundTag[] {
  const re = tagPattern(prefixes);
  if (!re) return [];
  const found: FoundTag[] = [];
  for (const w of wordsOf(items)) {
    const tag = cleanWord(w.str);
    if (!re.test(tag)) continue;
    const x = w.x + w.w / 2;
    const y = w.y + w.h / 2;
    if (found.some((f) => f.tag === tag && Math.abs(f.x - x) < 0.004 && Math.abs(f.y - y) < 0.004)) continue;
    found.push({ tag, x, y });
  }
  if (!(opts.skipSchedules ?? true)) return found;
  const sched = scheduleTags(found);
  return found.filter((f) => !sched.has(f));
}
