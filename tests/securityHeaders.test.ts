import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, headerRules, publicPageHeaders, securityHeaders } from "@/lib/securityHeaders";

const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

describe("security headers", () => {
  it("sends the baseline headers", () => {
    const h = securityHeaders({});
    expect(get(h, "Strict-Transport-Security")).toMatch(/max-age=\d{8}/);
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get(h, "Permissions-Policy")).toContain("camera=(self)");
    expect(get(h, "Permissions-Policy")).toContain("geolocation=(self)");
    expect(get(h, "Permissions-Policy")).toContain("microphone=()");
    expect(get(h, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("allows the configured Supabase project for data, images and realtime", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/" });
    expect(csp).toMatch(/connect-src [^;]*https:\/\/abc\.supabase\.co [^;]*wss:\/\/abc\.supabase\.co/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/abc\.supabase\.co/);
    expect(csp).toMatch(/img-src 'self' blob: data: https: /);
    expect(csp).toMatch(/worker-src 'self' blob:/);
    expect(csp).not.toMatch(/ws: wss:/);
  });

  it("lets the daily log fetch its weather from Open-Meteo (forecast and archive), nothing broader", () => {
    const csp = contentSecurityPolicy({});
    expect(csp).toMatch(/connect-src [^;]*https:\/\/api\.open-meteo\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/archive-api\.open-meteo\.com/);
    expect(csp).not.toMatch(/connect-src [^;]*\*\.open-meteo/);
    expect(csp).not.toMatch(/connect-src [^;]*https: /);
  });

  it("can switch to report-only, and loosens connect-src for the dev server only", () => {
    expect(get(securityHeaders({ reportOnly: true }), "Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(contentSecurityPolicy({ dev: true })).toMatch(/connect-src [^;]*ws: wss:/);
    expect(contentSecurityPolicy({ supabaseUrl: "not a url" })).not.toContain("not a url");
  });
});

describe("cross-origin isolation and the public client pages", () => {
  it("sends Cross-Origin-Opener-Policy same-origin everywhere", () => {
    expect(get(securityHeaders({}), "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(get(publicPageHeaders({}), "Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("drops 'unsafe-eval' (and OpenCV) on /d, /p, /r, /co and /q, but keeps WebAssembly", () => {
    const app = get(securityHeaders({}), "Content-Security-Policy")!;
    const pub = get(publicPageHeaders({}), "Content-Security-Policy")!;
    expect(app).toContain("'unsafe-eval'");
    expect(pub).not.toContain("'unsafe-eval'");
    expect(pub).not.toContain("docs.opencv.org");
    expect(pub).toContain("'wasm-unsafe-eval'");
    expect(pub).toContain("frame-ancestors 'none'");
    // `next dev` needs eval for its tooling.
    expect(contentSecurityPolicy({ publicPage: true, dev: true })).toContain("'unsafe-eval'");
  });

  it("next.config rules: every route first, then the public pages (the later rule wins)", () => {
    const rules = headerRules({ supabaseUrl: "https://abc.supabase.co" });
    expect(rules[0].source).toBe("/:path*");
    const pubSources = rules.slice(1).map((r) => r.source);
    expect(pubSources).toEqual(["/:page(d|p|r|co|q)", "/:page(d|p|r|co|q)/:path*"]);
    for (const r of rules.slice(1)) expect(get(r.headers, "Content-Security-Policy")).not.toContain("'unsafe-eval'");
    // Same header keys in both sets, so the public set fully replaces the global one.
    expect(rules[1].headers.map((h) => h.key).sort()).toEqual(rules[0].headers.map((h) => h.key).sort());
  });

  it("allows Cloudflare Turnstile only when it's set up", () => {
    expect(contentSecurityPolicy({})).not.toContain("challenges.cloudflare.com");
    const csp = contentSecurityPolicy({ turnstile: true });
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  });
});
