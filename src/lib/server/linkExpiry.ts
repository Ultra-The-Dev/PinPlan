// Client link expiry (server-only). The database sets share_expires_at on change orders and RFIs when a link is shared
// or sent again (supabase/migrations/20261126001000_audit_hardening.sql); the public routes treat an expired link as
// unknown. No expiry (null) never expires; an unreadable value counts as expired.

export function linkExpired(expiresAt: unknown, now: number = Date.now()): boolean {
  if (expiresAt == null || expiresAt === "") return false;
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(t) || t <= now;
}
