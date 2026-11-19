import { connection } from "next/server";
import { accessCodeAccepted, authMode, openModeRefused } from "@/lib/server/auth";

/** Tells the browser how API requests are authorized (no secrets). */
export async function GET() {
  await connection();
  return Response.json({ mode: authMode(), accessCode: accessCodeAccepted(), configured: !openModeRefused() }, { headers: { "Cache-Control": "no-store" } });
}
