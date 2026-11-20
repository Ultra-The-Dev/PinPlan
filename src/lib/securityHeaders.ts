// Security headers for every response (applied in next.config.ts → headers()). Evaluated at build time, so the
// Supabase origin comes from NEXT_PUBLIC_SUPABASE_URL as set for the build.
//
// Why the CSP allows what it does (checked against what the app loads):
// - script-src 'unsafe-inline': pages are static and prerendered (they must work offline from the service worker), so
//   Next.js can't stamp per-request nonces on its inline bootstrap scripts. A nonce CSP would force dynamic rendering.
// - script-src 'unsafe-eval': HEIC photo conversion (heic2any) and the photo-straightening tool (OpenCV.js) are
//   Emscripten builds whose bindings call `new Function`. Drop it once both are replaced or rebuilt without it.
//   The public client pages (/d, /p, /r, /co, /q: documents, proposals, photo reports, change orders, RFIs) load
//   neither, so they get a stricter policy without it (publicPageHeaders below). `next dev` still needs it there.
// - 'wasm-unsafe-eval': PDF.js image decoders, react-pdf's layout engine and OpenCV run WebAssembly.
// - OpenCV.js is self-hosted (public/vendor), so no third-party script host is allowed.
// - worker-src blob:: PDF.js runs from /pdf.worker.<version>.min.mjs; heic2any starts its worker from a blob: URL.
// - img-src: sheet/photo blobs and data: URLs, OpenStreetMap tiles (Leaflet map), Supabase public proposal images, and
//   any https: image: proposal/report snapshots store absolute logo/image URLs, which must keep working after a domain
//   change (e.g. a proposal published on *.vercel.app, opened after moving to the custom domain). Images can't run code.
// - connect-src: Supabase REST/auth/storage (https) and realtime (wss); Open-Meteo forecast + archive (daily log weather).
// - style/font: inline styles (Konva, react-pdf, Leaflet). Fonts are self-hosted by next/font (no Google Fonts, so
//   client pages send no request to Google).
// - connect-src: Supabase REST/auth/storage (https) and realtime (wss); Open-Meteo forecast + archive (daily log weather),
//   plus the NEXT_PUBLIC_WEATHER_URL origin when weather goes to another https host (src/lib/endpoints.ts). Map tiles
//   (NEXT_PUBLIC_MAP_TILE_URL) are images, already covered by img-src https:.
// - style/font: inline styles (Konva, react-pdf, Leaflet) and Google Fonts on the client proposal/report pages.
// - object-src/frame-src blob:: generated PDFs and documents open from blob: URLs.
// - https://challenges.cloudflare.com (script + frame), only when Turnstile is set up: the bot check on sign-up pages.
// Cross-Origin-Opener-Policy same-origin: a page we open in a new window (or that opens us) can't reach our window
// object, which closes cross-window attacks on the signed-in app. Nothing here relies on window.opener across origins.
// Set CSP_REPORT_ONLY=1 to send the policy as Content-Security-Policy-Report-Only instead (debugging a regression).

import { weatherOrigin } from "./endpoints";

export interface HeaderEnv {
  supabaseUrl?: string;
  dev?: boolean;
  vercelPreview?: boolean;
  reportOnly?: boolean;
  /** Cloudflare Turnstile is set up: allow its script and frame. Defaults to NEXT_PUBLIC_TURNSTILE_SITE_KEY being set. */
  turnstile?: boolean;
  /** Policy for the public client pages: no 'unsafe-eval' (outside `next dev`). */
  publicPage?: boolean;
  /** NEXT_PUBLIC_WEATHER_URL (defaults to the build's env). */
  weatherUrl?: string;
}

