// Guided tours and one-time tips (docs/help-and-tours.md): the pure step model, progress, placement and tips.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { anchorSelector, isTourAnchor, TOUR_ANCHORS } from "@/lib/tour/anchors";
import {
  accountDiffers,
  atLocation,
  EMPTY_PREFS,
  hrefFor,
  isClientPath,
  mergeAccount,
  parsePrefs,
  placeCard,
  rectVisible,
  resolveJobAt,
  shouldOfferFirstTour,
  shouldShowTip,
  spotlightRect,
  stepAnchor,
  tipForLocation,
  TIP_IDS,
  toAccount,
  tourAvailable,
  tourButton,
  tourNeedsJob,
  tourReducer,
  visibleSteps,
  type TourPrefs,
  type TourState,
} from "@/lib/tour/model";
import { TIPS, TOUR_LIST, TOURS } from "@/lib/tour/tours";
import { GUIDES, searchGuides, SHOT_SIZE } from "@/lib/help/guides";

const root = path.resolve(__dirname, "..");
const now = "2026-11-20T10:00:00.000Z";
const fresh = (): TourState => ({ prefs: { ...EMPTY_PREFS, tours: {}, tips: {} }, active: null });

describe("tour definitions", () => {
  it("every step points at a known anchor and has words", () => {
    for (const tour of TOUR_LIST) {
      expect(tour.steps.length, tour.id).toBeGreaterThanOrEqual(4);
      const ids = new Set<string>();
      for (const s of tour.steps) {
        expect(ids.has(s.id), `${tour.id}:${s.id} repeated`).toBe(false);
        ids.add(s.id);
        expect(s.title.trim(), s.id).not.toBe("");
        expect(s.body.trim(), s.id).not.toBe("");
        // A short card: one or two sentences.
        expect(s.body.length, `${tour.id}:${s.id}`).toBeLessThanOrEqual(170);
        for (const a of [s.anchor, s.phoneAnchor, s.whenOpen]) if (a) expect(isTourAnchor(a), `${tour.id}:${s.id} → ${a}`).toBe(true);
      }
    }
  });

  it("is written for the new job tabs: Tasks and Photos are their own tabs, the upload step shows the pages screen", () => {
    const crew = TOURS["crew-day"].steps;
    const tasks = crew.find((s) => s.id === "tasks")!;
    const photos = crew.find((s) => s.id === "photos")!;
    expect(tasks.at).toEqual({ page: "job", tab: "tasks" });
    expect(tasks.anchor).toBe("job-tab-tasks");
    expect(photos.at).toEqual({ page: "job", tab: "photos" });
    expect(photos.anchor).toBe("photos-take");
    const newTabs = ["overview", "plan", "takeoff", "tasks", "photos", "money", "field"];
    expect(hrefFor(tasks.at, { jobId: "j1", knownTabs: newTabs })).toBe("/project?id=j1&tab=tasks");
    // No step still sends people to the old Field → Tasks / Photos sections.
    for (const tour of TOUR_LIST) for (const s of tour.steps) if (s.at?.page === "job") expect(s.at.params?.section ?? "", `${tour.id}:${s.id}`).not.toMatch(/^(tasks|photos)$/);
    const upload = TOURS["first-job"].steps.find((s) => s.id === "upload")!;
    expect(upload.anchor).toBe("plan-sheets");
    expect(upload.whenOpen).toBe("plan-pages");
    expect(upload.body).toMatch(/Choose and name pages/);
  });

  it("an older build without the Tasks tab still finds the place through `legacy`", () => {
    const at = { page: "job" as const, tab: "tasks", legacy: { tab: "field", params: { section: "tasks" } } };
    expect(hrefFor(at, { jobId: "j1", knownTabs: ["overview", "plan", "field"] })).toBe("/project?id=j1&tab=field&section=tasks");
  });

  it("technicians never get money steps; a tour with fewer than two steps isn't offered", () => {
    for (const tour of TOUR_LIST) for (const s of visibleSteps(tour, false)) expect(s.office, `${tour.id}:${s.id}`).toBeFalsy();
    expect(tourAvailable(TOURS["office-money"], false)).toBe(false);
    expect(tourAvailable(TOURS["crew-day"], false)).toBe(true);
    expect(visibleSteps(TOURS["first-job"], false).some((s) => s.at?.page === "job" && s.at.tab === "money")).toBe(false);
  });

  it("knows which tours need a job", () => {
    expect(tourNeedsJob(TOURS["first-job"])).toBe(true);
    expect(tourNeedsJob({ ...TOURS["first-job"], steps: [{ id: "a", title: "A", body: "B", at: { page: "jobs" } }] })).toBe(false);
  });

  it("picks the phone anchor on phones", () => {
    const place = TOURS["first-job"].steps.find((s) => s.id === "place")!;
    expect(stepAnchor(place, false)).toBe("plan-palette");
    expect(stepAnchor(place, true)).toBe("plan-devices-button");
    expect(stepAnchor({ id: "x", title: "", body: "", anchor: "jobs-new" }, true)).toBe("jobs-new");
  });
});

