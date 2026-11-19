// Shared helpers for the /api/billdu/* route handlers (server-only).
import { effectiveCreds, type BillduCaller } from "../server/billduCreds";
import { BillduClient, BillduError } from "./client";

export function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/** A Billdu client for the caller's own company (see billduCreds.ts), or the error response to send. */
export async function getClientOrError(caller: BillduCaller): Promise<BillduClient | Response> {
  let loaded;
  try {
    loaded = await effectiveCreds(caller);
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
  if (!loaded.creds) return jsonError("Billdu is not connected for your company. Add your Billdu API key and secret in Settings → Billdu.", 412, { code: "not_configured" });
  return new BillduClient(loaded.creds);
}

export function handleError(e: unknown) {
  if (e instanceof BillduError) {
    const status = e.status === 401 || e.status === 403 ? 401 : 502;
    return jsonError(e.message, status, { code: "billdu_error", billduStatus: e.status, details: e.body });
  }
  return jsonError((e as Error)?.message || "Unexpected error", 500);
}
