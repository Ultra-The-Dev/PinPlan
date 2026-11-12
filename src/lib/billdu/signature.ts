import { createHmac } from "node:crypto";

/** Sort an object's top-level keys (PHP ksort). */
export function ksort<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out as T;
}

/**
 * Billdu request signature, identical to the official billdu-client:
 * base64(HMAC-SHA512(JSON.stringify(ksort({...body, apiKey, timestamp})), apiSecret)).
 */
export function createSignature(body: Record<string, unknown> | undefined, apiKey: string, apiSecret: string, timestamp: number): string {
  const toSign = ksort({ ...(body ?? {}), apiKey, timestamp });
  return createHmac("sha512", apiSecret).update(Buffer.from(JSON.stringify(toSign), "utf-8")).digest("base64");
}
