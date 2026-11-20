// POST /api/integrations/[provider]/push (see src/lib/server/integrations/routes.ts).
import { pushRoute } from "@/lib/server/integrations/routes";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return pushRoute(request, (await params).provider);
}
