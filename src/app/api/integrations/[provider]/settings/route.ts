// GET / POST /api/integrations/[provider]/settings (see src/lib/server/integrations/routes.ts).
import { settingsRoute } from "@/lib/server/integrations/routes";

type Ctx = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return settingsRoute(request, (await params).provider);
}

export async function POST(request: Request, { params }: Ctx) {
  return settingsRoute(request, (await params).provider);
}
