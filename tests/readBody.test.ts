// Request bodies are read with a size limit on the public routes: 413 on a big Content-Length before reading, and the
// stream is cut off past the limit when the length is missing or lies.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBytesLimited, readJsonLimited, readTextLimited } from "@/lib/server/readBody";

/** A POST whose body arrives as a stream in `chunks` pieces of `size` bytes, with no Content-Length. */
function streamed(chunks: number, size: number, onPull?: () => void): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (sent++ >= chunks) return c.close();
      c.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return new Request("http://x/api/test", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readBody", () => {
  it("reads small bodies as text and JSON", async () => {
    const r = await readJsonLimited<{ a: number }>(new Request("http://x", { method: "POST", body: JSON.stringify({ a: 1 }) }), 1024);
    expect(r).toEqual({ ok: true, value: { a: 1 } });
    const t = await readTextLimited(new Request("http://x", { method: "POST", body: "héllo" }), 1024);
    expect(t).toEqual({ ok: true, text: "héllo" });
    expect(await readTextLimited(new Request("http://x", { method: "POST" }), 10)).toEqual({ ok: true, text: "" });
  });

  it("answers 413 when Content-Length is over the limit, without reading", async () => {
    const pulled = vi.fn();
    const req = streamed(1, 10, pulled);
    const withLength = new Request(req, { headers: { "content-length": "999999" } });
    const r = await readTextLimited(withLength, 1000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(413);
    expect(r.response.status).toBe(413);
    expect((await r.response.json()).code).toBe("payload_too_large");
  });

  it("stops reading a stream with no Content-Length once it passes the limit", async () => {
    let pulls = 0;
    const r = await readBytesLimited(
      streamed(10_000, 1024, () => pulls++),
      8 * 1024,
    );
    expect(r).toBeNull();
    // It gave up after about 8 KB, not after the whole 10 MB.
    expect(pulls).toBeLessThan(20);
    expect((await readTextLimited(streamed(3, 100), 300)).ok).toBe(true);
    expect((await readTextLimited(streamed(4, 100), 300)).ok).toBe(false);
  });

  it("answers 400 for a body that isn't JSON", async () => {
    const r = await readJsonLimited(new Request("http://x", { method: "POST", body: "{nope" }), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

// ---------------- the routes that use it ----------------

const SB = "https://sb.example.co";
const TOKEN = "abcdefghijklmnopqrstuvwx";
const big = (bytes: number) => "x".repeat(bytes);
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.5", ...headers }, body });

describe("public routes refuse oversized bodies before touching anything", () => {
  let calls: string[];
  beforeEach(() => {
    vi.resetModules();
    calls = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Northpin <noreply@example.com>");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        calls.push(String(input instanceof Request ? input.url : input));
        return new Response("[]", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("RFI answers: 413 past 64 KB", async () => {
    const { POST } = await import("@/app/api/rfis/public/route");
    const r = await POST(post("/api/rfis/public", JSON.stringify({ t: TOKEN, answer: big(70 * 1024), name: "Pat" })));
    expect(r.status).toBe(413);
    expect(calls).toEqual([]);
    // Junk JSON is still a 400.
    expect((await POST(post("/api/rfis/public", "null"))).status).not.toBe(500);
  });

  it("change order answers: 413 past 600 KB (a signature is at most 200 KB)", async () => {
    const { POST } = await import("@/app/api/change-orders/public/route");
    const r = await POST(post("/api/change-orders/public", JSON.stringify({ t: TOKEN, decision: "approve", name: "Pat", signature: big(700 * 1024) })));
    expect(r.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("notify routes: 413 past 64 KB", async () => {
    for (const path of ["/api/notify/document-response", "/api/notify/proposal-response"]) {
      vi.resetModules();
      const { POST } = await import(`@/app/${path.slice(1)}/route`);
      const r: Response = await POST(post(path, JSON.stringify({ token: TOKEN, pad: big(80 * 1024) })));
      expect(r.status, path).toBe(413);
      // A declared length alone is enough to refuse.
      const declared: Response = await POST(post(path, JSON.stringify({ token: TOKEN }), { "content-length": String(10 * 1024 * 1024) }));
      expect(declared.status, path).toBe(413);
    }
    expect(calls).toEqual([]);
  });

  it("Stripe webhook: 413 past 1 MB, before the signature is checked", async () => {
    for (const n of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_BASE", "STRIPE_PRICE_SEAT"]) vi.stubEnv(n, `test-${n}`);
    const { POST } = await import("@/app/api/billing/webhook/route");
    const r = await POST(post("/api/billing/webhook", big(1024 * 1024 + 10), { "stripe-signature": "t=1,v1=abc" }));
    expect(r.status).toBe(413);
    // A normal-sized body still reaches the signature check (and fails it).
    const small = await POST(post("/api/billing/webhook", "{}", { "stripe-signature": "t=1,v1=abc" }));
    expect(small.status).toBe(400);
    expect((await small.json()).code).toBe("bad_signature");
    expect(calls).toEqual([]);
  });
});