describe("anchors", () => {
  it("selectors use data-tour, plus the fallback when there is one", () => {
    expect(anchorSelector("jobs-new")).toBe('[data-tour="jobs-new"]');
    expect(anchorSelector("plan-find-similar")).toBe('[data-tour="plan-find-similar"], [data-testid="find-similar-button"]');
  });

  it("every data-tour id written in src is a registered anchor", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk(path.join(root, "src"));
    const used = new Set<string>();
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/tourAnchor\("([a-z0-9-]+)"\)|data-tour="([a-z0-9-]+)"/g)) used.add(m[1] ?? m[2]);
    }
    for (const id of used) expect(isTourAnchor(id), id).toBe(true);
    expect(used.size).toBeGreaterThan(5);
    expect(Object.keys(TOUR_ANCHORS).length).toBeGreaterThan(used.size);
  });
});

describe("where a step happens", () => {
  const o = { jobId: "j1", knownTabs: ["overview", "plan", "takeoff", "money", "field"] };
  it("builds addresses", () => {
    expect(hrefFor(undefined, o)).toBeNull();
    expect(hrefFor({ page: "jobs" }, o)).toBe("/jobs");
    expect(hrefFor({ page: "tasks" }, o)).toBe("/tasks");
    expect(hrefFor({ page: "settings", hash: "payments" }, o)).toBe("/settings#payments");
    expect(hrefFor({ page: "job", tab: "money", params: { step: "quote" } }, o)).toBe("/project?id=j1&tab=money&step=quote");
    expect(hrefFor({ page: "job", tab: "plan" }, { ...o, jobId: null })).toBeNull();
    expect(resolveJobAt({ page: "job", tab: "photos" }, o.knownTabs)).toEqual({ tab: "photos", params: {} });
  });

  it("knows when the person is already there", () => {
    expect(atLocation({ page: "jobs" }, { path: "/jobs/", search: "" }, o)).toBe(true);
    expect(atLocation({ page: "job", tab: "money", params: { step: "quote" } }, { path: "/project", search: "id=j1&tab=money&step=quote&doc=x" }, o)).toBe(true);
    expect(atLocation({ page: "job", tab: "money", params: { step: "quote" } }, { path: "/project", search: "id=j1&tab=money&step=pricing" }, o)).toBe(false);
    expect(atLocation({ page: "job", tab: "plan" }, { path: "/project", search: "id=other&tab=plan" }, o)).toBe(false);
    expect(atLocation(undefined, { path: "/anything", search: "" }, o)).toBe(true);
  });
});

