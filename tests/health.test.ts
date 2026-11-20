import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_PRODUCTION_VARS, REQUIRED_SCHEMA_VERSION } from "@/lib/server/envCheck";
import { buildServerReport, MAX_SERVER_REPORTS_PER_WINDOW, reportServerError, resetServerErrorState, shouldSend } from "@/lib/server/serverErrors";

const get = (headers: Record<string, string> = {}) => new Request("http://x/api/health", { headers });

/** Supabase answers: the teams probe, and schema_version() (a value, or a status code). */
function stubSupabase(schema: unknown | { status: number }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/rest/v1/rpc/schema_version")) {
        if (schema && typeof schema === "object" && "status" in schema) return new Response("{}", { status: (schema as { status: number }).status });
        return Response.json(schema);
      }
      if (url.includes("/rest/v1/teams")) return new Response("[]", { status: 200 });
      return new Response("", { status: 404 });
    }),
  );
  return calls;
}

function fullProductionEnv() {
  for (const n of REQUIRED_PRODUCTION_VARS) vi.stubEnv(n, n === "PINPLAN_APP_URL" ? "https://app.example.com" : `secret-${n}`);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
  vi.stubEnv("VERCEL_ENV", "production");
}

describe("health endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never says a server is open (unprotected), and hides config from everyone on an open production server", async () => {
    const { GET } = await import("@/app/api/health/route");
    for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "PINPLAN_ACCESS_CODE", "VERCEL_ENV"]) vi.stubEnv(n, "");
    const dev = await (await GET(get())).json();
    expect(dev).not.toHaveProperty("authMode");
    expect(JSON.stringify(dev)).not.toContain("open");
    expect(dev.authorized).toBe(true); // local development: the config summary helps
    vi.stubEnv("VERCEL_ENV", "production");
    const r = await GET(get());
    const prod = await r.json();
    expect(r.status).toBe(503);
    expect(prod.authorized).toBe(false);
    expect(prod).not.toHaveProperty("config");
    expect(prod.missingConfig).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]));
  });

  it("answers 503 in production with the names (not values) of missing settings", async () => {
    const { GET } = await import("@/app/api/health/route");
    fullProductionEnv();
    stubSupabase(REQUIRED_SCHEMA_VERSION);
    const good = await GET(get());
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ ok: true, app: "pinplan", authMode: "supabase", authorized: false, database: "ok" });

    vi.stubEnv("STRIPE_PRICE_SEAT", "");
    vi.stubEnv("EMAIL_FROM", "");
    const bad = await GET(get());
    expect(bad.status).toBe(503);
    const body = await bad.json();
    expect(body).toMatchObject({ ok: false, missingConfig: ["STRIPE_PRICE_SEAT", "EMAIL_FROM"] });
    expect(JSON.stringify(body)).not.toContain("secret-");
  });

  it("preview deployments may be incomplete", async () => {
    const { GET } = await import("@/app/api/health/route");
    fullProductionEnv();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    stubSupabase(REQUIRED_SCHEMA_VERSION);
    expect((await GET(get())).status).toBe(200);
  });

  it("answers 503 when the database schema is behind the code (or schema_version() is missing)", async () => {
    const { GET } = await import("@/app/api/health/route");
    fullProductionEnv();
    stubSupabase("20261121020000_ops");
    const r = await GET(get());
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, database: "ok", schema: "behind", schemaRequired: REQUIRED_SCHEMA_VERSION });
    stubSupabase({ status: 404 });
    expect((await GET(get())).status).toBe(503);
    // A flaky or odd answer is not a failure.
    stubSupabase({ status: 500 });
    expect((await GET(get())).status).toBe(200);
  });

  it("reports billing, email and app address as yes/no, with the names of missing Stripe settings", async () => {
    const { GET } = await import("@/app/api/health/route");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("EMAIL_FROM", "PinPlan <hello@example.com>");
    vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
    const me = await (await GET(get({ "x-pinplan-access": "s3cret" }))).json();
    expect(me.config).toMatchObject({ stripe: false, email: true, appUrl: true });
    expect(me.config.stripeMissing).toContain("STRIPE_WEBHOOK_SECRET");
    expect(JSON.stringify(me)).not.toMatch(/sk_test_x|re_x|hello@example/);
  });

  it("tells only single-company callers about the server-wide Billdu account, never a signed-in customer", async () => {
    const { GET } = await import("@/app/api/health/route");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "1"); // a single-company server that still accepts the code
    vi.stubEnv("BILLDU_API_KEY", "k");
    vi.stubEnv("BILLDU_API_SECRET", "s");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/auth/v1/user")) return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
        if (url.endsWith("/rpc/schema_version")) return Response.json(REQUIRED_SCHEMA_VERSION);
        return new Response("[]", { status: 200 });
      }),
    );
    const customer = await (await GET(get({ authorization: "Bearer user-token" }))).json();
    expect(customer.authorized).toBe(true);
    expect(customer).not.toHaveProperty("billdu");
    expect(customer.config).not.toHaveProperty("billdu");
    expect(customer.config).toMatchObject({ schema: "ok" });
    const office = await (await GET(get({ "x-pinplan-access": "s3cret" }))).json();
    expect(office).toMatchObject({ authorized: true, billdu: true });
  });
});

