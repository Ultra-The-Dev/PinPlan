import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildServiceWorker, collectHelpImages, collectPdfWorker, collectPrerendered, collectRoutes, collectStatic, renderSw, REQUIRED_ROUTES } from "../scripts/build-sw.mjs";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunkError";
import { contentSecurityPolicy } from "@/lib/securityHeaders";
import { mapTiles, OSM_TILE_URL, weatherOrigin, weatherUrl } from "@/lib/endpoints";
import { upstreamWeatherUrl } from "@/lib/server/weatherProxy";

const root = path.resolve(__dirname, "..");

function touch(file: string, body = "") {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

/** A fake project: app pages, a .next build and public files. */
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "pinplan-sw-"));
  for (const p of ["page.tsx", "project/page.tsx", "privacy/page.tsx", "(marketing)/pricing/page.tsx", "p/[slug]/page.tsx", "_parts/page.tsx", "api/x/page.tsx", "admin/page.tsx", "project/Editor.tsx"]) {
    touch(path.join(dir, "src/app", p));
  }
  touch(path.join(dir, ".next/BUILD_ID"), "abc123\n");
  touch(path.join(dir, ".next/static/chunks/main-1a2b.js"));
  touch(path.join(dir, ".next/static/chunks/main-1a2b.js.map"));
  touch(path.join(dir, ".next/static/css/app-9f.css"));
  touch(path.join(dir, ".next/static/media/geist.woff2"));
  touch(path.join(dir, ".next/static/abc123/_buildManifest.js"));
  touch(path.join(dir, "public/icon.svg"));
  touch(path.join(dir, "public/pdf.worker.6.5.438.min.mjs"));
  touch(path.join(dir, "public/vendor/opencv-4.10.0.js"));
  touch(path.join(dir, "scripts/sw.template.js"), readFileSync(path.join(root, "scripts/sw.template.js"), "utf8"));
  return dir;
}

describe("service worker build", () => {
  it("lists static pages only, plus the pages that must always work offline", () => {
    const routes = collectRoutes(path.join(fixture(), "src/app"));
    expect(routes).toEqual(expect.arrayContaining(["/", "/project", "/privacy", "/pricing", "/offline", "/terms", "/support"]));
    expect(routes.some((r: string) => r.includes("[") || r.includes("(") || r.startsWith("/api") || r.includes("_parts"))).toBe(false);
    expect(routes).not.toContain("/admin");
    for (const r of REQUIRED_ROUTES) expect(routes).toContain(r);
  });

  it("covers every real page of the app", () => {
    const routes = collectRoutes(path.join(root, "src/app"));
    for (const r of ["/", "/project", "/photos", "/map", "/settings", "/offline", "/privacy", "/terms", "/support", "/pricing"]) expect(routes).toContain(r);
  });

  it("precaches every build chunk, stylesheet and font, without source maps", () => {
    const files = collectStatic(path.join(fixture(), ".next/static"));
    expect(files).toEqual(["/_next/static/abc123/_buildManifest.js", "/_next/static/chunks/main-1a2b.js", "/_next/static/css/app-9f.css", "/_next/static/media/geist.woff2"]);
  });

  it("finds the versioned PDF.js worker", () => {
    expect(collectPdfWorker(path.join(fixture(), "public"))).toEqual(["/pdf.worker.6.5.438.min.mjs"]);
  });

  it("writes the build id and precache list into the worker, leaving the 10 MB OpenCV to load on use", () => {
    const sw = buildServiceWorker(fixture());
    expect(sw.build).toBe("abc123");
    expect(sw.source).toContain('const BUILD = "abc123";');
    expect(sw.source).not.toMatch(/__BUILD__|__PRECACHE__/);
    expect(sw.precache).toEqual(expect.arrayContaining(["/", "/offline", "/_next/static/chunks/main-1a2b.js", "/pdf.worker.6.5.438.min.mjs", "/icon.svg", "/manifest.webmanifest"]));
    expect(sw.precache.some((u: string) => u.includes("opencv"))).toBe(false);
    expect(new Set(sw.precache).size).toBe(sw.precache.length);
    // The generated file is valid JavaScript.
    expect(() => new vm.Script(sw.source)).not.toThrow();
  });

  it("precaches the Help center: /help, every prerendered guide and its screenshots", () => {
    const dir = fixture();
    touch(path.join(dir, ".next/prerender-manifest.json"), JSON.stringify({ routes: { "/help": {}, "/help/crew": {}, "/help/first-quote": {}, "/pricing": {}, "/p/abc": {} } }));
    touch(path.join(dir, "public/help/plan-edit.webp"));
    touch(path.join(dir, "public/help/notes.txt"));
    expect(collectPrerendered(path.join(dir, ".next"))).toEqual(["/help/crew", "/help/first-quote"]);
    expect(collectHelpImages(path.join(dir, "public"))).toEqual(["/help/plan-edit.webp"]);
    const sw = buildServiceWorker(dir);
    expect(sw.precache).toEqual(expect.arrayContaining(["/help", "/help/crew", "/help/first-quote", "/help/plan-edit.webp"]));
    expect(sw.precache).not.toContain("/p/abc");
    // No manifest (or a broken one): nothing extra, no crash.
    expect(collectPrerendered(path.join(fixture(), ".next"))).toEqual([]);
    touch(path.join(dir, ".next/prerender-manifest.json"), "{");
    expect(collectPrerendered(path.join(dir, ".next"))).toEqual([]);
  });

  it("refuses a template without placeholders", () => {
    expect(() => renderSw("const x = 1;", { build: "b", precache: [] })).toThrow();
  });
});

