// GET /api/config: the native apps' public cloud settings. Only an allowlist of public values, never a secret.
import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns exactly the public keys, and no secret values", async () => {
    const secrets = {
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      PINPLAN_ENCRYPTION_KEY: "encryption-secret",
      PINPLAN_ENCRYPTION_KEY_PREVIOUS: "old-encryption-secret",
      PINPLAN_ACCESS_CODE: "access-code-secret",
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_secret",
      RESEND_API_KEY: "re_secret",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      BILLDU_API_KEY: "billdu-key-secret",
      BILLDU_API_SECRET: "billdu-secret",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
    };
    for (const [k, v] of Object.entries(secrets)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    const { GET } = await import("@/app/api/config/route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(["app", "supabaseAnonKey", "supabaseUrl"]);
    expect(body).toEqual({ app: "pinplan", supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "public-anon-key" });
    for (const v of Object.values(secrets)) expect(text).not.toContain(v);
  });

  it("answers empty strings when the cloud isn't set up", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { GET } = await import("@/app/api/config/route");
    expect(await (await GET()).json()).toEqual({ app: "pinplan", supabaseUrl: "", supabaseAnonKey: "" });
  });
});
