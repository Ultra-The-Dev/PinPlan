// OAuth sign-in state (server-only): an HMAC-signed, 10-minute token naming who started the sign-in, plus a nonce that
// is stored (with the PKCE verifier) in integration_oauth_states and deleted on first use, so a state works once.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Owner, ProviderId } from "./types";

export const STATE_TTL_MS = 10 * 60_000;

export interface StatePayload {
  /** Provider. */
  p: ProviderId;
  /** Owner kind and id. */
  o: Owner["kind"];
  i: string;
  /** Who started it. */
  u: string | null;
  /** Single-use nonce (the integration_oauth_states key). */
  n: string;
  /** Expiry, ms since the epoch. */
  e: number;
}

function stateKey(): Buffer {
  const raw = process.env.PINPLAN_ENCRYPTION_KEY;
  if (!raw) throw new Error("PINPLAN_ENCRYPTION_KEY is not set on the server; it is required to connect accounting apps.");
  // A key of its own, derived from the encryption key, so a state signature can never be used as anything else.
  return createHash("sha256").update(`pinplan:integration-state:${raw}`).digest();
}

const mac = (body: string) => createHmac("sha256", stateKey()).update(body).digest("base64url");

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function signState(input: { provider: ProviderId; owner: Owner; userId: string | null; nonce: string }, now = Date.now()): string {
  const payload: StatePayload = { p: input.provider, o: input.owner.kind, i: input.owner.id, u: input.userId, n: input.nonce, e: now + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The state's payload when the signature is good, it is for this provider and it hasn't expired. Else null. */
export function verifyState(state: string | null | undefined, provider: ProviderId, now = Date.now()): StatePayload | null {
  if (!state || state.length > 2000) return null;
  const [body, sig, extra] = state.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let p: StatePayload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
  if (!p || p.p !== provider || (p.o !== "team" && p.o !== "user") || typeof p.i !== "string" || typeof p.n !== "string" || typeof p.e !== "number") return null;
  if (p.e < now) return null;
  return p;
}

/** PKCE (RFC 7636, S256): the verifier stays on the server; the challenge goes to the provider. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

// ---------------------------------------------------------------- binding the sign-in to the browser
//
// The signed state alone says who started a sign-in, not which browser will finish it: someone could start one for
// their own company and get another person's browser to complete it (login CSRF). So the sign-in is tied to cookies:
//   1. POST /connect (the signed-in office user's fetch) sets pp_oauth_start on that browser and stores its sha256 with
//      the nonce; it answers with a GET /connect?ticket=… URL.
//   2. GET /connect (a top-level navigation from that browser) checks pp_oauth_start, swaps it for pp_oauth (scoped to
//      the callback path) and sends the browser to the provider with a 303.
//   3. GET /callback refuses unless pp_oauth hashes to the stored value, then clears it.

export const OAUTH_COOKIE = "pp_oauth";
export const START_COOKIE = "pp_oauth_start";
export const COOKIE_MAX_AGE_S = 600;
/** The GET /connect link is used right away by the browser that asked for it. */
export const TICKET_TTL_MS = 2 * 60_000;

export const newCookieValue = () => randomBytes(32).toString("base64url");
export const cookieHash = (value: string) => createHash("sha256").update(value).digest("hex");

/** `Set-Cookie` for one of the sign-in cookies (Max-Age 0 clears it). */
export function oauthCookie(name: string, value: string, path: string, maxAge = COOKIE_MAX_AGE_S): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;
}

/** A cookie from the request's Cookie header (sign-in cookie values are base64url, so no decoding). */
export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{16,128}$/.test(v) ? v : null;
    }
  }
  return null;
}

const ticketMac = (body: string) => createHmac("sha256", stateKey()).update(`connect-ticket:${body}`).digest("base64url");

/** The GET /connect ticket: which pending sign-in (nonce) for which provider, valid for two minutes. */
export function signTicket(provider: ProviderId, nonce: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: provider, n: nonce, e: now + TICKET_TTL_MS }), "utf8").toString("base64url");
  return `${body}.${ticketMac(body)}`;
}

export function verifyTicket(ticket: string | null | undefined, provider: ProviderId, now = Date.now()): { nonce: string } | null {
  if (!ticket || ticket.length > 1000) return null;
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(ticketMac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p?: string; n?: unknown; e?: unknown };
    if (t.p !== provider || typeof t.n !== "string" || typeof t.e !== "number" || t.e < now) return null;
    return { nonce: t.n };
  } catch {
    return null;
  }
}
