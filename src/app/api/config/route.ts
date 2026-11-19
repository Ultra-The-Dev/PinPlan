/**
 * Public cloud settings for the native apps: the Supabase project URL and anon key. Both are public by design
 * (the browser app ships them too); row-level security protects the data. Nothing secret is returned: the answer is
 * built from an explicit allowlist of public settings, never by copying environment variables wholesale.
 */
const PUBLIC_CONFIG_KEYS = ["app", "supabaseUrl", "supabaseAnonKey"] as const;

export async function GET() {
  const body: Record<(typeof PUBLIC_CONFIG_KEYS)[number], string> = {
    app: "pinplan",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
