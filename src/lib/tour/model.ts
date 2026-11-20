// The guided tours and one-time tips, as plain data and pure functions (docs/help-and-tours.md). No browser, no React:
// the store (./store.ts) keeps the state, the components in src/components/tour/ draw it, tests/tour.test.ts checks it.
import type { TourAnchorId } from "./anchors";

// ---------------- tours ----------------

export type TourId = "first-job" | "crew-day" | "office-money";
export const TOUR_IDS: readonly TourId[] = ["first-job", "crew-day", "office-money"];
export const isTourId = (v: unknown): v is TourId => typeof v === "string" && (TOUR_IDS as readonly string[]).includes(v);

/** Where a step happens. The engine goes there when the step opens (and the person isn't there already). */
export type TourAt =
  | { page: "jobs" }
  | { page: "tasks" }
  | { page: "settings"; hash?: string }
  /** A tab of the tour's job. `legacy` is where the same thing lives while this build doesn't have `tab` yet. */
  | { page: "job"; tab: string; params?: Record<string, string>; legacy?: { tab: string; params?: Record<string, string> } };

export interface TourStep {
  id: string;
  /** English text (the i18n key, wrapped in msg() where it's defined). */
  title: string;
  body: string;
  anchor?: TourAnchorId;
  /** Used instead of `anchor` on phones (where the element lives somewhere else, e.g. in a menu). */
  phoneAnchor?: TourAnchorId;
  /** Pointed at instead of the anchor while it's on screen (a dialog the step leads to, e.g. the pages screen). */
  whenOpen?: TourAnchorId;
  at?: TourAt;
  /** Office only (prices, quotes, invoices): left out for technicians. */
  office?: boolean;
}

export interface TourDef {
  id: TourId;
  title: string;
  summary: string;
  minutes: number;
  /** Who it's offered to first. Everyone can take any tour they're allowed to see. */
  audience: "office" | "crew";
  steps: TourStep[];
}

/** The steps this person sees: office-only steps are left out for technicians. */
export function visibleSteps(tour: TourDef, office: boolean): TourStep[] {
  return tour.steps.filter((s) => office || !s.office);
}

/** A tour is worth offering when it has at least two steps this person can see. */
export const tourAvailable = (tour: TourDef, office: boolean) => visibleSteps(tour, office).length >= 2;

/** Whether any of the tour's steps happen inside a job (the tour then needs one: the open job or the sample job). */
export const tourNeedsJob = (tour: TourDef) => tour.steps.some((s) => s.at?.page === "job");

/** The anchor to look for on this screen size. */
export const stepAnchor = (step: TourStep, phone: boolean): TourAnchorId | undefined => (phone && step.phoneAnchor) || step.anchor;

/** The tab (and its params) to open for a job step, using the legacy place when this build has no such tab. */
export function resolveJobAt(at: Extract<TourAt, { page: "job" }>, knownTabs: readonly string[]): { tab: string; params: Record<string, string> } {
  if (!knownTabs.includes(at.tab) && at.legacy) return { tab: at.legacy.tab, params: at.legacy.params ?? {} };
  return { tab: at.tab, params: at.params ?? {} };
}

/** The address of a step's place, or null when it has none (or needs a job and there is none). */
export function hrefFor(at: TourAt | undefined, o: { jobId: string | null; knownTabs: readonly string[] }): string | null {
  if (!at) return null;
  if (at.page === "jobs") return "/jobs";
  if (at.page === "tasks") return "/tasks";
  if (at.page === "settings") return `/settings${at.hash ? `#${at.hash}` : ""}`;
  if (!o.jobId) return null;
  const { tab, params } = resolveJobAt(at, o.knownTabs);
  const q = new URLSearchParams({ id: o.jobId, tab, ...params });
  return `/project?${q.toString()}`;
}

/** Whether the person is already where a step happens (only the params the step names are compared). */
export function atLocation(at: TourAt | undefined, loc: { path: string; search: string }, o: { jobId: string | null; knownTabs: readonly string[] }): boolean {
  if (!at) return true;
  const path = loc.path.replace(/\/+$/, "") || "/";
  if (at.page === "jobs") return path === "/jobs";
  if (at.page === "tasks") return path === "/tasks";
  if (at.page === "settings") return path === "/settings";
  if (path !== "/project") return false;
  const q = new URLSearchParams(loc.search);
  if (o.jobId && q.get("id") !== o.jobId) return false;
  const { tab, params } = resolveJobAt(at, o.knownTabs);
  if (q.get("tab") !== tab) return false;
  return Object.entries(params).every(([k, v]) => q.get(k) === v);
}

