import { buildOverview, loadRaw, requirePlatformAdmin } from "@/lib/server/admin";

// Platform admin overview: companies, usage and recent client errors. See src/lib/server/admin.ts for access rules.
export async function GET(request: Request) {
  const admin = await requirePlatformAdmin(request);
  if (!admin.ok) return admin.response;
  try {
    return Response.json(buildOverview(await loadRaw()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `Could not load the overview: ${(e as Error).message}`, code: "load_failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
