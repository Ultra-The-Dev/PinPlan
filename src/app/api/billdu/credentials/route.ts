import { deleteBillduCreds, keyHint, loadBillduCreds, saveBillduCreds } from "@/lib/server/secrets";
import { jsonError } from "@/lib/billdu/route-helpers";

export async function GET() {
  try {
    const { creds, source } = await loadBillduCreds();
    return Response.json({
      configured: !!creds,
      source,
      keyHint: creds ? keyHint(creds.apiKey) : null,
      encryptionKeySet: !!process.env.PINPLAN_ENCRYPTION_KEY,
    });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function POST(req: Request) {
  let body: { apiKey?: string; apiSecret?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const apiKey = body.apiKey?.trim();
  const apiSecret = body.apiSecret?.trim();
  if (!apiKey || !apiSecret) return jsonError("Both API key and API secret are required.", 400);
  try {
    await saveBillduCreds({ apiKey, apiSecret });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
  return Response.json({ configured: true, source: "file", keyHint: keyHint(apiKey) });
}

export async function DELETE() {
  await deleteBillduCreds();
  const { creds, source } = await loadBillduCreds().catch(() => ({ creds: null, source: null }));
  return Response.json({ configured: !!creds, source });
}