/** Run the generated worker against in-memory caches and a fake network. */
function runWorker(source: string, opts: { network: (url: string) => Response | Promise<Response>; caches?: Map<string, Map<string, Response>>; timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }) {
  const stores = opts.caches ?? new Map<string, Map<string, Response>>();
  const key = (r: string | Request) => {
    const u = new URL(typeof r === "string" ? r : r.url, "https://app.test");
    return u.pathname + u.search;
  };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      put: async (r: string | Request, res: Response) => void m.set(key(r), res),
      match: async (r: string | Request) => m.get(key(r))?.clone(),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: string | Request) => {
      for (const m of stores.values()) {
        const hit = m.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  let skipped = false;
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] ??= []).push(fn),
    skipWaiting: () => {
      skipped = true;
    },
    clients: { claim: async () => undefined },
  };
  const basic = (res: Response) => {
    Object.defineProperty(res, "type", { value: "basic" });
    return res;
  };
  const fetch = async (r: string | Request) => basic(await opts.network(key(r)));
  vm.runInNewContext(source, { self, caches, fetch, Request: class extends Request { constructor(u: string, i?: RequestInit) { super(new URL(u, "https://app.test"), i); } }, Response, URL, console: { warn: () => undefined }, Promise, JSON, Set, setTimeout: opts.timers?.setTimeout ?? setTimeout, clearTimeout: opts.timers?.clearTimeout ?? clearTimeout });
  const fire = async (type: string, extra: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const e = { ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (responded = p) };
    for (const fn of listeners[type] ?? []) fn(e);
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return res;
  };
  return { stores, fire, skipped: () => skipped };
}

