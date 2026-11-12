import { getClientOrError, handleError, jsonError } from "@/lib/billdu/route-helpers";
import { billduUnit } from "@/lib/billdu/mapping";

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
  let body: { deviceTypes?: ProductIn[]; taxPct?: number; laborMode?: "combined" | "separate"; markupPct?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const types = body.deviceTypes ?? [];
  if (!Array.isArray(types)) return jsonError("deviceTypes must be an array", 400);
  const client = await getClientOrError();
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
        description: `PinPlan catalog: ${d.id}`,
        stockNumber: d.id,
        price: Math.round(price * 100) / 100,
        tax: body.taxPct ?? 0,
        count: 1,
        unit: billduUnit(d.unit),
      });
      if (p?.id != null) created[d.id] = Number(p.id);
    } catch (e) {
      // Stop on auth errors; keep going on per-item failures.
      const res = handleError(e);
      if (res.status === 401) return res;
      errors.push({ id: d.id, error: (e as Error).message });
    }
  }
  return Response.json({ created, errors });
}
