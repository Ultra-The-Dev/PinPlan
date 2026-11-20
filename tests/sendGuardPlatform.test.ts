// The platform-wide email allowance and address normalisation (20261125000600_email_signup_abuse.sql, sendGuard.ts),
// with fetch mocked: no network, no real keys, no real addresses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "https://sb.example.co";
let reserve: unknown;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  reserve = { ok: true, id: 1, trial: false };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === `${SB}/rest/v1/rpc/email_send_reserve`) return Response.json(reserve);
      return new Response("not found", { status: 404 });
    }),
  );
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const load = () => import("@/lib/server/sendGuard");

describe("normalizeEmail / recipientHash", () => {
  it("counts one mailbox however it is written", async () => {
    const { normalizeEmail, recipientHash } = await load();
    expect(normalizeEmail(" A.B+promo@GoogleMail.com ")).toBe("ab@gmail.com");
    expect(normalizeEmail("a.b@gmail.com")).toBe("ab@gmail.com");
    expect(normalizeEmail("Sam+x@Acme.com")).toBe("sam@acme.com");
    // Dots matter outside Gmail; a leading "+" is not a tag.
    expect(normalizeEmail("s.am@acme.com")).toBe("s.am@acme.com");
    expect(normalizeEmail("+x@acme.com")).toBe("+x@acme.com");
    expect(recipientHash("a.b+1@gmail.com")).toBe(recipientHash("AB@gmail.com"));
    expect(recipientHash("sam+news@acme.com")).toBe(recipientHash("sam@acme.com"));
    expect(recipientHash("s.am@acme.com")).not.toBe(recipientHash("sam@acme.com"));
  });

  it("matches public.email_hash() in the database (supabase/tests/email_guard_test.sql checks the same value)", async () => {
    const { recipientHash } = await load();
    expect(recipientHash("a.b+1@gmail.com")).toBe("86ca2ad27318696b41cfc650acfad97bb32194c43e119e465a16359ea74c7105");
  });
});

describe("the platform cap", () => {
  it("a trial past its share gets a fixed, trial-worded refusal", async () => {
    reserve = { ok: false, reason: "platform_cap", trial: true };
    const { reserveSend } = await load();
    const r = await reserveSend("u1", "document", "client@example.com");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(429);
    const j = await r.response.json();
    expect(j.code).toBe("platform_email_limit");
    expect(j.error).toMatch(/free trials/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("platform email cap reached (trial share)"));
  });

  it("invites say to share the link instead", async () => {
    reserve = { ok: false, reason: "platform_cap", trial: false };
    const { reserveSend } = await load();
    const r = await reserveSend("u1", "invite", "crew@example.com");
    if (r.ok) throw new Error("expected a refusal");
    expect((await r.response.json()).error).toMatch(/Copy link/);
  });

  it("logs a warning when the platform passes the alert level, and still sends", async () => {
    reserve = { ok: true, id: 5, trial: false, platform_alert: true };
    const { reserveSend } = await load();
    const r = await reserveSend("u1", "document", "client@example.com");
    expect(r.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("alert level"));
    // Never the address.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("client@example.com");
  });

  it("no warning below it", async () => {
    const { reserveSend } = await load();
    expect((await reserveSend("u1", "document", "client@example.com")).ok).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
