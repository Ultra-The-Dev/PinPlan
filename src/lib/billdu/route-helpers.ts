// Shared helpers for the /api/billdu/* route handlers (server-only).
import { loadBillduCreds } from "../server/secrets";
import { BillduClient, BillduError } from "./client";

export function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function getClientOrError(): Promise<BillduClient | Response> {
  let loaded;
  try {
    loaded = await loadBillduCreds();
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
  if (!loaded.creds) return jsonError("Billdu is not connected. Add your API key and secret in Settings → Billdu.", 412, { code: "not_configured" });
  return new BillduClient(loaded.creds);
}

export function handleError(e: unknown) {
  if (e instanceof BillduError) {
    const status = e.status === 401 || e.status === 403 ? 401 : 502;
    return jsonError(e.message, status, { code: "billdu_error", billduStatus: e.status, details: e.body });
  }
  return jsonError((e as Error)?.message || "Unexpected error", 500);
}
