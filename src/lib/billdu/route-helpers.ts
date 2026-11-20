// Shared helpers for the /api/billdu/* route handlers (server-only).
//
// Error responses carry a fixed, plain message and a `code`. What Billdu or the database actually said (status
// codes, response bodies, table names) goes to the server log, and into the response only in development or on a
// single-company server (whoever reads it there also runs the server).
import { authMode } from "../server/auth";
import { CredsError, effectiveCreds, NOT_CONNECTED, type BillduCaller } from "../server/billduCreds";
import { BillduClient, BillduError } from "./client";

export function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Show error details to this caller? Only in development and on single-company servers (no accounts). An access-code
 * caller on a server with accounts is not the person running the server, so they get the plain message only.
 */
export function showDetails(caller?: BillduCaller | null): boolean {
  return process.env.NODE_ENV === "development" || (caller?.mode === "single_company" && authMode() !== "supabase");
}

/** The response for a failure while loading, saving or removing credentials. */
export function credsErrorResponse(e: unknown, caller?: BillduCaller | null): Response {
  if (e instanceof CredsError) {
    if (e.detail) console.error(`[billdu] ${e.code}: ${e.detail}`);
    return jsonError(e.message, 500, { code: e.code, ...(showDetails(caller) && e.detail ? { details: e.detail } : {}) });
  }
  console.error("[billdu] credentials error", e);
  return jsonError("Something went wrong with your Billdu connection. Try again in a minute.", 500, {
    code: "server_error",
    ...(showDetails(caller) ? { details: (e as Error)?.message ?? String(e) } : {}),
  });
}

/** A Billdu client for the caller's own company (see billduCreds.ts), or the error response to send. */
export async function getClientOrError(caller: BillduCaller): Promise<BillduClient | Response> {
  let loaded;
  try {
    loaded = await effectiveCreds(caller);
  } catch (e) {
    return credsErrorResponse(e, caller);
  }
  if (!loaded.creds) return jsonError(NOT_CONNECTED, 412, { code: "not_configured" });
  return new BillduClient(loaded.creds);
}

/** The response for a failed Billdu call (or anything else that went wrong while talking to it). */
export function handleError(e: unknown, caller?: BillduCaller | null) {
  const details = showDetails(caller);
  if (e instanceof BillduError) {
    if (e.status === 401 || e.status === 403)
      return jsonError("Billdu didn't accept your API key and secret. Check them in Settings → Connected apps → Billdu.", 401, {
        code: "billdu_auth",
        billduStatus: e.status,
        ...(details ? { details: e.message, body: e.body } : {}),
      });
    console.error("[billdu]", e.message);
    return jsonError(
      e.status === 429 ? "Billdu is busy right now. Try again in a minute." : `Billdu couldn't finish the request (error ${e.status}). Try again in a minute.`,
      502,
      { code: "billdu_error", billduStatus: e.status, ...(details ? { details: e.message, body: e.body } : {}) },
    );
  }
  console.error("[billdu] unexpected error", e);
  return jsonError("Something went wrong talking to Billdu. Try again in a minute.", 500, {
    code: "server_error",
    ...(details ? { details: (e as Error)?.message ?? String(e) } : {}),
  });
}