describe("progress", () => {
  it("start → next → back → finish", () => {
    let s = tourReducer(fresh(), { type: "start", id: "first-job", jobId: "j1", now });
    expect(s.active).toEqual({ id: "first-job", step: 0, jobId: "j1" });
    expect(s.prefs.offerAnswered).toBe(true);
    s = tourReducer(s, { type: "next", total: 3, now });
    s = tourReducer(s, { type: "next", total: 3, now });
    expect(s.active?.step).toBe(2);
    s = tourReducer(s, { type: "back", now });
    expect(s.active?.step).toBe(1);
    expect(s.prefs.tours["first-job"]).toMatchObject({ status: "active", step: 1 });
    s = tourReducer(s, { type: "next", total: 3, now });
    s = tourReducer(s, { type: "next", total: 3, now });
    expect(s.active).toBeNull();
    expect(s.prefs.tours["first-job"]?.status).toBe("done");
    expect(tourButton(s.prefs, "first-job", 3).kind).toBe("restart");
  });

  it("back on the first step stays; go clamps", () => {
    let s = tourReducer(fresh(), { type: "start", id: "crew-day", jobId: null, now });
    expect(tourReducer(s, { type: "back", now })).toBe(s);
    s = tourReducer(s, { type: "go", step: 99, total: 4, now });
    expect(s.active?.step).toBe(3);
    s = tourReducer(s, { type: "go", step: -3, total: 4, now });
    expect(s.active?.step).toBe(0);
  });

  it("close keeps it resumable; skip doesn't", () => {
    let s = tourReducer(fresh(), { type: "start", id: "office-money", jobId: "j", now });
    s = tourReducer(s, { type: "next", total: 5, now });
    s = tourReducer(s, { type: "next", total: 5, now });
    const closed = tourReducer(s, { type: "close", now });
    expect(closed.active).toBeNull();
    expect(tourButton(closed.prefs, "office-money", 5)).toEqual({ kind: "resume", step: 2 });
    const resumed = tourReducer(closed, { type: "start", id: "office-money", jobId: "j", now, from: 2 });
    expect(resumed.active?.step).toBe(2);
    const skipped = tourReducer(s, { type: "skip", now });
    expect(skipped.active).toBeNull();
    expect(skipped.prefs.tours["office-money"]?.status).toBe("skipped");
    expect(tourButton(skipped.prefs, "office-money", 5).kind).toBe("restart");
  });

  it("reset forgets one tour", () => {
    let s = tourReducer(fresh(), { type: "start", id: "first-job", jobId: "j", now });
    s = tourReducer(s, { type: "reset", id: "first-job" });
    expect(s.active).toBeNull();
    expect(s.prefs.tours["first-job"]).toBeUndefined();
    expect(tourButton(s.prefs, "first-job", 3).kind).toBe("start");
  });

  it("next/back/skip without a tour change nothing", () => {
    const s = fresh();
    for (const a of [{ type: "next", total: 3, now }, { type: "back", now }, { type: "skip", now }, { type: "close", now }, { type: "go", step: 1, total: 3, now }] as const) expect(tourReducer(s, a)).toBe(s);
  });

  it("offers the first tour once, to the office, when no tour runs", () => {
    const p = { ...EMPTY_PREFS, tours: {}, tips: {} };
    expect(shouldOfferFirstTour(p, { office: true, tourActive: false })).toBe(true);
    expect(shouldOfferFirstTour(p, { office: false, tourActive: false })).toBe(false);
    expect(shouldOfferFirstTour(p, { office: true, tourActive: true })).toBe(false);
    expect(shouldOfferFirstTour({ ...p, offerAnswered: true }, { office: true, tourActive: false })).toBe(false);
    expect(shouldOfferFirstTour({ ...p, tours: { "first-job": { status: "skipped", step: 0, at: now } } }, { office: true, tourActive: false })).toBe(false);
  });
});

