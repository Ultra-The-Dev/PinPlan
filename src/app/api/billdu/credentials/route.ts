// Settings → Billdu: each company's own Billdu API key + secret (see src/lib/server/billduCreds.ts for who uses what).
// Responses never contain the secret: only whether it's set, a hint of the key, and who saved / tested it when.
import {
  allowsServerCreds,
  companyStorageReady,
  deleteOwnCreds,
  describeUser,
  mayChangeServerCreds,
  readOwnCreds,
  resolveBillduCaller,
  saveOwnCreds,
  type BillduCaller,
} from "@/lib/server/billduCreds";
import { requirePaidOrTrial } from "@/lib/server/planGate";
import { clientIp, durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { deleteBillduCreds, encryptionReady, keyHint, loadBillduCreds, saveBillduCreds, storageKind } from "@/lib/server/secrets";
import { credsErrorResponse, jsonError } from "@/lib/billdu/route-helpers";

const noStore = { "Cache-Control": "no-store" };
const SAVE_LIMIT = { limit: 20, windowMs: 10 * 60_000 };

async function status(caller: BillduCaller) {
  const own = caller.mode === "single_company" ? null : await readOwnCreds(caller.owner);
  // Other companies never learn anything about the server-wide credentials.
  const server = allowsServerCreds(caller) ? await loadBillduCreds().catch(() => ({ creds: null, source: null })) : null;
  const ready = caller.mode === "single_company" ? { ok: true, reason: null, code: null } : companyStorageReady();
  const source = own?.creds && caller.mode !== "single_company" ? caller.owner.kind : !own && server?.creds ? server.source : null;
  return {
    mode: caller.mode,
    teamName: caller.mode === "team" ? caller.teamName : null,
    configured: !!source,
    source,
    keyHint: own ? own.keyHint : server?.creds ? keyHint(server.creds.apiKey) : null,
    own: own
      ? {
          keyHint: own.keyHint,
          updatedAt: own.updatedAt,
          updatedBy: await describeUser(caller, own.updatedBy),
          lastTest: own.lastTest,
          error: own.error,
        }
      : null,
    server: server
      ? {
          configured: !!server.creds,
          source: server.source,
          keyHint: server.creds ? keyHint(server.creds.apiKey) : null,
          removable: server.source === "file" || server.source === "database",
        }
      : null,
    canMoveServer: caller.mode === "team" && caller.founder && !!server?.creds && !own,
    // Whether this caller may save / remove the server-wide credentials (single-company servers and the founder).
    canChangeServer: mayChangeServerCreds(caller),
    encryptionKeySet: encryptionReady(),
    storage: caller.mode === "single_company" ? storageKind() : "company",
    storageReady: ready.ok,
    storageMessage: ready.reason,
    storageCode: ready.code,
  };
}

export async function GET(request: Request) {
  const auth = await resolveBillduCaller(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await status(auth.caller), { headers: noStore });
  } catch (e) {
    return credsErrorResponse(e, auth.caller);
  }
}

/** Save a key + secret for the caller's company, or `{ action: "move_server_credentials" }` (founder only). */
export async function POST(req: Request) {
  const auth = await resolveBillduCaller(req);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;
  const limited = await durableRateLimit(`billdu-save:${caller.userId ? `u:${caller.userId}` : `ip:${clientIp(req)}`}`, SAVE_LIMIT);
  if (!limited.ok) return tooManyRequests(limited, `Too many changes. Try again in ${waitText(limited.retryAfter)}.`);
  const gate = await requirePaidOrTrial(req, caller.userId);
  if (gate) return gate;
  let body: { apiKey?: unknown; apiSecret?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  try {
    if (body?.action === "move_server_credentials") {
      if (caller.mode !== "team" || !caller.founder)
        return jsonError("Only the founder's company can take over the server-wide Billdu credentials.", 403, { code: "forbidden" });
      const server = await loadBillduCreds();
      if (!server.creds) return jsonError("There are no server-wide Billdu credentials to move.", 404, { code: "not_configured" });
      await saveOwnCreds(caller.owner, server.creds, caller.userId);
      return Response.json(await status(caller), { headers: noStore });
    }
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const apiSecret = typeof body?.apiSecret === "string" ? body.apiSecret.trim() : "";
    if (!apiKey || !apiSecret) return jsonError("Both API key and API secret are required.", 400);
    if (apiKey.length > 512 || apiSecret.length > 512) return jsonError("That API key or secret is too long.", 400);
    if (caller.mode === "single_company") {
      // On a server with accounts, an access-code caller may use the server-wide credentials but never replace them.
      if (!mayChangeServerCreds(caller)) return jsonError("Sign in to connect Billdu for your company.", 403, { code: "sign_in_required" });
      await saveBillduCreds({ apiKey, apiSecret });
    } else await saveOwnCreds(caller.owner, { apiKey, apiSecret }, caller.userId);
    return Response.json(await status(caller), { headers: noStore });
  } catch (e) {
    return credsErrorResponse(e, caller);
  }
}

/** Disconnect the caller's company. `?target=server` removes the server-wide copy (founder / single-company only). */
export async function DELETE(request: Request) {
  const auth = await resolveBillduCaller(request);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;
  const target = new URL(request.url).searchParams.get("target");
  const limited = await durableRateLimit(`billdu-save:${caller.userId ? `u:${caller.userId}` : `ip:${clientIp(request)}`}`, SAVE_LIMIT);
  if (!limited.ok) return tooManyRequests(limited, `Too many changes. Try again in ${waitText(limited.retryAfter)}.`);
  try {
    if (target === "server" || caller.mode === "single_company") {
      if (!mayChangeServerCreds(caller))
        return caller.mode === "single_company"
          ? jsonError("Sign in to change your company's Billdu connection.", 403, { code: "sign_in_required" })
          : jsonError("Only the founder's company can remove the server-wide Billdu credentials.", 403, { code: "forbidden" });
      await deleteBillduCreds();
    } else {
      await deleteOwnCreds(caller.owner);
    }
    return Response.json(await status(caller), { headers: noStore });
  } catch (e) {
    return credsErrorResponse(e, caller);
  }
}
