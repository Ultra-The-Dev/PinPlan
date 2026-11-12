// Server-side storage for the Billdu API key + secret, encrypted at rest (AES-256-GCM).
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

function key(): Buffer {
  const raw = process.env.PINPLAN_ENCRYPTION_KEY;
  if (!raw) throw new Error("PINPLAN_ENCRYPTION_KEY is not set on the server; it is required to store Billdu credentials.");
  return createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function saveBillduCreds(creds: StoredCreds) {
  await fs.mkdir(dataDir(), { recursive: true });
  const body = JSON.stringify({ v: 1, data: encrypt(JSON.stringify(creds)), savedAt: new Date().toISOString() });
  await fs.writeFile(credsFile(), body, { mode: 0o600 });
}

export async function deleteBillduCreds() {
  await fs.rm(credsFile(), { force: true });
}

export type CredsSource = "env" | "file" | null;

export async function loadBillduCreds(): Promise<{ creds: StoredCreds | null; source: CredsSource }> {
  if (process.env.BILLDU_API_KEY && process.env.BILLDU_API_SECRET)
    return { creds: { apiKey: process.env.BILLDU_API_KEY, apiSecret: process.env.BILLDU_API_SECRET }, source: "env" };
  try {
    const raw = JSON.parse(await fs.readFile(credsFile(), "utf8")) as { data: string };
    return { creds: JSON.parse(decrypt(raw.data)) as StoredCreds, source: "file" };
  } catch {
    return { creds: null, source: null };
  }
}

/** Safe-to-show hint of the key, e.g. "29…cda4". */
export function keyHint(apiKey: string) {
  return apiKey.length <= 8 ? "••••" : `${apiKey.slice(0, 2)}…${apiKey.slice(-4)}`;
}
