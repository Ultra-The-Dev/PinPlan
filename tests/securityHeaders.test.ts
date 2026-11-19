import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/securityHeaders";

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