// ---------------- progress (per device, and per account) ----------------

export type TourStatus = "active" | "done" | "skipped";

export interface TourRecord {
  status: TourStatus;
  /** Index into the visible steps where the person was (for Resume). */
  step: number;
  at: string;
}

export interface TourPrefs {
  v: 1;
  tours: Partial<Record<TourId, TourRecord>>;
  /** One-time tips already shown (id → when). */
  tips: Record<string, string>;
  /** "Don't show tips" (Settings › More › Help & tips). */
  tipsOff: boolean;
  /** The first-run offer was answered (started or "Not now"). */
  offerAnswered: boolean;
  /** The sample job the tours use (made on this device). */
  sampleJobId?: string | null;
}

export const EMPTY_PREFS: TourPrefs = { v: 1, tours: {}, tips: {}, tipsOff: false, offerAnswered: false, sampleJobId: null };

/** Read stored prefs defensively: anything malformed is dropped, never thrown. */
export function parsePrefs(raw: unknown): TourPrefs {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PREFS, tours: {}, tips: {} };
  const r = raw as Record<string, unknown>;
  const tours: TourPrefs["tours"] = {};
  if (r.tours && typeof r.tours === "object") {
    for (const [id, rec] of Object.entries(r.tours as Record<string, unknown>)) {
      if (!isTourId(id) || !rec || typeof rec !== "object") continue;
      const x = rec as Record<string, unknown>;
      if (x.status !== "active" && x.status !== "done" && x.status !== "skipped") continue;
      tours[id] = { status: x.status, step: Number.isInteger(x.step) && (x.step as number) >= 0 ? (x.step as number) : 0, at: typeof x.at === "string" ? x.at : "" };
    }
  }
  const tips: Record<string, string> = {};
  if (r.tips && typeof r.tips === "object") for (const [k, v] of Object.entries(r.tips as Record<string, unknown>)) if (typeof v === "string") tips[k] = v;
  return {
    v: 1,
    tours,
    tips,
    tipsOff: r.tipsOff === true,
    offerAnswered: r.offerAnswered === true,
    sampleJobId: typeof r.sampleJobId === "string" ? r.sampleJobId : null,
  };
}

/** What follows the person to another device (user_metadata.tour): finished tours, tips seen, "Don't show tips". */
export interface AccountTourPrefs {
  done?: TourId[];
  tips?: string[];
  tipsOff?: boolean;
}

export function toAccount(p: TourPrefs): AccountTourPrefs {
  return {
    done: TOUR_IDS.filter((id) => p.tours[id]?.status === "done" || p.tours[id]?.status === "skipped"),
    tips: Object.keys(p.tips).sort(),
    tipsOff: p.tipsOff,
  };
}

/**
 * Combine this device's prefs with the account's. A tour finished (or skipped) anywhere stays finished, a tip seen
 * anywhere isn't shown again, and the account's "Don't show tips" wins when it has one. A tour in progress here stays.
 */
export function mergeAccount(device: TourPrefs, account: unknown): TourPrefs {
  if (!account || typeof account !== "object") return device;
  const a = account as AccountTourPrefs;
  const tours = { ...device.tours };
  for (const id of Array.isArray(a.done) ? a.done : []) {
    if (!isTourId(id) || tours[id]?.status === "active" || tours[id]?.status === "done") continue;
    tours[id] = { status: "done", step: 0, at: tours[id]?.at ?? "" };
  }
  const tips = { ...device.tips };
  for (const id of Array.isArray(a.tips) ? a.tips : []) if (typeof id === "string" && !tips[id]) tips[id] = "account";
  // Somebody who finished or skipped a tour on another device has seen the first-run offer.
  const offerAnswered = device.offerAnswered || (Array.isArray(a.done) && a.done.length > 0);
  return { ...device, tours, tips, tipsOff: typeof a.tipsOff === "boolean" ? a.tipsOff : device.tipsOff, offerAnswered };
}

/** Whether the account copy needs saving (it differs from what this device would give it). */
export function accountDiffers(p: TourPrefs, account: unknown): boolean {
  const a = (account && typeof account === "object" ? account : {}) as AccountTourPrefs;
  const mine = toAccount(p);
  const same = (x: unknown[] | undefined, y: unknown[] | undefined) => JSON.stringify([...(x ?? [])].sort()) === JSON.stringify([...(y ?? [])].sort());
  return !same(mine.done, a.done) || !same(mine.tips, a.tips) || mine.tipsOff !== (a.tipsOff ?? false);
}

