/**
 * Public cloud settings for the native apps: the Supabase project URL and anon key. Both are public by design
 * (the browser app ships them too); row-level security protects the data. Nothing secret is returned.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return Response.json({ app: "pinplan", supabaseUrl, supabaseAnonKey }, { headers: { "Cache-Control": "no-store" } });
}
