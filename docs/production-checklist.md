# Running PinPlan in production

**Setting up for launch?** Follow [launch-checklist.md](launch-checklist.md): it is the one ordered list of what to
buy, decide and configure (Supabase, Resend, Stripe, Vercel, maps and weather, Apple, legal), with the exact settings.
[SETUP.md](../SETUP.md) has the click-by-click steps. App Store listing, review notes and the App Privacy answers are
in [app-store.md](app-store.md).

This page covers running the service once it's live: checks for each release, monitoring, key rotation, incidents and
customer data requests.

> **Secrets:** API keys, service-role keys and webhook secrets go only into the Vercel / Supabase / Stripe / Resend
> dashboards and a password manager. Never paste them into chat, issues, pull requests, email or Slack, and never
> commit them (the repo is public). If one leaks, rotate it (see [Rotating keys](#rotating-keys)).

## Each release

- [ ] `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:db` pass on the release commit, and
      `npm run check:legal` lists nothing.
- [ ] New migrations: run them on the local test database first, then `supabase db push` on production **before** the
      new code goes live. If the code needs a newer migration, `REQUIRED_SCHEMA_VERSION` in
      `src/lib/server/envCheck.ts` says which, and `/api/health` answers 503 until it's run.
- [ ] After deploying: `https://<your-domain>/api/health` returns `200` with `"database": "ok"`. Signed in, it lists
      which services are configured (yes/no only, never values); all should be `true` except ones you deliberately
      don't use (AI stays off).
- [ ] Smoke test on production: sign up, set up a company, invite a technician, import a PDF plan, place devices,
      take a photo, write a daily log, make a quote and **Get client link**, approve it from another device, send an
      invoice by email, download a job backup, delete a test account.
- [ ] Open the browser console on the main pages: no Content-Security-Policy errors.
- [ ] iOS: run the TestFlight workflow and test the build before submitting (see [app-store.md](app-store.md)).

## Monitoring

- [ ] **Uptime:** an uptime monitor (Better Stack, UptimeRobot, …) on `https://<your-domain>/api/health`, alerting
      your phone. It answers `503` when the database is unreachable, the database is behind the code, or a required
      production setting is missing (the Vercel log has one "PRODUCTION CONFIG INCOMPLETE" line naming it).
- [ ] **Admin dashboard:** `https://<your-domain>/admin` (only for `PLATFORM_ADMIN_EMAILS`) shows companies, plan
      status, seats, jobs, photos, storage and the latest app errors. Check it daily at first.
- [ ] **Errors:** web, iOS and server errors land in `public.app_errors` (insert-only, 90-day retention, capped per
      user, per device and overall so a flood can't fill it). Columns are documented in
      `supabase/migrations/20261121020000_ops.sql`.
- [ ] Vercel → Logs / Observability for server errors; Supabase → Logs for database and sign-in errors;
      Stripe → Developers → Webhooks for failed deliveries (turn on failure alerts); Resend → Emails for bounces.
- [ ] Rate limits for the server routes are kept in Supabase (`20261124100400_rate_limits.sql`); without that
      migration they fall back to per-server counting. Email has its own daily limits per company
      (`20261124100500_email_guard.sql`).
- [ ] Billing reminders: Vercel → Cron Jobs shows `/api/cron/billing-reminders` running daily with status 200.
- [ ] Every year: move `Expires` in `public/.well-known/security.txt` forward (production builds fail once it has passed).

## Rotating keys

Rotate on a schedule (for example yearly), whenever someone with access leaves, and immediately if a key may have
leaked. Redeploy in Vercel after every change.

| Key | How |
| --- | --- |
| Supabase service-role / anon (JWT) keys | Supabase → Project Settings → API (new API keys or JWT secret rotation). Update Vercel. Rotating the JWT secret signs everyone out. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → roll key (the old key can live briefly). Update Vercel. |
| `STRIPE_WEBHOOK_SECRET` | Roll the endpoint's signing secret in Stripe, update Vercel. |
| `RESEND_API_KEY` / Supabase SMTP password | New key in Resend, update Vercel and Supabase SMTP settings, then delete the old key. |
| `CRON_SECRET` | New random value in Vercel; Vercel Cron picks it up on the next deploy. |
| `PINPLAN_ENCRYPTION_KEY` | Move the old value to `PINPLAN_ENCRYPTION_KEY_PREVIOUS`, set a new `PINPLAN_ENCRYPTION_KEY`, redeploy. Stored Billdu, QuickBooks Online and Xero credentials can still be read with the old key and are written with the new one when next saved. Remove `PINPLAN_ENCRYPTION_KEY_PREVIOUS` once every company has used or re-saved its connections. Changing the key without this step disconnects every company. |
| `TURNSTILE_SECRET_KEY` | Rotate the widget's secret in Cloudflare, update Vercel (and Supabase CAPTCHA, if on). |
| `QBO_CLIENT_SECRET`, `XERO_CLIENT_SECRET` | Regenerate in the Intuit / Xero developer portal, update Vercel. |
| Map tile and Open-Meteo keys | New key at the provider, update Vercel (`NEXT_PUBLIC_MAP_TILE_KEY` needs a redeploy to rebuild). |
| A company's Billdu key/secret | The customer rotates it in Billdu and enters it again in Settings → Connected apps. |
| App Store Connect API key | New key with the App Manager role, update the `ASC_*` GitHub secrets, revoke the old key. |

## Incident basics

1. **Detect:** uptime alert, an error spike in `/admin`, a customer email.
2. **Triage:** check `/api/health`, Vercel status and logs, Supabase status and logs, Stripe status. Decide severity.
3. **Mitigate:** roll back in Vercel (Deployments → previous → Promote), remove the setting of a misbehaving optional
   service (its feature then says it isn't set up), or rotate a leaked key.
4. **Communicate:** email affected customers (and post on the support page if widespread). The apps keep working
   offline, so tell field users their work is saved on the device.
5. **Personal data breach:** preserve logs, work out what data and which customers were affected, notify customers
   without undue delay; check state breach-notification laws (and GDPR's 72-hour rule if it applies) with your lawyer.
6. **Afterwards:** a short write-up (what happened, impact, fix, follow-ups).

## Customer data export and deletion requests

- **Self-serve export:** Settings → Account → **Download all my data** (owners and office: every job backup, quotes,
  invoices and payments, CSVs, price list, settings and team). Per job: Job → Backup, and PDFs and CSVs from each tab.
  Documented on `/support#export`.
- **Full export on request:** with the service-role key (never shared), export the company's rows and its
  `plans/<job id>/…` storage files; see [backups.md](backups.md). Deliver with a time-limited link within 7 days
  (promised on `/support`).
- **Deletion:** in-app account deletion (Settings → Account). For email requests, check the requester controls the
  account email first. Deleting an account removes the login, the person's own jobs, price list and files, and the
  company if they own it alone. An owner with other people on the team must remove them first; a member's jobs move
  to the company owner. Deleting a company cancels its Stripe subscription; the Stripe customer and its invoices
  stay in Stripe for your accounting records. Backups roll off within the point-in-time recovery window.