// ---------------- running a tour ----------------

/** The tour on screen now (kept per device so a reload carries on where it was). */
export interface ActiveTour {
  id: TourId;
  step: number;
  /** The job its job steps use (the open job, or the sample job). */
  jobId: string | null;
}

export type TourAction =
  | { type: "start"; id: TourId; jobId: string | null; now: string; from?: number }
  | { type: "next"; total: number; now: string }
  | { type: "back"; now: string }
  | { type: "go"; step: number; total: number; now: string }
  /** "Skip tour": stop and don't offer it again. */
  | { type: "skip"; now: string }
  /** Close (Esc, ×): stop for now; Help offers Resume. */
  | { type: "close"; now: string }
  | { type: "reset"; id: TourId };

/** An action without its time (the store adds it). */
export type TourActionInput = TourAction extends infer A ? (A extends TourAction ? Omit<A, "now"> & { now?: string } : never) : never;

export interface TourState {
  prefs: TourPrefs;
  active: ActiveTour | null;
}

/** Every change to a tour's progress goes through here. Pure. */
export function tourReducer(s: TourState, a: TourAction): TourState {
  const rec = (id: TourId, status: TourStatus, step: number, now: string): TourPrefs => ({ ...s.prefs, tours: { ...s.prefs.tours, [id]: { status, step, at: now } } });
  switch (a.type) {
    case "start": {
      const step = Math.max(0, a.from ?? 0);
      return { prefs: { ...rec(a.id, "active", step, a.now), offerAnswered: true }, active: { id: a.id, step, jobId: a.jobId } };
    }
    case "next": {
      if (!s.active) return s;
      const step = s.active.step + 1;
      if (step >= a.total) return { prefs: rec(s.active.id, "done", 0, a.now), active: null };
      return { prefs: rec(s.active.id, "active", step, a.now), active: { ...s.active, step } };
    }
    case "back": {
      if (!s.active || s.active.step === 0) return s;
      const step = s.active.step - 1;
      return { prefs: rec(s.active.id, "active", step, a.now), active: { ...s.active, step } };
    }
    case "go": {
      if (!s.active) return s;
      const step = Math.min(Math.max(0, a.step), Math.max(0, a.total - 1));
      return { prefs: rec(s.active.id, "active", step, a.now), active: { ...s.active, step } };
    }
    case "skip":
      return s.active ? { prefs: rec(s.active.id, "skipped", s.active.step, a.now), active: null } : s;
    case "close":
      // Stays "active" in the record (Help shows Resume) but leaves the screen.
      return s.active ? { prefs: rec(s.active.id, "active", s.active.step, a.now), active: null } : s;
    case "reset": {
      const tours = { ...s.prefs.tours };
      delete tours[a.id];
      return { prefs: { ...s.prefs, tours }, active: s.active?.id === a.id ? null : s.active };
    }
  }
}

/** What Help shows for a tour: Start, Resume (with the step) or Restart. */
export function tourButton(p: TourPrefs, id: TourId, total: number): { kind: "start" | "resume" | "restart"; step: number } {
  const r = p.tours[id];
  if (!r) return { kind: "start", step: 0 };
  if (r.status === "active" && r.step > 0 && r.step < total) return { kind: "resume", step: r.step };
  if (r.status === "active") return { kind: "start", step: 0 };
  return { kind: "restart", step: 0 };
}

/** Offer "Your first job" on the jobs list: office people who haven't answered the offer or taken that tour. */
export function shouldOfferFirstTour(p: TourPrefs, o: { office: boolean; tourActive: boolean }): boolean {
  if (!o.office || o.tourActive || p.offerAnswered) return false;
  return !p.tours["first-job"];
}

// ---------------- the card's position ----------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}

export type CardPlacement =
  /** Phones: a sheet along the bottom (or the top, when the element is in the lower half). */
  | { mode: "sheet"; edge: "bottom" | "top" }
  /** Larger screens: a card beside the element. */
  | { mode: "popover"; side: "top" | "bottom" | "left" | "right"; x: number; y: number }
  /** No element (missing, hidden or off screen): the middle of the screen. */
  | { mode: "center" };

