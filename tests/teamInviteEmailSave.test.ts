// POST /api/team/invite-email saves the address on the invite (team_invites.email), as the caller, after the send.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const SB = "https://sb.example.co";
const RESEND = "https://api.resend.com/emails";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

describe("POST /api/team/invite-email saves the invite's email", () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  let calls: Call[];
  let patchStatus: number;
  let resendStatus: number;

  const req = (body: unknown) =>
    new Request("https://app.example.com/api/team/invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-token" },
      body: JSON.stringify(body),
    });
  const good = { code: "k7qm-xr4t-pa", email: " Sam@Example.com ", name: "Sam" };
  const patches = () => calls.filter((c) => c.method === "PATCH" && c.url.startsWith(`${SB}/rest/v1/team_invites`));

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    patchStatus = 204;
    resendStatus = 200;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "PinPlan <noreply@example.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "");
    vi.stubEnv("PINPLAN_APP_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init.method ?? "GET";
        const raw = init.body ? String(init.body) : "";
        let body: unknown = raw;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          /* keep text */
        }
        calls.push({ url, method, headers: Object.fromEntries(new Headers(init.headers).entries()), body });
        if (url.startsWith(`${SB}/auth/v1/user`)) return Response.json({ id: "u1" });
        if (url.startsWith(`${SB}/rest/v1/team_invites`)) {
          if (method === "PATCH") return new Response(null, { status: patchStatus });
          return Response.json([{ code: "K7QMXR4TPA", team_id: "t1", role: "tech", name: "", expires_at: future, used_by: null, revoked: false }]);
        }
        if (url.startsWith(`${SB}/rest/v1/teams`)) return Response.json([{ name: "Acme Low Voltage" }]);
        if (url.startsWith(`${SB}/rest/v1/team_members`)) return Response.json([{ name: "Dana", email: "dana@acme.com", role: "owner", team_id: "t1" }]);
        if (url === RESEND) return resendStatus === 200 ? Response.json({ id: "email_1" }) : Response.json({ name: "invalid_api_key" }, { status: resendStatus });
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads the invite with the caller's token, then the server saves the address and when it was emailed", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, savedEmail: true });
    const read = calls.find((c) => c.method === "GET" && c.url.startsWith(`${SB}/rest/v1/team_invites`))!;
    expect(read.headers.authorization).toBe("Bearer user-token");
    const [p] = patches();
    expect(p.url).toContain("code=eq.K7QMXR4TPA");
    // Only the invite that was read: same team, still open.
    expect(p.url).toContain("team_id=eq.t1");
    expect(p.url).toContain("used_by=is.null");
    expect(p.url).toContain("revoked=is.false");
    const body = p.body as { email: string; invite_emailed_at: string };
    expect(body.email).toBe("sam@example.com");
    expect(Date.now() - Date.parse(body.invite_emailed_at)).toBeLessThan(60_000);
    // invite_emailed_at is the server's: written with the service key (the apps can't set it).
    expect(p.headers.authorization).toBe("Bearer service-key");
  });

  it("without the service key, only the address is saved, as the caller", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req(good))).status).toBe(200);
    const [p] = patches();
    expect(p.body).toEqual({ email: "sam@example.com" });
    expect(p.headers.authorization).toBe("Bearer user-token");
  });

  it("still reports the send when saving fails (e.g. migration not run)", async () => {
    patchStatus = 400;
    const { POST } = await import("@/app/api/team/invite-email/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, savedEmail: false });
  });

  it("doesn't tie the invite to an address the email never reached", async () => {
    resendStatus = 403;
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req(good))).status).toBe(502);
    expect(patches()).toHaveLength(0);
  });
});
