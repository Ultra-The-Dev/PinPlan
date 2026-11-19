// Security headers for every response (applied in next.config.ts → headers()). Evaluated at build time, so the
// Supabase origin comes from NEXT_PUBLIC_SUPABASE_URL as set for the build.
//
// Why the CSP allows what it does (checked against what the app loads):
// - script-src 'unsafe-inline': pages are static and prerendered (they must work offline from the service worker), so
//   Next.js can't stamp per-request nonces on its inline bootstrap scripts. A nonce CSP would force dynamic rendering.
// - script-src 'unsafe-eval': HEIC photo conversion (heic2any) and the photo-straightening tool (OpenCV.js) are
//   Emscripten builds whose bindings call `new Function`. Drop it once both are replaced or rebuilt without it.
// - 'wasm-unsafe-eval': PDF.js image decoders, react-pdf's layout engine and OpenCV run WebAssembly.
// - https://docs.opencv.org: OpenCV.js is loaded on demand from there (src/lib/perspective.ts).
// - worker-src blob:: PDF.js runs from /pdf.worker.min.mjs; heic2any starts its worker from a blob: URL.
// - img-src: sheet/photo blobs and data: URLs, OpenStreetMap tiles (Leaflet map), Supabase public proposal images, and
//   any https: image: proposal/report snapshots store absolute logo/image URLs, which must keep working after a domain
//   change (e.g. a proposal published on *.vercel.app, opened after moving to the custom domain). Images can't run code.
// - connect-src: Supabase REST/auth/storage (https) and realtime (wss); Open-Meteo forecast + archive (daily log weather).
// - style/font: inline styles (Konva, react-pdf, Leaflet). Fonts are self-hosted by next/font (no Google Fonts, so
//   client pages send no request to Google).
// - object-src/frame-src blob:: generated PDFs and documents open from blob: URLs.
// Set CSP_REPORT_ONLY=1 to send the policy as Content-Security-Policy-Report-Only instead (debugging a regression).

export interface HeaderEnv {
  supabaseUrl?: string;
  dev?: boolean;
  vercelPreview?: boolean;
  reportOnly?: boolean;
}

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
  const list = (...xs: (string | null | false | undefined)[]) => xs.filter(Boolean).join(" ");
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": list("'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "https://docs.opencv.org", live && "https://vercel.live"),
    "style-src": list("'self'", "'unsafe-inline'", live && "https://vercel.live"),
    "img-src": list("'self'", "blob:", "data:", "https:", sb),
    "font-src": list("'self'", "data:", live && "https://vercel.live https://assets.vercel.com"),
    "connect-src": list("'self'", "blob:", "data:", sb, sbWs, "https://api.open-meteo.com https://archive-api.open-meteo.com", env.dev && "ws: wss:", live && "https://vercel.live wss://ws-us3.pusher.com"),
    "worker-src": "'self' blob:",
    "media-src": "'self' blob: data:",
    "object-src": "'self' blob:",
    "frame-src": list("'self'", "blob:", live && "https://vercel.live"),
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
  ];
}
