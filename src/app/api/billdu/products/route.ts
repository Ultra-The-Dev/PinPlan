import { resolveBillduCaller } from "@/lib/server/billduCreds";
import { requirePaidOrTrial } from "@/lib/server/planGate";
import { clientIp, durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { getClientOrError, handleError, jsonError } from "@/lib/billdu/route-helpers";
import { BillduError } from "@/lib/billdu/client";
import { billduUnit } from "@/lib/billdu/mapping";
import { money } from "@/lib/estimate";

/** Most device types one request may create (a catalog is far smaller; this caps what one call can make us send). */
const MAX_DEVICE_TYPES = 500;
/** Per user (or IP, for access-code callers): each request can create up to MAX_DEVICE_TYPES Billdu products. */
const PRODUCTS_LIMIT = { limit: 20, windowMs: 60 * 60_000 };

interface ProductIn {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  laborPrice?: number;
  billduProductId?: number | null;
}

/** Create Billdu Products for catalog device types that don't have one yet. Returns {deviceTypeId: billduProductId}. */
export async function POST(req: Request) {
  const auth = await resolveBillduCaller(req);
  if (!auth.ok) return auth.response;
  const limited = await durableRateLimit(`billdu-products:${auth.caller.userId ? `u:${auth.caller.userId}` : `ip:${clientIp(req)}`}`, PRODUCTS_LIMIT);
  if (!limited.ok) return tooManyRequests(limited, `Too many product uploads. Try again in ${waitText(limited.retryAfter)}.`);
  const gate = await requirePaidOrTrial(req, auth.caller.userId);
  if (gate) return gate;
  let body: { deviceTypes?: ProductIn[]; taxPct?: number; laborMode?: "combined" | "separate"; markupPct?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const types = body.deviceTypes ?? [];
  if (!Array.isArray(types)) return jsonError("deviceTypes must be an array", 400);
  if (types.length > MAX_DEVICE_TYPES) return jsonError(`Send at most ${MAX_DEVICE_TYPES} device types at a time.`, 413, { code: "too_many_items" });
  const client = await getClientOrError(auth.caller);
  if (client instanceof Response) return client;
  const mk = 1 + (body.markupPct ?? 0) / 100;
  const created: Record<string, number> = {};
  const errors: { id: string; error: string }[] = [];
  for (const d of types) {
    if (d.billduProductId) continue;
    const price = body.laborMode === "separate" ? d.unitPrice * mk : d.unitPrice * mk + (d.laborPrice ?? 0);
    try {
      const p = await client.createProduct({
        label: body.laborMode === "separate" ? d.name : `${d.name} — installed`,
        description: "",
        // No internal ids in Billdu: they'd show up in the code column of invoices.
        stockNumber: "",
        price: money(price),
        tax: body.taxPct ?? 0,
        count: 1,
        unit: billduUnit(d.unit),
      });
      if (p?.id != null) created[d.id] = Number(p.id);
    } catch (e) {
      // Stop on auth errors; keep going on per-item failures.
      const res = handleError(e, auth.caller);
      if (res.status === 401) return res;
      errors.push({ id: d.id, error: e instanceof BillduError ? `Billdu refused this product (error ${e.status}).` : "Couldn't create this product." });
    }
  }
  return Response.json({ created, errors });
}
