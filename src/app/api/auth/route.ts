import { connection } from "next/server";
import { authMode } from "@/lib/server/auth";

/** Tells the browser how API requests are authorized (no secrets). */
export async function GET() {
  await connection();
  return Response.json({ mode: authMode() });
}