describe("server error capture", () => {
  beforeEach(() => resetServerErrorState());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scrubs the message and stack, drops the query string, and marks the platform 'server'", () => {
    const e = new Error("Stripe failed for bob@acme.com with sk_live_1234567890abcdef");
    const row = buildServerReport(e, { where: "billing webhook", path: "/api/billing/webhook?token=abc", method: "POST", userId: "00000000-0000-0000-0000-000000000001", extra: { eventType: "invoice.paid" } });
    expect(row.platform).toBe("server");
    expect(row.url).toBe("/api/billing/webhook");
    expect(row.message).not.toMatch(/bob@acme\.com|sk_live_/);
    expect(row.context).toMatchObject({ kind: "server", where: "billing webhook", method: "POST", eventType: "invoice.paid" });
    expect(row.user_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(buildServerReport(e, { where: "x", userId: "not-a-uuid" })).not.toHaveProperty("user_id");
  });

  it("caps reports per instance and suppresses repeats", () => {
    expect(shouldSend("a", 1000)).toBe(true);
    expect(shouldSend("a", 2000)).toBe(false); // same error within a minute
    expect(shouldSend("a", 62_000)).toBe(true);
    resetServerErrorState();
    let sent = 0;
    for (let i = 0; i < MAX_SERVER_REPORTS_PER_WINDOW + 10; i++) if (shouldSend(`k${i}`, 1000)) sent++;
    expect(sent).toBe(MAX_SERVER_REPORTS_PER_WINDOW);
    expect(shouldSend("later", 1000 + 5 * 60_000)).toBe(true); // next window
  });

  it("writes to app_errors with the service key, retries without a deleted user, and never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const bodies: Record<string, unknown>[] = [];
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return new Response("", { status: body.user_id ? 409 : 201 });
    });
    vi.stubGlobal("fetch", f);
    await reportServerError(new Error("db down"), { where: "account delete", userId: "00000000-0000-0000-0000-000000000002" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toBe("https://db.example.supabase.co/rest/v1/app_errors");
    expect(new Headers(f.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer service-key");
    expect(bodies[0]).toMatchObject({ platform: "server", user_id: "00000000-0000-0000-0000-000000000002" });
    expect(bodies[1]).not.toHaveProperty("user_id");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await expect(reportServerError(new Error("other"), { where: "x" })).resolves.toBeUndefined();
  });

  it("only logs when the service key isn't set", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await reportServerError(new Error("boom"), { where: "x" });
    expect(f).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[server error] x: boom");
  });
});