describe("generated service worker", () => {
  const make = (build: string, precache: string[]) => renderSw(readFileSync(path.join(root, "scripts/sw.template.js"), "utf8"), { build, precache });
  const nav = (url: string) => ({ request: { method: "GET", mode: "navigate", url: `https://app.test${url}`, headers: new Headers() } });

  it("precaches what it can even when some files fail, and waits to be asked before taking over", async () => {
    const w = runWorker(make("b1", ["/", "/offline", "/_next/static/chunks/a.js", "/_next/static/chunks/gone.js"]), {
      network: (u) => (u.includes("gone") ? new Response("", { status: 404 }) : new Response(`body of ${u}`)),
    });
    await w.fire("install");
    expect([...w.stores.get("pinplan-b1")!.keys()].sort()).toEqual(["/", "/_next/static/chunks/a.js", "/offline"]);
    expect(w.skipped()).toBe(false);
    await w.fire("message", { data: { type: "SKIP_WAITING" } });
    expect(w.skipped()).toBe(true);
  });

  it("answers a page offline from the cache, ignoring the query, else the offline page", async () => {
    const w = runWorker(make("b1", ["/project", "/offline"]), { network: (u) => new Response(`page ${u}`) });
    await w.fire("install");
    const offline = runWorker(make("b1", []), { caches: w.stores, network: () => Promise.reject(new TypeError("offline")) });
    expect(await (await offline.fire("fetch", nav("/project?id=job1&tab=plan")))!.text()).toBe("page /project");
    expect(await (await offline.fire("fetch", nav("/never-seen")))!.text()).toBe("page /offline");
  });

  it("uses the saved page when a weak signal neither answers nor fails, and still refreshes it later", async () => {
    vi.useFakeTimers();
    try {
      const w = runWorker(make("b1", ["/project"]), { network: (u) => new Response(`page ${u}`) });
      await w.fire("install");
      let answer: (r: Response) => void = () => undefined;
      const slow = runWorker(make("b1", []), { caches: w.stores, network: () => new Promise<Response>((r) => (answer = r)), timers: { setTimeout, clearTimeout } });
      const pending = slow.fire("fetch", nav("/project?id=job1"));
      await vi.advanceTimersByTimeAsync(4100);
      answer(new Response("fresh /project"));
      const res = await pending;
      expect(await res!.text()).toBe("page /project");
      await vi.advanceTimersByTimeAsync(10);
      expect(await w.stores.get("pinplan-b1")!.get("/project")!.clone().text()).toBe("fresh /project");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps only successful same-origin pages", async () => {
    const w = runWorker(make("b1", []), { network: (u) => (u === "/broken" ? new Response("oops", { status: 500 }) : new Response("ok")) });
    await w.fire("fetch", nav("/broken"));
    await w.fire("fetch", nav("/settings"));
    expect([...(w.stores.get("pinplan-b1")?.keys() ?? [])]).toEqual(["/settings"]);
  });

  it("keeps the previous build's cache for one version and prunes older ones", async () => {
    const stores = new Map<string, Map<string, Response>>();
    for (const b of ["b1", "b2", "b3"]) {
      const w = runWorker(make(b, []), { caches: stores, network: () => new Response("x") });
      await w.fire("install");
      await w.fire("activate");
    }
    expect([...stores.keys()].sort()).toEqual(["pinplan-b2", "pinplan-b3", "pinplan-meta"]);
  });

  it("removes the old hand-written cache on first activation", async () => {
    const stores = new Map<string, Map<string, Response>>([["pinplan-v9", new Map()]]);
    const w = runWorker(make("b1", []), { caches: stores, network: () => new Response("x") });
    await w.fire("activate");
    expect(stores.has("pinplan-v9")).toBe(false);
  });
});

describe("reload once after a deploy removed a chunk", () => {
  it("recognises chunk load errors from webpack, Turbopack and browsers", () => {
    expect(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 123 failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/abc.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("reloads once, then shows the error if it happens again right away", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    let reloads = 0;
    const err = Object.assign(new Error("x"), { name: "ChunkLoadError" });
    expect(reloadOnceForChunkError(err, store, 1_000_000, () => reloads++)).toBe(true);
    expect(reloadOnceForChunkError(err, store, 1_010_000, () => reloads++)).toBe(false);
    expect(reloadOnceForChunkError(err, store, 1_200_000, () => reloads++)).toBe(true);
    expect(reloadOnceForChunkError(new Error("bug"), store, 2_000_000, () => reloads++)).toBe(false);
    expect(reloads).toBe(2);
  });
});

describe("CSP and configurable endpoints", () => {
  it("no longer allows a third-party script host for OpenCV", () => {
    expect(contentSecurityPolicy({})).not.toContain("docs.opencv.org");
    expect(contentSecurityPolicy({})).toMatch(/script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';/);
  });

  it("allows an off-site weather host, but not a same-origin proxy path", () => {
    expect(contentSecurityPolicy({ weatherUrl: "https://weather.example.com/base" })).toMatch(/connect-src [^;]*https:\/\/weather\.example\.com/);
    expect(contentSecurityPolicy({ weatherUrl: "/api/weather" })).not.toContain("/api/weather");
    expect(weatherOrigin("http://insecure.example.com")).toBeNull();
    expect(weatherOrigin("not a url")).toBeNull();
  });

  it("sends weather to the configured base, keeping Open-Meteo's path and query", () => {
    const raw = "https://api.open-meteo.com/v1/forecast?latitude=40.7&longitude=-74.0&start_date=2026-11-19&end_date=2026-11-19";
    expect(weatherUrl(raw, undefined)).toBe(raw);
    expect(weatherUrl(raw, "")).toBe(raw);
    expect(weatherUrl(raw, "/api/weather/")).toBe("/api/weather/v1/forecast?latitude=40.7&longitude=-74.0&start_date=2026-11-19&end_date=2026-11-19");
    expect(weatherUrl("https://archive-api.open-meteo.com/v1/archive?x=1", "https://wx.example.com")).toBe("https://wx.example.com/v1/archive?x=1");
  });

  it("weather proxy forwards only a daily lookup, with the server's key on the commercial host", () => {
    const q = new URLSearchParams({ latitude: "40.7", longitude: "-74", daily: "weather_code", start_date: "2026-11-19", end_date: "2026-11-19", evil: "1" });
    const paid = upstreamWeatherUrl("forecast", q, "k-123");
    expect(paid).toMatch(/^https:\/\/customer-api\.open-meteo\.com\/v1\/forecast\?/);
    expect(paid).toContain("apikey=k-123");
    expect(paid).not.toContain("evil");
    expect(upstreamWeatherUrl("archive", q, undefined)).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/);
    expect(upstreamWeatherUrl("forecast", new URLSearchParams({ latitude: "x", longitude: "1", start_date: "2026-11-19", end_date: "2026-11-19" }), undefined)).toBeNull();
    expect(upstreamWeatherUrl("forecast", new URLSearchParams({ latitude: "1", longitude: "1", start_date: "soon", end_date: "2026-11-19" }), undefined)).toBeNull();
  });

  it("uses OpenStreetMap tiles by default and a configured provider with its key", () => {
    expect(mapTiles({})?.url).toBe(OSM_TILE_URL);
    // A production build with no provider set shows no background map (never OSM's server).
    expect(mapTiles({ production: true })).toBeNull();
    const t = mapTiles({ url: "https://tiles.example.com/{z}/{x}/{y}.png?key={key}", key: "pk", attribution: "© Example" })!;
    expect(t.url).toContain("{key}");
    expect(t.options).toMatchObject({ key: "pk", attribution: "© Example" });
  });
});
