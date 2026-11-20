// POST /api/integrations/[provider]/connect → { url } (signed-in fetch), then GET with ?ticket=… (the browser's
// top-level navigation to the provider). See src/lib/server/integrations/routes.ts and state.ts.
import { connectRoute, connectStartRoute } from "@/lib/server/integrations/routes";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return connectRoute(request, (await params).provider);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return connectStartRoute(request, (await params).provider);
}
