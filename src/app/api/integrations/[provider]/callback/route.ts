// GET /api/integrations/[provider]/callback (see src/lib/server/integrations/routes.ts).
import { callbackRoute } from "@/lib/server/integrations/routes";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return callbackRoute(request, (await params).provider);
}
