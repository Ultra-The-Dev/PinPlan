// GET /api/integrations/[provider]/status (see src/lib/server/integrations/routes.ts).
import { statusRoute } from "@/lib/server/integrations/routes";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return statusRoute(request, (await params).provider);
}
