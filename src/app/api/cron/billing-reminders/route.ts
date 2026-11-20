// GET /api/cron/billing-reminders: run daily by Vercel Cron (vercel.json), which sends Authorization: Bearer <CRON_SECRET>.
// Emails teams on the free trial with no subscription when 3 days and then 1 day are left. Each reminder is recorded
// on the team (trial_reminder_3d_at / trial_reminder_1d_at) before it's sent, so a rerun never sends it twice.
// Only while billing is enforced (billing_settings.enforce): before that, the trial ending changes nothing.
import { billingConfig, billingEnforced, notConfigured, originMissing, originOf, requireCron, sendTrialReminder, teamsNeedingTrialReminder } from "@/lib/server/billing";
import { emailConfigured, emailUnavailable } from "@/lib/server/email";


export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  if (!emailConfigured()) return emailUnavailable("Trial reminders need RESEND_API_KEY and EMAIL_FROM.");
  const appUrl = originOf(request);
  if (!appUrl) return originMissing();
  const cfg = c.config;
  try {
    if (!(await billingEnforced(cfg))) return Response.json({ ok: true, skipped: "not_enforced", sent: 0 });
    const now = new Date();
    const teams = await teamsNeedingTrialReminder(cfg, now);
    const results: Record<string, number> = {};
    for (const team of teams) {
      const r = await sendTrialReminder(cfg, team, appUrl, now);
      results[r] = (results[r] ?? 0) + 1;
    }
    return Response.json({ ok: true, teams: teams.length, sent: results.sent ?? 0, results });
  } catch (e) {
    console.error("[billing] trial reminders failed:", (e as Error)?.message);
    return Response.json({ ok: false, error: "Couldn't send the trial reminders.", code: "reminders_failed" }, { status: 500 });
  }
}
