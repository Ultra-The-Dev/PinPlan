// Creates a worker's account already confirmed, so they can join their team without waiting for Supabase's
// confirmation email (which is heavily rate-limited on the built-in mailer).
// Only works when SUPABASE_SERVICE_ROLE_KEY is set on the server, and only for a live invite code. The key never
// leaves the server. Without it this answers 501 and the join page falls back to a normal sign-up.
import { connection } from "next/server";
import { normalizeCode, signupProblem } from "@/lib/teamLogic";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

// A little brake against someone hammering one code or one address (per server instance; good enough here,
// since a code is single-use and dies as soon as the worker joins).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_CODE = 5;
const MAX_PER_IP = 20;
const hits = new Map<string, number[]>();
function limited(key: string, max: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > max;
}

/** GET: does this server create confirmed accounts? (No secrets; lets the page pick the right copy.) */
export async function GET() {
  await connection();
  return json({ available: !!(supabaseUrl() && anonKey() && serviceKey()) });
}

export async function POST(req: Request) {
  const url = supabaseUrl();
  const service = serviceKey();
  if (!url || !anonKey() || !service) return json({ error: "Instant sign-up isn't set up on this server.", code: "unavailable" }, 501);

  let body: { code?: unknown; email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const problem = signupProblem({ code, email, password, name });
  if (problem) return json({ error: problem, code: "bad_request" }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`ip:${ip}`, MAX_PER_IP) || limited(`code:${code}`, MAX_PER_CODE))
    return json({ error: "Too many tries. Wait a few minutes and try again.", code: "rate_limited" }, 429);

  // The code must be live (not used, revoked or expired). Asked as the public would ask (anon key).
  try {
    const info = await fetch(`${url}/rest/v1/rpc/team_invite_info`, {
      method: "POST",
      headers: { apikey: anonKey()!, Authorization: `Bearer ${anonKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code }),
      cache: "no-store",
    });
    if (info.status === 404) return json({ error: "Teams aren't set up on this server yet.", code: "unavailable" }, 501);
    if (!info.ok) return json({ error: "Couldn't check the invite code. Try again.", code: "upstream" }, 502);
    const data = (await info.json()) as unknown;
    if (!data) return json({ error: "That invite code isn't valid any more. Ask for a new one.", code: "invalid_code" }, 400);
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }

  try {
    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: name ? { name } : {} }),
      cache: "no-store",
    });
    if (r.ok) return json({ ok: true });
    const err = (await r.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string; code?: string };
    const msg = err.msg ?? err.message ?? "";
    if (err.error_code === "weak_password" || (/password/i.test(msg) && !/already/i.test(msg))) return json({ error: msg || "Choose a stronger password.", code: "weak_password" }, 400);
    if (err.error_code === "email_exists" || /already (been )?registered|already exists/i.test(msg))
      return json({ error: "There's already an account with this email. Sign in instead.", code: "exists" }, 409);
    // A wrong or revoked service key: let the page fall back to the normal sign-up.
    if (r.status === 401 || r.status === 403) return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
    return json({ error: msg || "Couldn't create the account.", code: "upstream" }, 502);
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
}
