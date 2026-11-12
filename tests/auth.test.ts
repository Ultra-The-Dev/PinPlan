import { afterEach, describe, expect, it, vi } from "vitest";
import { authMode, requireUser } from "@/lib/server/auth";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api/billdu/send", { method: "POST", headers });

describe("API route auth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is open when neither Supabase nor an access code is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    expect(authMode()).toBe("open");
    expect((await requireUser(req())).ok).toBe(true);
  });

  it("requires the access code when PINPLAN_ACCESS_CODE is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    expect(authMode()).toBe("access_code");
    const denied = await requireUser(req());
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(401);
    expect((await requireUser(req({ "x-pinplan-access": "wrong" }))).ok).toBe(false);
    expect((await requireUser(req({ "x-pinplan-access": "s3cret" }))).ok).toBe(true);
  });

  it("requires a Supabase session when Supabase is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(authMode()).toBe("supabase");
    expect((await requireUser(req())).ok).toBe(false);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await requireUser(req({ authorization: "Bearer tok" }));
    expect(r.ok && r.userId).toBe("user-1");
    vi.unstubAllGlobals();
  });
});
