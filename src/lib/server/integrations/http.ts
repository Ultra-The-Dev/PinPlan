// HTTP helpers shared by the OAuth providers (server-only): token requests, JSON API calls with one retry after a
// refresh, idempotency keys and content fingerprints.
import { createHash } from "node:crypto";
import { IntegrationError, type ProviderContext, type TokenSet } from "./types";

const TIMEOUT_MS = 20_000;

const inSeconds = (s: unknown, now: number) => (typeof s === "number" && Number.isFinite(s) && s > 0 ? new Date(now + s * 1000).toISOString() : null);

/** OAuth token endpoint (authorization_code or refresh_token), client id + secret as HTTP Basic auth. */
export async function tokenRequest(
  url: string,
  client: { id: string; secret: string },
  params: Record<string, string>,
  opts: { label: string; refreshTtlSeconds?: number; previousRefresh?: string | null },
): Promise<TokenSet> {
  const now = Date.now();
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new IntegrationError(`Couldn't reach ${opts.label} (${(e as Error).message}).`, 502, "provider_unreachable");
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const err = String(j.error ?? "");
    if (err === "invalid_grant")
      throw new IntegrationError(`${opts.label} needs to be connected again (the sign-in expired or was revoked).`, 409, "needs_reconnect", true);
    throw new IntegrationError(`${opts.label} sign-in failed (${r.status}${err ? `: ${err}` : ""}).`, r.status === 401 ? 401 : 502, "oauth_failed");
  }
  if (typeof j.access_token !== "string" || !j.access_token) throw new IntegrationError(`${opts.label} returned no access token.`, 502, "oauth_failed");
  return {
    accessToken: j.access_token,
    refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : (opts.previousRefresh ?? null),
    expiresAt: inSeconds(j.expires_in, now),
    refreshExpiresAt: inSeconds(j.x_refresh_token_expires_in, now) ?? (opts.refreshTtlSeconds ? inSeconds(opts.refreshTtlSeconds, now) : null),
  };
}

export interface ApiCall {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * A JSON API request with the connection's access token. On 401 it refreshes once and retries (the same
 * idempotency key goes with the retry, so it can't be applied twice).
 */
export async function apiJson<T>(ctx: ProviderContext, url: string, call: ApiCall, label: string, describeError: (status: number, body: unknown) => string): Promise<T> {
  const send = async (token: string) => {
    try {
      return await fetch(url, {
        method: call.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(call.body !== undefined ? { "Content-Type": "application/json" } : {}), ...call.headers },
        body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new IntegrationError(`Couldn't reach ${label} (${(e as Error).message}).`, 502, "provider_unreachable");
    }
  };
  let r = await send(await ctx.accessToken());
  if (r.status === 401) r = await send(await ctx.forceRefresh());
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 500);
  }
  if (!r.ok) {
    if (r.status === 401) throw new IntegrationError(`${label} refused the connection. Connect it again.`, 409, "needs_reconnect", true, data);
    if (r.status === 429) throw new IntegrationError(`${label} is busy (too many requests). Try again in a minute.`, 429, "rate_limited", false, data);
    throw new IntegrationError(describeError(r.status, data), r.status === 403 ? 403 : 502, "provider_error", false, data);
  }
  return data as T;
}

/** Same object → same JSON (keys sorted), for fingerprints. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Stable per owner + provider + document + content: QuickBooks requestid / Xero Idempotency-Key (UUID-shaped). */
export function idempotencyKey(parts: (string | null | undefined)[]): string {
  const h = sha256(parts.map((p) => p ?? "").join("|"));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Quantity and unit price that multiply to `amount` exactly (the accounting apps check qty × price = amount);
 * otherwise 1 × amount. `qty` is taken as positive; `amount` carries the sign.
 */
export function qtyPrice(qty: number, unitPrice: number, amount: number): { qty: number; price: number } {
  const q = Math.abs(qty);
  const p = Math.round(unitPrice * 10000) / 10000;
  if (q > 0 && Math.round(q * p * 100) === Math.round(amount * 100)) return { qty: q, price: p };
  return { qty: 1, price: amount };
}
