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
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
