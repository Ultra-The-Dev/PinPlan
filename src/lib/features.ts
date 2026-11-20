// Feature switches. AI (plan scan assist, photo captions, daily-log drafts) is off for now; set
// NEXT_PUBLIC_AI_ENABLED=1 (web, at build time) and AI_ENABLED=1 (server) to bring it back.
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "1";

/**
 * Server side: the AI routes answer only when AI is switched on AND their shared rate limit can run (the service key
 * and Supabase URL are set, so limitAi counts across every server instance). Every AI call costs money, and on
 * Cloudflare Workers an in-memory limit alone doesn't hold. Same check as rateLimit.durableLimiterAvailable(),
 * written out here because this file is also read by the browser.
 */
export function aiEnabledOnServer(): boolean {
  const on = process.env.AI_ENABLED === "1" || process.env.NEXT_PUBLIC_AI_ENABLED === "1";
  return on && !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
