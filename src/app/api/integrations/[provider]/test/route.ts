// POST /api/integrations/[provider]/test (see src/lib/server/integrations/routes.ts).
import { testRoute } from "@/lib/server/integrations/routes";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return testRoute(request, (await params).provider);
}
