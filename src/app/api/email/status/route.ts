// Is email switched on for this server? Yes/no only (never values). The Team screen (web, and later the iPad) shows
// the "Email invite" option only when it is.
import { connection } from "next/server";
import { emailConfigured } from "@/lib/server/email";
import { serviceConfigured } from "@/lib/server/supabaseAdmin";

export async function GET() {
  await connection();
  const configured = emailConfigured();
  return Response.json({ configured, notifications: configured && serviceConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
