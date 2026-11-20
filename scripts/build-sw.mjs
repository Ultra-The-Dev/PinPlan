// Postbuild: write public/sw.js from scripts/sw.template.js with this build's id and the list of files to precache
// (every /_next/static chunk, stylesheet and font of this build, every static page, the PDF.js worker and the icons),
// so the whole app works offline after one online visit. Run by `npm run build` (the "postbuild" script).
// See docs/offline.md.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pages that must always work offline, even if the app folder scan misses them. */
export const REQUIRED_ROUTES = ["/", "/jobs", "/project", "/offline", "/privacy", "/terms", "/support", "/help"];
/** Dynamic routes whose prerendered pages are precached too (from .next/prerender-manifest.json): the Help guides. */
export const PRERENDERED_PREFIXES = ["/help/"];
/** Pages not worth caching on every device (platform admin only). */
const SKIP_ROUTES = new Set(["/admin"]);
/** Small files from public/ the app shell uses. Vendored libraries (public/vendor, ~10 MB of OpenCV) are cached on first use instead. */
const PUBLIC_FILES = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/samples/sample-plan.pdf"];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const toPosix = (p) => p.split(path.sep).join("/");

/**
 * Static page routes from the app folder: every folder holding a page.tsx/.ts/.jsx/.js. Route groups "(x)" don't add
 * a segment; dynamic "[x]", private "_x" and parallel "@x" folders are skipped (nothing fixed to cache), as is /api.
 */
export function collectRoutes(appDir) {
  const routes = new Set();
  for (const file of walk(appDir)) {
    if (!/^page\.(tsx|ts|jsx|js)$/.test(path.basename(file))) continue;
    const segs = toPosix(path.relative(appDir, path.dirname(file))).split("/").filter(Boolean);
    if (segs.some((s) => s.startsWith("[") || s.startsWith("_") || s.startsWith("@"))) continue;
    const route = "/" + segs.filter((s) => !/^\(.*\)$/.test(s)).join("/");
    if (route === "/api" || route.startsWith("/api/") || SKIP_ROUTES.has(route)) continue;
    routes.add(route);
  }
  for (const r of REQUIRED_ROUTES) routes.add(r);
  return [...routes].sort();
}

/** Every file Next emitted under .next/static as its /_next/static URL (source maps left out). */
export function collectStatic(staticDir) {
  return walk(staticDir)
    .filter((f) => !f.endsWith(".map"))
    .map((f) => "/_next/static/" + toPosix(path.relative(staticDir, f)))
    .sort();
}

/** Prerendered pages of dynamic routes under `prefixes` (e.g. /help/[guide] → /help/first-quote), from Next's manifest. */
export function collectPrerendered(nextDir, prefixes = PRERENDERED_PREFIXES) {
  const file = path.join(nextDir, "prerender-manifest.json");
  if (!existsSync(file)) return [];
  try {
    const routes = Object.keys(JSON.parse(readFileSync(file, "utf8")).routes ?? {});
    return routes.filter((r) => prefixes.some((p) => r.startsWith(p)) && !r.includes("[")).sort();
  } catch {
    return [];
  }
}

/** The Help center's screenshots (public/help/, made by scripts/help-screens.mjs). */
export function collectHelpImages(publicDir) {
  const dir = path.join(publicDir, "help");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(webp|png|jpe?g|svg)$/i.test(f))
    .map((f) => "/help/" + f)
    .sort();
}

/** The versioned PDF.js worker(s) in public/ (scripts/copy-pdf-worker.mjs puts pdf.worker.<version>.min.mjs there). */
export function collectPdfWorker(publicDir) {
  if (!existsSync(publicDir)) return [];
  return readdirSync(publicDir)
    .filter((f) => /^pdf\.worker\.[\w.-]+\.min\.mjs$/.test(f))
    .map((f) => "/" + f)
    .sort();
}

/** Fill the template's __BUILD__ and __PRECACHE__ placeholders. Throws if the template lost one of them. */
export function renderSw(template, { build, precache }) {
  if (!template.includes("__BUILD__") || !template.includes("__PRECACHE__")) throw new Error("sw.template.js is missing __BUILD__ or __PRECACHE__");
  const urls = [...new Set(precache)];
  // Replacer functions, so a "$" in a file name is never read as a replacement pattern.
  return template.replace("__BUILD__", () => JSON.stringify(String(build))).replace("__PRECACHE__", () => JSON.stringify(urls, null, 0));
}

/** Build the precache list and the service worker source for the project at `root`. */
export function buildServiceWorker(root) {
  const nextDir = path.join(root, ".next");
  const buildIdFile = path.join(nextDir, "BUILD_ID");
  if (!existsSync(buildIdFile)) throw new Error("No .next/BUILD_ID: run `next build` first");
  const build = readFileSync(buildIdFile, "utf8").trim();
  const routes = [...collectRoutes(path.join(root, "src", "app")), ...collectPrerendered(nextDir)];
  const files = collectStatic(path.join(nextDir, "static"));
  const publicDir = path.join(root, "public");
  const shell = PUBLIC_FILES.filter((u) => u === "/manifest.webmanifest" || existsSync(path.join(publicDir, u.slice(1))));
  const precache = [...routes, ...shell, ...collectPdfWorker(publicDir), ...collectHelpImages(publicDir), ...files];
  const template = readFileSync(path.join(root, "scripts", "sw.template.js"), "utf8");
  return { build, routes, files, precache, source: renderSw(template, { build, precache }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sw = buildServiceWorker(root);
  writeFileSync(path.join(root, "public", "sw.js"), sw.source);
  console.log(`sw.js: build ${sw.build}, ${sw.routes.length} pages + ${sw.precache.length - sw.routes.length} files precached`);
}