describe("stored prefs", () => {
  it("parses defensively", () => {
    expect(parsePrefs(null)).toEqual(EMPTY_PREFS);
    expect(parsePrefs("junk")).toEqual(EMPTY_PREFS);
    const p = parsePrefs({ tours: { "first-job": { status: "done", step: 2, at: now }, bogus: { status: "done" }, "crew-day": { status: "weird" } }, tips: { plan: now, bad: 3 }, tipsOff: true, offerAnswered: 1, sampleJobId: 5 });
    expect(p.tours).toEqual({ "first-job": { status: "done", step: 2, at: now } });
    expect(p.tips).toEqual({ plan: now });
    expect(p.tipsOff).toBe(true);
    expect(p.offerAnswered).toBe(false);
    expect(p.sampleJobId).toBeNull();
    expect(parsePrefs({ tours: { "crew-day": { status: "active", step: -1 } } }).tours["crew-day"]?.step).toBe(0);
  });

  it("follows the account: finished tours, tips seen, and its Don't show tips", () => {
    const device: TourPrefs = { ...EMPTY_PREFS, tours: { "crew-day": { status: "active", step: 2, at: now } }, tips: { plan: now } };
    const merged = mergeAccount(device, { done: ["first-job", "crew-day", "nope"], tips: ["money", "plan"], tipsOff: true });
    expect(merged.tours["first-job"]?.status).toBe("done");
    // In progress on this device: kept.
    expect(merged.tours["crew-day"]?.status).toBe("active");
    expect(Object.keys(merged.tips).sort()).toEqual(["money", "plan"]);
    expect(merged.tipsOff).toBe(true);
    expect(merged.offerAnswered).toBe(true);
    expect(mergeAccount(device, null)).toBe(device);
    expect(mergeAccount(device, { tipsOff: "yes" }).tipsOff).toBe(false);
  });

  it("saves to the account only what follows the person, and only when it changed", () => {
    const p: TourPrefs = { ...EMPTY_PREFS, tours: { "first-job": { status: "done", step: 0, at: now }, "crew-day": { status: "active", step: 1, at: now } }, tips: { takeoff: now, plan: now }, tipsOff: true };
    expect(toAccount(p)).toEqual({ done: ["first-job"], tips: ["plan", "takeoff"], tipsOff: true });
    expect(accountDiffers(p, toAccount(p))).toBe(false);
    expect(accountDiffers(p, { done: ["first-job"], tips: ["takeoff", "plan"], tipsOff: true })).toBe(false);
    expect(accountDiffers(p, undefined)).toBe(true);
    expect(accountDiffers(EMPTY_PREFS, undefined)).toBe(false);
  });
});

describe("card placement", () => {
  const desk = { w: 1280, h: 800 };
  const card = { w: 360, h: 200 };
  it("goes below, above, beside, in the middle", () => {
    expect(placeCard({ x: 100, y: 100, w: 120, h: 40 }, card, desk)).toMatchObject({ mode: "popover", side: "bottom", y: 152 });
    expect(placeCard({ x: 100, y: 700, w: 120, h: 40 }, card, desk)).toMatchObject({ mode: "popover", side: "top", y: 700 - 12 - 200 });
    expect(placeCard({ x: 0, y: 20, w: 250, h: 760 }, card, desk)).toMatchObject({ mode: "popover", side: "right", x: 262 });
    expect(placeCard({ x: 1000, y: 20, w: 270, h: 760 }, card, desk)).toMatchObject({ mode: "popover", side: "left", x: 1000 - 12 - 360 });
    expect(placeCard(null, card, desk)).toEqual({ mode: "center" });
    expect(placeCard({ x: 2000, y: 100, w: 10, h: 10 }, card, desk)).toEqual({ mode: "center" });
  });

  it("stays inside the screen", () => {
    const p = placeCard({ x: 1250, y: 10, w: 20, h: 20 }, card, desk);
    expect(p.mode).toBe("popover");
    if (p.mode === "popover") expect(p.x + card.w).toBeLessThanOrEqual(desk.w - 12);
    // An element filling the screen: the card sits inside it, near the bottom.
    const big = placeCard({ x: 0, y: 0, w: 1280, h: 800 }, card, desk);
    expect(big).toMatchObject({ mode: "popover", side: "bottom" });
    if (big.mode === "popover") expect(big.y + card.h).toBeLessThanOrEqual(desk.h);
  });

  it("is a sheet on phones, away from the element", () => {
    const phone = { w: 390, h: 844 };
    expect(placeCard({ x: 10, y: 100, w: 100, h: 40 }, card, phone)).toEqual({ mode: "sheet", edge: "bottom" });
    expect(placeCard({ x: 10, y: 790, w: 100, h: 50 }, card, phone)).toEqual({ mode: "sheet", edge: "top" });
    expect(placeCard(null, card, phone)).toEqual({ mode: "sheet", edge: "bottom" });
  });

  it("spotlight pads and clamps", () => {
    expect(spotlightRect({ x: 0, y: 0, w: 50, h: 20 }, desk)).toEqual({ x: 2, y: 2, w: 54, h: 24 });
    expect(rectVisible({ x: 0, y: 0, w: 0, h: 10 }, desk)).toBe(false);
    expect(rectVisible(null, desk)).toBe(false);
  });
});

