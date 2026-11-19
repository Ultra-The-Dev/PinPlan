import { effectiveCreds, recordTest, resolveBillduCaller } from "@/lib/server/billduCreds";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { handleError, jsonError } from "@/lib/billdu/route-helpers";
import { BillduClient, extractList } from "@/lib/billdu/client";

const TEST_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** Checks the caller's company credentials by reading back one page of clients (the FAQ calls the API one-way; this tests reads). */
export async function POST(request: Request) {
  const auth = await resolveBillduCaller(request);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;
  const limited = rateLimit(`billdu-test:${caller.userId ?? clientIp(request)}`, TEST_LIMIT);
  if (!limited.ok)
    return Response.json(
      { error: `Too many connection tests. Try again in ${limited.retryAfter} seconds.`, code: "rate_limited", retryAfter: limited.retryAfter },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  let loaded;
  try {
    loaded = await effectiveCreds(caller);
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
  if (!loaded.creds)
    return jsonError("Billdu is not connected for your company. Add your Billdu API key and secret in Settings → Billdu.", 412, { code: "not_configured" });
  // Only the company's own row keeps a test history; the server-wide credentials have nowhere to record it.
  const ownRow = caller.mode !== "single_company" && (loaded.source === "team" || loaded.source === "user") ? caller.owner : null;
  try {
    const raw = await new BillduClient(loaded.creds).request<unknown>("GET", "/clients", { query: { page: 1, limit: 1 } });
    const list = extractList(raw);
    if (ownRow) await recordTest(ownRow, true, null);
    return Response.json({ ok: true, canRead: Array.isArray(raw) || list.length > 0 || raw != null, sampleCount: list.length, source: loaded.source });
  } catch (e) {
    if (ownRow) await recordTest(ownRow, false, (e as Error).message);
    return handleError(e);
  }
}
