// GET /api/integrations: every accounting app with this company's status (see src/lib/server/integrations/routes.ts).
import { listRoute } from "@/lib/server/integrations/routes";

export async function GET(request: Request) {
  return listRoute(request);
}
