// POST /api/integrations/[provider]/disconnect (see src/lib/server/integrations/routes.ts).
import { disconnectRoute } from "@/lib/server/integrations/routes";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return disconnectRoute(request, (await params).provider);
}