describe("one-time tips", () => {
  it("finds the tip for a place (new tabs and their old homes)", () => {
    expect(tipForLocation("/project", "id=1&tab=plan")).toBe("plan");
    expect(tipForLocation("/project", "id=1&tab=plan&manage=1")).toBeNull();
    expect(tipForLocation("/project", "id=1&tab=takeoff")).toBe("takeoff");
    expect(tipForLocation("/project", "id=1&tab=takeoff&view=wiring")).toBeNull();
    expect(tipForLocation("/project", "id=1&tab=money&step=quote")).toBe("money");
    expect(tipForLocation("/project", "id=1&tab=tasks")).toBe("tasks");
    expect(tipForLocation("/project", "id=1&tab=field&section=tasks")).toBe("tasks");
    expect(tipForLocation("/project", "id=1&tab=photos")).toBe("photos");
    expect(tipForLocation("/project", "id=1&tab=field&section=photos")).toBe("photos");
    expect(tipForLocation("/project", "id=1&tab=overview")).toBeNull();
    expect(tipForLocation("/tasks", "")).toBe("tasks");
    expect(tipForLocation("/jobs", "")).toBeNull();
  });

  it("shows each tip once, never when off, during a tour, on client pages, or Money to technicians", () => {
    const p = { ...EMPTY_PREFS, tours: {}, tips: {} };
    const o = { tourActive: false, path: "/project", office: true };
    expect(shouldShowTip("plan", p, o)).toBe(true);
    expect(shouldShowTip(null, p, o)).toBe(false);
    expect(shouldShowTip("plan", { ...p, tips: { plan: now } }, o)).toBe(false);
    expect(shouldShowTip("plan", { ...p, tipsOff: true }, o)).toBe(false);
    expect(shouldShowTip("plan", p, { ...o, tourActive: true })).toBe(false);
    expect(shouldShowTip("money", p, { ...o, office: false })).toBe(false);
    for (const client of ["/q", "/d", "/co", "/p", "/r", "/q/abc"]) {
      expect(isClientPath(client), client).toBe(true);
      expect(shouldShowTip("plan", p, { ...o, path: client })).toBe(false);
    }
    expect(isClientPath("/project")).toBe(false);
    expect(isClientPath("/pricing")).toBe(false);
  });

  it("every tip has one short line and a guide", () => {
    for (const id of TIP_IDS) {
      expect(TIPS[id].text.length, id).toBeLessThanOrEqual(110);
      expect(GUIDES.some((g) => g.id === TIPS[id].guide), id).toBe(true);
    }
  });
});

describe("help guides", () => {
  it("have unique ids and numbers, steps, and screenshots that exist", () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((g) => g.number)).size).toBe(GUIDES.length);
    expect(GUIDES.length).toBeGreaterThanOrEqual(10);
    for (const g of GUIDES) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/);
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(3);
      for (const s of g.steps) {
        if (!s.shot) continue;
        expect(s.shot.src, g.id).toMatch(/^\/help\/[a-z0-9-]+\.(webp|png)$/);
        expect(existsSync(path.join(root, "public", s.shot.src)), s.shot.src).toBe(true);
        expect(s.shot.alt.trim(), s.shot.src).not.toBe("");
        expect(SHOT_SIZE[s.shot.device]).toBeTruthy();
      }
    }
  });

  it("keep the screenshots small", () => {
    const dir = path.join(root, "public/help");
    const total = readdirSync(dir).reduce((n, f) => n + statSync(path.join(dir, f)).size, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });

  it("search matches titles and summaries in the active language, ignoring case and accents", () => {
    const id = (s: string) => s;
    expect(searchGuides("", id)).toHaveLength(GUIDES.length);
    expect(searchGuides("DOORS windows", id).map((g) => g.id)).toContain("doors-windows");
    expect(searchGuides("zzzz", id)).toEqual([]);
    expect(searchGuides("h-07", id).map((g) => g.id)).toEqual(["crew"]);
    const es = (s: string) => (s === "Languages" ? "Idiomas y ESPAÑOL" : s);
    expect(searchGuides("espanol", es).map((g) => g.id)).toEqual(["languages"]);
  });
});
