// POST /api/integrations/[provider]/connect (see src/lib/server/integrations/routes.ts).
import { connectRoute } from "@/lib/server/integrations/routes";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return connectRoute(request, (await params).provider);
}
