// Photo report layout: group the chosen photos into sections (by room or by day), pair before/after photos side by side,
// and lay the result out on pages. Pure, shared by the PDF, the share-link snapshot and the client page.
// Same rules as ios/PinPlanCore/Sources/PinPlanCore/PhotoReportLayout.swift.
import { localDay } from "./fieldDocs";
import type { Photo, PhotoComment } from "./types";

export type ReportGroupBy = "none" | "room" | "day";

/** A run of report cells under one heading. A cell is one photo, or a [before, after] pair shown side by side. */
export interface ReportSection<T = Photo> {
  key: string;
  title: string;
  cells: T[][];
}

export const NO_ROOM = "Other photos";

const dayTitleDefault = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

/**
 * Chosen photos (oldest first) as report sections.
 * - groupBy "none": one untitled section (the old report). "room": one per room, A–Z, photos without a room last.
 *   "day": one per local day, oldest first.
 * - pairs: an "after" whose "before" is also chosen becomes one [before, after] cell, placed where the before is
 *   (each photo is used in at most one pair; extra afters of the same before stay single).
 */
export function reportSections(photos: Photo[], opts: { groupBy: ReportGroupBy; pairs: boolean; dayTitle?: (day: string) => string }): ReportSection[] {
  const ordered = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id));
  const ids = new Set(ordered.map((p) => p.id));
  const afterOf = new Map<string, Photo>();
  if (opts.pairs) {
    const used = new Set<string>();
    for (const p of ordered) {
      const b = p.beforeId;
      if (!b || b === p.id || !ids.has(b) || used.has(b) || used.has(p.id)) continue;
      used.add(b).add(p.id);
      afterOf.set(b, p);
    }
  }
  const paired = new Set([...afterOf.values()].map((p) => p.id));
  const cells: Photo[][] = [];
  for (const p of ordered) {
    if (paired.has(p.id)) continue;
    const a = afterOf.get(p.id);
    cells.push(a ? [p, a] : [p]);
  }
  if (opts.groupBy === "none") return cells.length ? [{ key: "", title: "", cells }] : [];

  const sections = new Map<string, ReportSection>();
  for (const c of cells) {
    const first = c[0];
    let key: string, title: string;
    if (opts.groupBy === "day") {
      key = localDay(first.takenAt);
      title = (opts.dayTitle ?? dayTitleDefault)(key);
    } else {
      const room = (c.map((p) => p.room?.trim()).find(Boolean) ?? "").replace(/\s+/g, " ");
      key = room.toLowerCase();
      title = room || NO_ROOM;
    }
    const s = sections.get(key);
    if (s) s.cells.push(c);
    else sections.set(key, { key, title, cells: [c] });
  }
  const list = [...sections.values()];
  if (opts.groupBy === "day") return list.sort((a, b) => a.key.localeCompare(b.key));
  return list.sort((a, b) => (a.key === "" ? 1 : 0) - (b.key === "" ? 1 : 0) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
}

export const mapSections = <T, U>(sections: ReportSection<T>[], f: (x: T) => U): ReportSection<U>[] => sections.map((s) => ({ ...s, cells: s.cells.map((c) => c.map(f)) }));

/** One printed row: a section heading, or up to two cells side by side (`pair` = one before/after cell filling the row). */
export type ReportRow<T> = { kind: "heading"; title: string } | { kind: "photos"; items: T[]; pair: boolean };

/**
 * Sections as PDF pages. 1 per page → one photo per page; 2 → two side by side; 4 → two rows of two.
 * A before/after pair always fills a row of its own. Headings don't use a photo slot but never end a page.
 * With no headings and no pairs this is exactly the old fixed layout.
 */
export function reportPages<T>(sections: ReportSection<T>[], perPage: 1 | 2 | 4): ReportRow<T>[][] {
  const cols = perPage === 1 ? 1 : 2;
  const rowsPerPage = perPage === 4 ? 2 : 1;
  const pages: ReportRow<T>[][] = [];
  let page: ReportRow<T>[] = [];
  let used = 0;
  const push = (r: ReportRow<T>) => {
    if (used >= rowsPerPage) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(r);
    if (r.kind === "photos") used++;
  };
  for (const s of sections) {
    if (s.title) push({ kind: "heading", title: s.title });
    let row: T[] = [];
    for (const c of s.cells) {
      if (c.length > 1) {
        if (row.length) push({ kind: "photos", items: row, pair: false });
        row = [];
        push({ kind: "photos", items: c.slice(0, 2), pair: true });
        continue;
      }
      row.push(c[0]);
      if (row.length >= cols) {
        push({ kind: "photos", items: row, pair: false });
        row = [];
      }
    }
    if (row.length) push({ kind: "photos", items: row, pair: false });
  }
  if (page.length) pages.push(page);
  return pages;
}

export interface ReportComment {
  author: string;
  text: string;
  at: string;
}

/** A photo's live comments, oldest first, for printing. */
export function reportComments(comments: PhotoComment[], photoId: string): ReportComment[] {
  return comments
    .filter((c) => c.photoId === photoId && !c.deleted && c.text.trim())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({ author: c.author?.trim() ?? "", text: c.text.trim(), at: c.createdAt }));
}

/** Snapshot form of the sections: photo indexes into the snapshot's flat `photos` list. */
export interface SnapshotSection {
  title: string;
  cells: number[][];
}

export function snapshotSections(sections: ReportSection<Photo>[], indexOf: Map<string, number>): SnapshotSection[] {
  return sections.map((s) => ({
    title: s.title,
    cells: s.cells.map((c) => c.map((p) => indexOf.get(p.id) ?? -1).filter((i) => i >= 0)).filter((c) => c.length),
  }));
}

/**
 * The sections a client-link page should show. Old snapshots (no `sections`) and anything malformed fall back to one
 * untitled section with every photo on its own; photos the sections leave out are added at the end.
 */
export function readSnapshotSections(photoCount: number, raw: unknown): SnapshotSection[] {
  const all = (): SnapshotSection[] => (photoCount ? [{ title: "", cells: Array.from({ length: photoCount }, (_, i) => [i]) }] : []);
  if (!Array.isArray(raw)) return all();
  const seen = new Set<number>();
  const out: SnapshotSection[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || !Array.isArray((s as SnapshotSection).cells)) continue;
    const cells: number[][] = [];
    for (const c of (s as SnapshotSection).cells) {
      if (!Array.isArray(c)) continue;
      const ok = c.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < photoCount && !seen.has(i)).slice(0, 2);
      ok.forEach((i) => seen.add(i));
      if (ok.length) cells.push(ok);
    }
    const title = typeof (s as SnapshotSection).title === "string" ? (s as SnapshotSection).title : "";
    if (cells.length) out.push({ title, cells });
  }
  const rest = Array.from({ length: photoCount }, (_, i) => i).filter((i) => !seen.has(i));
  if (rest.length) out.push({ title: out.some((s) => s.title) ? NO_ROOM : "", cells: rest.map((i) => [i]) });
  return out;
}