/** The public pages a customer opens from a link (no sign-in). They get publicPageHeaders(). */
export const PUBLIC_PAGES = ["d", "p", "r", "co", "q"] as const;

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: HeaderEnv): string {
  const sb = origin(env.supabaseUrl);
  const sbWs = sb ? sb.replace(/^http/, "ws") : null;
  // Vercel's preview-deployment toolbar (comments/feedback) only exists on preview URLs.
  const live = env.vercelPreview;
  // Defaults to the build's NEXT_PUBLIC_TURNSTILE_SITE_KEY (trimmed, as src/lib/captcha.ts reads it).
  const turnstile = env.turnstile ?? !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const cf = turnstile && "https://challenges.cloudflare.com";
  const evalOk = !env.publicPage || env.dev;
  const weather = weatherOrigin(env.weatherUrl ?? process.env.NEXT_PUBLIC_WEATHER_URL);
  const list = (...xs: (string | null | false | undefined)[]) => xs.filter(Boolean).join(" ");
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": list(
      "'self'",
      "'unsafe-inline'",
      evalOk && "'unsafe-eval'",
      "'wasm-unsafe-eval'",
      cf,
      live && "https://vercel.live",
    ),
    "style-src": list("'self'", "'unsafe-inline'", live && "https://vercel.live"),
    "img-src": list("'self'", "blob:", "data:", "https:", sb),
    "font-src": list("'self'", "data:", live && "https://vercel.live https://assets.vercel.com"),
    "connect-src": list("'self'", "blob:", "data:", sb, sbWs, "https://api.open-meteo.com https://archive-api.open-meteo.com", weather, env.dev && "ws: wss:", live && "https://vercel.live wss://ws-us3.pusher.com"),
    "worker-src": "'self' blob:",
    "media-src": "'self' blob: data:",
    "object-src": "'self' blob:",
    "frame-src": list("'self'", "blob:", cf, live && "https://vercel.live"),
    "manifest-src": "'self'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: env.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: contentSecurityPolicy(env) },
    // Two years, all subdomains. Add "; preload" only after submitting the domain to hstspreload.org.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Camera: photo capture. Geolocation: photo geotags and the jobs map. Nothing else.
    { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()" },
    // Older browsers that ignore CSP frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/** Headers for the public client pages: the same set, with the stricter CSP (no 'unsafe-eval'). */
export function publicPageHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return securityHeaders({ ...env, publicPage: true });
}

/** next.config.ts headers(): every route, then the public pages (a later entry's header wins for the same key). */
export function headerRules(env: HeaderEnv): { source: string; headers: { key: string; value: string }[] }[] {
  const pages = PUBLIC_PAGES.join("|");
  const strict = publicPageHeaders(env);
  return [
    { source: "/:path*", headers: securityHeaders(env) },
    { source: `/:page(${pages})`, headers: strict },
    { source: `/:page(${pages})/:path*`, headers: strict },
  ];
}

/** The headers every static file gets: the baseline set without the page CSP (a page's CSP means nothing on a JS
 *  chunk or an image, and the Worker answers pages itself, with headerRules() above). */
const STATIC_KEYS = ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"] as const;

/** An SVG opened directly runs as a document: no scripts, no requests, inline styles only. Never loosen this. */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

/** public/_headers: Cloudflare Workers static assets (and Pages) serve files straight from the asset store, before
 *  the Worker and next.config.ts headers() run, so they need their own headers. tests/securityHeaders.test.ts checks
 *  the committed file matches this. */
export function staticAssetHeaderRules(): { path: string; headers: { key: string; value: string }[] }[] {
  const base = securityHeaders({});
  const pick = (k: string) => ({ key: k, value: base.find((h) => h.key === k)!.value });
  return [
    { path: "/*", headers: STATIC_KEYS.map(pick) },
    { path: "/*.svg", headers: [{ key: "Content-Security-Policy", value: SVG_CSP }] },
    // The service worker must be checked on every load, or a phone can keep an old build for a day.
    { path: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
  ];
}

/** The text of public/_headers, without its leading comment lines. */
export function staticAssetHeadersFile(): string {
  return staticAssetHeaderRules()
    .map((r) => [r.path, ...r.headers.map((h) => `  ${h.key}: ${h.value}`)].join("\n"))
    .join("\n\n") + "\n";
}
