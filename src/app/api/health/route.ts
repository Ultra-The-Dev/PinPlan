import { authMode, requireUser } from "@/lib/server/auth";
import { loadBillduCreds } from "@/lib/server/secrets";

/**
 * Connection check for the apps. Anyone can see that this is a PinPlan server and how it signs callers in;
 * only an authorised caller (access code / session) learns which features are configured — as yes/no, never values.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  const base = { ok: true, app: "pinplan", authMode: authMode(), authorized: auth.ok };
  if (!auth.ok) return Response.json(base, { headers: { "Cache-Control": "no-store" } });
  let billdu = false;
  try {
    billdu = !!(await loadBillduCreds()).creds;
  } catch {
    billdu = false;
  }
  return Response.json(
    { ...base, ai: !!process.env.ANTHROPIC_API_KEY, billdu, encryptionKey: !!process.env.PINPLAN_ENCRYPTION_KEY },
    { headers: { "Cache-Control": "no-store" } },
  );
}
