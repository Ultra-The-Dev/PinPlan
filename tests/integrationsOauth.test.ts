// OAuth plumbing for the accounting integrations: signed state, PKCE, token requests and the refresh
// compare-and-swap. Network and database are mocked.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection, Provider, TokenSet } from "@/lib/server/integrations/types";

beforeEach(() => {
  vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "test-encryption-key");
  vi.stubGlobal("fetch", vi.fn(async (u: unknown) => {
    throw new Error(`Unexpected network call: ${String(u)}`);
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/lib/server/integrations/store");
});

const owner = { kind: "team" as const, id: "00000000-0000-0000-0000-0000000000a1" };

describe("signed state", () => {
  it("round-trips, and is refused when tampered, expired, for another provider or signed with another key", async () => {
    const { signState, verifyState, STATE_TTL_MS } = await import("@/lib/server/integrations/state");
    const now = 1_800_000_000_000;
    const s = signState({ provider: "xero", owner, userId: "u1", nonce: "n".repeat(32) }, now);
    expect(verifyState(s, "xero", now + 1000)).toMatchObject({ p: "xero", o: "team", i: owner.id, u: "u1", n: "n".repeat(32) });
    expect(verifyState(s, "xero", now + STATE_TTL_MS + 1)).toBeNull();
    expect(verifyState(s, "quickbooks", now)).toBeNull();
    expect(verifyState(s.slice(0, -2) + "AA", "xero", now)).toBeNull();
    expect(verifyState(`${s}.extra`, "xero", now)).toBeNull();
    expect(verifyState("", "xero", now)).toBeNull();
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "another-key");
    expect(verifyState(s, "xero", now)).toBeNull();
  });

  it("refuses to sign without the encryption key", async () => {
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "");
    const { signState } = await import("@/lib/server/integrations/state");
    expect(() => signState({ provider: "xero", owner, userId: null, nonce: "x".repeat(32) })).toThrow(/PINPLAN_ENCRYPTION_KEY/);
  });

  it("PKCE challenge is the S256 of the verifier; nonces are random", async () => {
    const { pkcePair, newNonce } = await import("@/lib/server/integrations/state");
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(newNonce()).not.toBe(newNonce());
  });
});

