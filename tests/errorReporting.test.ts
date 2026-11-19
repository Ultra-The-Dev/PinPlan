import { describe, expect, it } from "vitest";
import { buildReport, isNoise, sanitizeUrl, scrubText } from "@/lib/errorReporting";

describe("error reporting privacy", () => {
  it("drops query strings and fragments from URLs", () => {
    expect(sanitizeUrl("https://app.example.com/p?t=secret-proposal-token#x")).toBe("https://app.example.com/p");
    expect(sanitizeUrl("https://app.example.com/#access_token=abc&refresh_token=def")).toBe("https://app.example.com/");
    expect(sanitizeUrl(null)).toBeNull();
  });

  it("scrubs tokens, keys and emails from messages and stacks", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const s = scrubText(`fetch https://x.supabase.co/rest/v1/jobs?id=eq.5&apikey=abc failed for bob@acme.com with ${jwt} Bearer abc.def sk_live_1234567890abcdef`);
    expect(s).toContain("https://x.supabase.co/rest/v1/jobs failed");
    expect(s).not.toContain("bob@acme.com");
    expect(s).not.toContain(jwt);
    expect(s).toContain("Bearer [redacted]");
    expect(s).not.toContain("sk_live_1234567890abcdef");
  });

  it("builds a bounded row for app_errors", () => {
    const err = new TypeError("x is undefined");
    const r = buildReport(err, "onerror", { big: "y".repeat(10_000) }, "https://a.b/project?id=1", "UA");
    expect(r.message).toBe("TypeError: x is undefined");
    expect(r.url).toBe("https://a.b/project");
    expect(r.platform).toBe("web");
    expect(r.context.kind).toBe("onerror");
    expect(JSON.stringify(r.context).length).toBeLessThan(8192);
    expect(buildReport("m".repeat(5000), "manual").message.length).toBeLessThanOrEqual(2000);
    expect(buildReport({ digest: "123" }, "boundary").context.digest).toBe("123");
  });

  it("ignores browser noise", () => {
    expect(isNoise("Script error.", null)).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.", null)).toBe(true);
    expect(isNoise("boom", "at chrome-extension://abc/x.js:1:1")).toBe(true);
    expect(isNoise("TypeError: boom", "at /_next/static/chunks/a.js:1:1")).toBe(false);
  });
});