/** Phones are narrower than this (CSS px): the card becomes a sheet. */
export const PHONE_MAX = 640;

/** Whether an element's box is on screen enough to point at. */
export function rectVisible(r: Rect | null, vp: Size): r is Rect {
  if (!r || r.w <= 0 || r.h <= 0) return false;
  return r.x < vp.w && r.y < vp.h && r.x + r.w > 0 && r.y + r.h > 0;
}

/**
 * Where the card goes. Beside the element on the side with the most room (below, above, right, left), kept `margin`
 * inside the screen; a sheet on phones; the middle when there's nothing to point at.
 */
export function placeCard(anchor: Rect | null, card: Size, vp: Size, o: { gap?: number; margin?: number } = {}): CardPlacement {
  const gap = o.gap ?? 12;
  const margin = o.margin ?? 12;
  if (vp.w < PHONE_MAX) {
    if (!rectVisible(anchor, vp)) return { mode: "sheet", edge: "bottom" };
    return { mode: "sheet", edge: anchor.y + anchor.h / 2 > vp.h * 0.55 ? "top" : "bottom" };
  }
  if (!rectVisible(anchor, vp)) return { mode: "center" };
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const room = {
    bottom: vp.h - (anchor.y + anchor.h) - gap - margin,
    top: anchor.y - gap - margin,
    right: vp.w - (anchor.x + anchor.w) - gap - margin,
    left: anchor.x - gap - margin,
  };
  const cx = clamp(anchor.x + anchor.w / 2 - card.w / 2, margin, vp.w - card.w - margin);
  const cy = clamp(anchor.y + anchor.h / 2 - card.h / 2, margin, vp.h - card.h - margin);
  if (room.bottom >= card.h) return { mode: "popover", side: "bottom", x: cx, y: anchor.y + anchor.h + gap };
  if (room.top >= card.h) return { mode: "popover", side: "top", x: cx, y: anchor.y - gap - card.h };
  if (room.right >= card.w) return { mode: "popover", side: "right", x: anchor.x + anchor.w + gap, y: cy };
  if (room.left >= card.w) return { mode: "popover", side: "left", x: anchor.x - gap - card.w, y: cy };
  // A huge element (the plan itself): inside it, near the bottom.
  return { mode: "popover", side: "bottom", x: cx, y: clamp(vp.h - card.h - margin * 2, margin, vp.h - card.h - margin) };
}

/** The highlighted box around an element, padded and kept on screen. */
export function spotlightRect(anchor: Rect, vp: Size, pad = 6): Rect {
  const x = Math.max(2, anchor.x - pad);
  const y = Math.max(2, anchor.y - pad);
  const r = Math.min(vp.w - 2, anchor.x + anchor.w + pad);
  const b = Math.min(vp.h - 2, anchor.y + anchor.h + pad);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, b - y) };
}

// ---------------- one-time tips ----------------

export type TipId = "plan" | "takeoff" | "money" | "tasks" | "photos";
export const TIP_IDS: readonly TipId[] = ["plan", "takeoff", "money", "tasks", "photos"];

/** Pages clients open (quotes, invoices, change orders, plan review, reports). Tips and tours never show there. */
const CLIENT_PREFIXES = ["/q", "/d", "/co", "/p", "/r"];
export function isClientPath(path: string): boolean {
  return CLIENT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The tip for this page, if it has one: a job tab (new tab ids and their older places) or the Tasks page. */
export function tipForLocation(path: string, search: string): TipId | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/tasks") return "tasks";
  if (p !== "/project") return null;
  const q = new URLSearchParams(search);
  const tab = q.get("tab");
  const section = q.get("section");
  if (tab === "plan" && q.get("manage") !== "1") return "plan";
  if (tab === "takeoff" && q.get("view") !== "wiring") return "takeoff";
  if (tab === "money") return "money";
  if (tab === "tasks" || (tab === "field" && section === "tasks")) return "tasks";
  if (tab === "photos" || (tab === "field" && section === "photos")) return "photos";
  return null;
}

/** Show a tip once, never with tips turned off, never during a tour, never on a client page, office tips to the office. */
export function shouldShowTip(tip: TipId | null, p: TourPrefs, o: { tourActive: boolean; path: string; office: boolean }): tip is TipId {
  if (!tip || p.tipsOff || o.tourActive || isClientPath(o.path)) return false;
  if (tip === "money" && !o.office) return false;
  return !p.tips[tip];
}
