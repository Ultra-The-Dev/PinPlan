// Server-side storage for the Billdu API key + secret, encrypted at rest (AES-256-GCM).
// These are the server-wide ("single-company") credentials. Each company's own credentials live in
// team_secrets / user_secrets (see ./billduCreds.ts); the server-wide ones only serve the founder's company.
// Never import from client components.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface StoredCreds {
  apiKey: string;
  apiSecret: string;
}

function dataDir() {
  return process.env.PINPLAN_DATA_DIR || path.join(process.cwd(), ".data");
}
function credsFile() {
  return path.join(dataDir(), "billdu.json");
}

// ---- Encryption (AES-256-GCM) ----
//
// Ciphertext format: "k1.<iv>.<tag>.<data>" (base64 parts). "k1" is the key id: the payload was sealed with the
// current PINPLAN_ENCRYPTION_KEY in this format. Values written before key ids existed are "<iv>.<tag>.<data>" and
// still decrypt. To rotate the key: move the old value to PINPLAN_ENCRYPTION_KEY_PREVIOUS, set a new
// PINPLAN_ENCRYPTION_KEY, deploy. Reads try the current key, then the previous one; anything opened with the previous
// key (or in the old unprefixed format) reports `stale`, and the callers here re-encrypt it with the current key on
// the next read. Remove PINPLAN_ENCRYPTION_KEY_PREVIOUS once every stored secret has been read once (or re-saved).

/** Key id written in front of every new ciphertext. */
export const KEY_ID = "k1";

const deriveKey = (raw: string) => createHash("sha256").update(raw).digest();

function key(): Buffer {
  const raw = process.env.PINPLAN_ENCRYPTION_KEY;
  if (!raw) throw new Error("PINPLAN_ENCRYPTION_KEY is not set on the server; it is required to store Billdu credentials.");
  return deriveKey(raw);
}

function previousKey(): Buffer | null {
  const raw = process.env.PINPLAN_ENCRYPTION_KEY_PREVIOUS;
  return raw && raw !== process.env.PINPLAN_ENCRYPTION_KEY ? deriveKey(raw) : null;
}

/** Can this server encrypt secrets (PINPLAN_ENCRYPTION_KEY is set)? */
export function encryptionReady(): boolean {
  return !!process.env.PINPLAN_ENCRYPTION_KEY;
}

/**
 * AES-256-GCM. `aad` (additional authenticated data) binds the ciphertext to a context such as the owning team, so a
 * payload copied to another row fails to decrypt. Decrypt with the same `aad` that was used to encrypt.
 */
export function encrypt(plain: string, aad?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  if (aad) c.setAAD(Buffer.from(aad, "utf8"));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [KEY_ID, ...[iv, c.getAuthTag(), enc].map((b) => b.toString("base64"))].join(".");
}

function open(k: Buffer, parts: string[], aad?: string): string {
  const [iv, tag, enc] = parts.map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", k, iv);
  if (aad) d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export interface Decrypted {
  plain: string;
  /** Opened with PINPLAN_ENCRYPTION_KEY_PREVIOUS or written in the old format: re-encrypt with `encrypt()`. */
  stale: boolean;
}

/** Decrypt, saying whether the value should be re-encrypted with the current key. Throws when no key opens it. */
export function decryptDetailed(payload: string, aad?: string): Decrypted {
  const parts = payload.split(".");
  let body: string[];
  let legacy = false;
  if (parts.length === 4 && parts[0] === KEY_ID) body = parts.slice(1);
  else if (parts.length === 3) {
    body = parts;
    legacy = true;
  } else throw new Error("Unknown secret format.");
  try {
    return { plain: open(key(), body, aad), stale: legacy };
  } catch (e) {
    const prev = previousKey();
    if (!prev) throw e;
    return { plain: open(prev, body, aad), stale: true };
  }
}

export function decrypt(payload: string, aad?: string): string {
  return decryptDetailed(payload, aad).plain;
}

/** Does this stored value need re-encrypting with the current key (old format, or sealed with the previous key)? */
export function needsReencrypt(payload: string, aad?: string): boolean {
  try {
    return decryptDetailed(payload, aad).stale;
  } catch {
    return false;
  }
}

// ---- Optional database storage (Supabase), for hosts without a persistent disk such as Vercel ----
// Uses the service-role key server-side; the table has RLS enabled and no policies, so browsers can't read it.
const SECRET_NAME = "billdu";
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: `${url}/rest/v1/app_secrets`, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

async function dbRead(): Promise<string | null> {
  const d = db()!;
  const r = await fetch(`${d.url}?name=eq.${SECRET_NAME}&select=payload`, { headers: d.headers, cache: "no-store" });
  if (!r.ok) throw new Error(`Secret store read failed (${r.status}).`);
  const rows = (await r.json()) as { payload: string }[];
  return rows[0]?.payload ?? null;
}

export async function saveBillduCreds(creds: StoredCreds) {
  const payload = encrypt(JSON.stringify(creds));
  const d = db();
  if (d) {
    const r = await fetch(d.url, {
      method: "POST",
      headers: { ...d.headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ name: SECRET_NAME, payload, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`Secret store write failed (${r.status}).`);
    return;
  }
  await fs.mkdir(dataDir(), { recursive: true });
  const body = JSON.stringify({ v: 1, data: payload, savedAt: new Date().toISOString() });
  await fs.writeFile(credsFile(), body, { mode: 0o600 });
}

export async function deleteBillduCreds() {
  const d = db();
  if (d) {
    await fetch(`${d.url}?name=eq.${SECRET_NAME}`, { method: "DELETE", headers: d.headers });
    return;
  }
  await fs.rm(credsFile(), { force: true });
}

export type CredsSource = "env" | "file" | "database" | null;

/** Where saved credentials go on this server. */
export function storageKind(): "database" | "file" {
  return db() ? "database" : "file";
}

export async function loadBillduCreds(): Promise<{ creds: StoredCreds | null; source: CredsSource }> {
  if (process.env.BILLDU_API_KEY && process.env.BILLDU_API_SECRET)
    return { creds: { apiKey: process.env.BILLDU_API_KEY, apiSecret: process.env.BILLDU_API_SECRET }, source: "env" };
  if (db()) {
    const payload = await dbRead();
    if (!payload) return { creds: null, source: null };
    const d = decryptDetailed(payload);
    const creds = JSON.parse(d.plain) as StoredCreds;
    if (d.stale) await saveBillduCreds(creds).catch(() => undefined); // re-encrypt with the current key (best effort)
    return { creds, source: "database" };
  }
  try {
    const raw = JSON.parse(await fs.readFile(credsFile(), "utf8")) as { data: string };
    const d = decryptDetailed(raw.data);
    const creds = JSON.parse(d.plain) as StoredCreds;
    if (d.stale) await saveBillduCreds(creds).catch(() => undefined);
    return { creds, source: "file" };
  } catch {
    return { creds: null, source: null };
  }
}

/** Safe-to-show hint of the key, e.g. "29…cda4". */
export function keyHint(apiKey: string) {
  return apiKey.length <= 8 ? "••••" : `${apiKey.slice(0, 2)}…${apiKey.slice(-4)}`;
}
