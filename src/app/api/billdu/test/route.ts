import { effectiveCreds, NOT_CONNECTED, recordTest, resolveBillduCaller } from "@/lib/server/billduCreds";
import { requirePaidOrTrial } from "@/lib/server/planGate";
import { clientIpKey, durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { credsErrorResponse, handleError, jsonError } from "@/lib/billdu/route-helpers";
import { BillduClient, BillduError, extractList } from "@/lib/billdu/client";

const TEST_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** Checks the caller's company credentials by reading back one page of clients (the FAQ calls the API one-way; this tests reads). */
export async function POST(request: Request) {
  const auth = await resolveBillduCaller(request);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;
  const limited = await durableRateLimit(`billdu-test:${caller.userId ? `u:${caller.userId}` : `ip:${clientIpKey(request)}`}`, TEST_LIMIT);
  if (!limited.ok) return tooManyRequests(limited, `Too many connection tests. Try again in ${waitText(limited.retryAfter)}.`);
  const gate = await requirePaidOrTrial(request, caller.userId);
  if (gate) return gate;
  let loaded;
  try {
    loaded = await effectiveCreds(caller);
  } catch (e) {
    return credsErrorResponse(e, caller);
  }
  if (!loaded.creds) return jsonError(NOT_CONNECTED, 412, { code: "not_configured" });
  // Only the company's own row keeps a test history; the server-wide credentials have nowhere to record it.
  const ownRow = caller.mode !== "single_company" && (loaded.source === "team" || loaded.source === "user") ? caller.owner : null;
  try {
    const raw = await new BillduClient(loaded.creds).request<unknown>("GET", "/clients", { query: { page: 1, limit: 1 } });
    const list = extractList(raw);
    if (ownRow) await recordTest(ownRow, true, null);
    return Response.json({ ok: true, canRead: Array.isArray(raw) || list.length > 0 || raw != null, sampleCount: list.length, source: loaded.source });
  } catch (e) {
    // The company's own office sees what their Billdu account said; anything else is kept to the server log.
    if (ownRow) await recordTest(ownRow, false, e instanceof BillduError ? e.message : "The test couldn't reach Billdu.");
    return handleError(e, caller);
  }
}
