// GET /api/integrations/[provider]/links (see src/lib/server/integrations/routes.ts).
import { linksRoute } from "@/lib/server/integrations/routes";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return linksRoute(request, (await params).provider);
}