describe("token requests", () => {
  it("parses tokens and expiry; invalid_grant means reconnect", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const form = new URLSearchParams(String(init.body));
        if (form.get("refresh_token") === "dead") return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: "a1", expires_in: 3600, x_refresh_token_expires_in: 100 });
      }),
    );
    const { tokenRequest } = await import("@/lib/server/integrations/http");
    const before = Date.now();
    const t = await tokenRequest("https://idp.test/token", { id: "cid", secret: "sec" }, { grant_type: "refresh_token", refresh_token: "r0" }, { label: "Test", previousRefresh: "r0" });
    expect(t.accessToken).toBe("a1");
    expect(t.refreshToken).toBe("r0"); // not rotated: keep the old one
    expect(new Date(t.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + 3600_000);
    expect(new Date(t.refreshExpiresAt!).getTime()).toBeLessThan(before + 200_000);
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    await expect(tokenRequest("https://idp.test/token", { id: "cid", secret: "sec" }, { grant_type: "refresh_token", refresh_token: "dead" }, { label: "Test" })).rejects.toMatchObject({ reconnect: true, code: "needs_reconnect" });
  });

  it("idempotency keys are stable for the same content and differ otherwise", async () => {
    const { idempotencyKey, stableJson } = await import("@/lib/server/integrations/http");
    expect(idempotencyKey(["a", "b"])).toBe(idempotencyKey(["a", "b"]));
    expect(idempotencyKey(["a", "b"])).not.toBe(idempotencyKey(["a", "c"]));
    expect(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});

describe("refresh with compare-and-swap", () => {
  const tokens = (access: string, expiresInMs: number): TokenSet => ({ accessToken: access, refreshToken: `r-${access}`, expiresAt: new Date(Date.now() + expiresInMs).toISOString(), refreshExpiresAt: null });
  const conn = (t: TokenSet, version: number): Connection => ({
    owner,
    provider: "quickbooks",
    status: "connected",
    tokens: t,
    tokenError: null,
    meta: { realmId: "1" },
    settings: {},
    version,
    connectedBy: null,
    connectedAt: null,
    lastSyncAt: null,
    lastError: null,
  });

  async function setup(store: { readConnection: () => Promise<Connection | null>; swapTokens: (...a: unknown[]) => Promise<boolean> }) {
    const mocks = {
      readConnection: vi.fn(store.readConnection),
      swapTokens: vi.fn(store.swapTokens),
      setConnectionStatus: vi.fn(async () => undefined),
      addEvent: vi.fn(async () => undefined),
      readLink: vi.fn(),
      saveLink: vi.fn(),
    };
    vi.doMock("@/lib/server/integrations/store", () => mocks);
    const { makeContext } = await import("@/lib/server/integrations/service");
    return { makeContext, mocks };
  }
  const provider = (refresh: (t: TokenSet) => Promise<TokenSet>) => ({ id: "quickbooks", label: "QuickBooks Online", refresh }) as unknown as Provider;
  const ic = { caller: { mode: "team" } as never, owner, userId: "u1" };

  it("uses a fresh token as is", async () => {
    const { makeContext, mocks } = await setup({ readConnection: async () => null, swapTokens: async () => true });
    const ctx = makeContext(provider(async () => tokens("never", 1)), ic, conn(tokens("fresh", 3600_000), 1));
    expect(await ctx.accessToken()).toBe("fresh");
    expect(mocks.readConnection).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and stores it only if the version is unchanged", async () => {
    const stale = conn(tokens("old", 10_000), 3);
    const { makeContext, mocks } = await setup({ readConnection: async () => stale, swapTokens: async () => true });
    const refresh = vi.fn(async () => tokens("new", 3600_000));
    const ctx = makeContext(provider(refresh), ic, stale);
    expect(await ctx.accessToken()).toBe("new");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mocks.swapTokens).toHaveBeenCalledWith(owner, "quickbooks", 3, expect.objectContaining({ accessToken: "new" }));
    expect(ctx.connection?.version).toBe(4);
  });

  it("losing the race uses the winner's stored token", async () => {
    const stale = conn(tokens("old", 10_000), 3);
    let reads = 0;
    const { makeContext } = await setup({
      readConnection: async () => (++reads === 1 ? stale : conn(tokens("winner", 3600_000), 4)),
      swapTokens: async () => false,
    });
    const ctx = makeContext(provider(async () => tokens("loser", 3600_000)), ic, stale);
    expect(await ctx.accessToken()).toBe("winner");
  });

  it("skips its own refresh when another request already refreshed", async () => {
    const stale = conn(tokens("old", 10_000), 3);
    const { makeContext, mocks } = await setup({ readConnection: async () => conn(tokens("theirs", 3600_000), 4), swapTokens: async () => true });
    const refresh = vi.fn(async () => tokens("mine", 3600_000));
    const ctx = makeContext(provider(refresh), ic, stale);
    expect(await ctx.forceRefresh()).toBe("theirs");
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.swapTokens).not.toHaveBeenCalled();
  });

  it("invalid_grant marks the connection needs_reconnect", async () => {
    const stale = conn(tokens("old", 10_000), 3);
    const { makeContext, mocks } = await setup({ readConnection: async () => stale, swapTokens: async () => true });
    const { IntegrationError } = await import("@/lib/server/integrations/types");
    const ctx = makeContext(
      provider(async () => {
        throw new IntegrationError("dead", 409, "needs_reconnect", true);
      }),
      ic,
      stale,
    );
    await expect(ctx.accessToken()).rejects.toMatchObject({ reconnect: true });
    expect(mocks.setConnectionStatus).toHaveBeenCalledWith(owner, "quickbooks", expect.objectContaining({ status: "needs_reconnect" }));
  });

  it("a connection marked needs_reconnect isn't used", async () => {
    const { makeContext } = await setup({ readConnection: async () => null, swapTokens: async () => true });
    const ctx = makeContext(provider(async () => tokens("x", 1)), ic, { ...conn(tokens("fresh", 3600_000), 1), status: "needs_reconnect" });
    await expect(ctx.accessToken()).rejects.toMatchObject({ code: "needs_reconnect" });
  });
});

describe("tokens at rest", () => {
  it("are bound to the owner and provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    const { encrypt, decrypt } = await import("@/lib/server/secrets");
    const { tokenAad } = await import("@/lib/server/integrations/store");
    const payload = encrypt("secret-token", tokenAad(owner, "xero"));
    expect(decrypt(payload, tokenAad(owner, "xero"))).toBe("secret-token");
    expect(() => decrypt(payload, tokenAad({ kind: "team", id: "00000000-0000-0000-0000-0000000000a2" }, "xero"))).toThrow();
    expect(() => decrypt(payload, tokenAad(owner, "quickbooks"))).toThrow();
  });
});
