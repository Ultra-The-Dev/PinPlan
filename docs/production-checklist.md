# Production checklist

Everything needed to take PinPlan live as a paid SaaS (Vercel + Supabase + Stripe + Resend + Anthropic, iOS on the App Store).
Work top to bottom; tick items off in your own copy.

> **Secrets:** API keys, service-role keys and webhook secrets go only into the Vercel / Supabase / Stripe dashboards
> (or a password manager). Never paste them into chat, issues, pull requests, email or Slack, and never commit them.
> If one leaks, rotate it (see [Rotating keys](#rotating-keys)).

## 1. Legal and trust

- [ ] Have a lawyer review `/terms`, `/privacy` and `/support` (source: `src/app/terms`, `src/app/privacy`, `src/app/support`).
- [ ] Fill in every placeholder in `src/lib/legal.ts` (company legal name, entity type, state, county, address, contact /
      support / privacy / security emails, data region, effective date). Placeholders render **highlighted** on the pages,
      so open each page and confirm nothing is highlighted.
- [ ] Confirm the subprocessor list in `src/lib/legal.ts` matches what you actually use (add any analytics or support tool).
- [ ] Set up the mailboxes you list (support@, privacy@, security@) and make sure someone reads them.
- [ ] Have a data processing agreement (DPA) ready for customers who ask (the Terms and Privacy Policy say one is available).
- [ ] Sign/accept DPAs with your own subprocessors (Supabase, Vercel, Stripe, Resend and Anthropic all offer one).

## 2. Supabase (database, auth, storage)

- [ ] **Pro plan** (or higher) for the production project: daily backups, no pausing, higher limits.
- [ ] **Point-in-time recovery (PITR)** add-on enabled. Note the retention window (7/14/28 days) and put it in the Privacy
      Policy retention section (`[35]` placeholder).
- [ ] Region chosen deliberately (US region assumed in the legal pages: update `COMPANY.dataRegion`).
- [ ] Run every file in `supabase/migrations/` in name order (SQL editor or `supabase db push`), including
      `20261121020000_ops.sql` (error reports + admin usage function). Re-running is safe.
- [ ] **Auth → URL configuration:** Site URL = `https://<your-domain>`; Redirect URLs include `https://<your-domain>/**`
      and any preview domain you use for testing. Remove `localhost` from production.
- [ ] **Auth → Email:** custom SMTP (use Resend's SMTP credentials) so sign-in/confirmation emails come from your domain
      and aren't rate-limited by Supabase's built-in mailer. Edit the email templates to your branding.
- [ ] **Auth → Providers → Email:** "Confirm email" ON. Minimum password length ≥ 10; enable leaked-password protection if available.
- [ ] **Auth → Rate limits:** review sign-up / OTP / email limits.
- [ ] Storage buckets: `plans` private, `proposals` public (by design: proposal images are shared by link). Set a file-size limit.
- [ ] Run **Advisors → Security** and **Performance**; fix anything red. RLS must be enabled on every table in `public`.
- [ ] Enable **Network restrictions** for direct database connections if nobody needs them from outside.
- [ ] Turn on MFA for every Supabase dashboard account; keep the number of org members small.

## 3. Vercel (hosting)

- [ ] **Pro plan** (commercial use requires it; also longer function durations — the AI routes use up to 300 s).
- [ ] Production environment variables (Settings → Environment Variables → Production). Values are never shown in the app;
      `/api/health` reports only yes/no for each:

  | Variable | Purpose |
  | --- | --- |
  | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (public by design; RLS protects data). Also used to build the CSP. |
  | `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Admin dashboard, encrypted secret storage. Never `NEXT_PUBLIC_`. |
  | `PLATFORM_ADMIN_EMAILS` | Comma-separated emails allowed into `/admin` (must be confirmed Supabase users). |
  | `ANTHROPIC_API_KEY` | AI plan reading, scan, photo captions, daily logs. Set a monthly spend limit in the Anthropic console. |
  | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (+ price IDs, see billing docs) | Billing. |
  | `RESEND_API_KEY` (+ sender address, see email docs) | Transactional email. |
  | `PINPLAN_ENCRYPTION_KEY` | 32-byte key (`openssl rand -base64 32`) for encrypting Billdu credentials at rest. |
  | `NEXT_PUBLIC_APP_VERSION` (optional) | Shown in error reports; defaults to the Git commit when Vercel exposes system env vars. |
  | `CSP_REPORT_ONLY` (optional) | `1` sends the CSP as report-only. Use only to debug a CSP regression. |

- [ ] Do **not** set `PINPLAN_ACCESS_CODE` in production unless the native app still needs it (it bypasses per-user sign-in for API routes).
- [ ] Settings → Environment Variables → "Automatically expose System Environment Variables" ON (gives error reports the commit SHA).
- [ ] Redeploy after changing any variable (the CSP and public env vars are baked in at build time).
- [ ] Deployment Protection on Preview deployments (Vercel Authentication) so previews aren't public.
- [ ] Spend management / usage alerts on.
- [ ] Turn on MFA for every Vercel account; limit team members.

## 4. Domain and DNS

- [ ] Add the domain in Vercel (apex + `www`, redirect one to the other). Vercel issues TLS automatically.
- [ ] HSTS is sent by the app (`max-age` 2 years, `includeSubDomains`). Only add `preload` after every subdomain serves HTTPS.
- [ ] Email DNS for Resend: SPF, DKIM records from Resend, and a DMARC record (start with `p=none`, move to `quarantine`).
- [ ] Update Supabase Site URL / redirect URLs, Stripe webhook URL and Apple support/privacy URLs to the final domain.
- [ ] Check headers: `curl -sI https://<domain>/ | grep -iE "content-security|strict-transport|x-content|referrer|permissions"`,
      or securityheaders.com.

## 5. Stripe (live mode)

- [ ] Activate the account (business details, bank account, tax settings / Stripe Tax if you collect sales tax).
- [ ] Recreate products and prices in **live** mode; put live price IDs and the live secret key in Vercel Production.
- [ ] Live webhook endpoint pointing at the production `/api/billing/...` webhook route; copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] Customer portal configured (cancel, update card, invoices). Branding, statement descriptor and support email set.
- [ ] Do one real purchase with a real card and refund it.

## 6. Email (Resend)

- [ ] Domain verified (DNS above). Sender address on your domain.
- [ ] Same Resend account provides SMTP credentials for Supabase Auth emails.
- [ ] Send yourself every template (invite, proposal accepted, billing notices) and check them on a phone.

## 7. Apple Developer Program and App Store

- [ ] Enroll as an **organization** (needs a D-U-N-S number) so the seller name is your company.
- [ ] App Store Connect: app record, bundle ID, **Support URL** = `https://<domain>/support`, **Privacy Policy URL** = `https://<domain>/privacy`,
      Marketing URL optional.
- [ ] **Account deletion in the app** (App Review guideline 5.1.1(v)): Settings → Account → Delete account must work end-to-end
      (it is described on `/support#delete-account`). Mention where it is in the review notes.
- [ ] **Demo account for App Review:** create a dedicated user (e.g. `appreview@<domain>`) on a team with a sample job
      (plan imported, a few devices, a photo, an estimate). Put the email and password in App Review Information → Sign-in
      required, not anywhere else. Keep it active and its subscription/trial valid during review.
- [ ] Review notes: what PinPlan does, that it's a B2B tool, how to reach the main features with the demo job, that AI
      features send images to an AI provider when tapped, and where account deletion is.
- [ ] Subscriptions: if the iOS app sells subscriptions, use In-App Purchase (guideline 3.1.1). If accounts are bought only
      on the web (B2B "reader"-style), don't link to web purchasing from the app unless your storefront rules allow it.
- [ ] Purpose strings in `Info.plist` for camera, photo library and location, in plain words ("to attach job photos",
      "to tag photos with the job location").
- [ ] TestFlight: internal testers first, then an external group (needs Beta App Review).
- [ ] Export compliance: the app uses only standard HTTPS encryption (`ITSAppUsesNonExemptEncryption = NO`).

### Privacy "nutrition label" mapping (App Store Connect → App Privacy)

Data is **linked to the user**, **not used for tracking**, no third-party advertising. Revisit whenever the app changes.

| Apple category | What PinPlan collects | Purpose |
| --- | --- | --- |
| Contact Info → Name, Email Address | Account name and email; team invites | App Functionality |
| Contact Info → Physical Address, Phone Number, Other | Client names, addresses and phones entered on jobs | App Functionality |
| Location → Precise Location | Photo GPS (EXIF) and device location for geotags / jobs map | App Functionality |
| User Content → Photos or Videos | Job photos | App Functionality |
| User Content → Other User Content | Floor plans, notes, checklists, documents, signatures on proposals | App Functionality |
| Identifiers → User ID | Supabase user ID (also attached to error reports) | App Functionality, Analytics (diagnostics) |
| Purchases → Purchase History | Subscription status (if sold in-app / via Stripe) | App Functionality |
| Diagnostics → Crash Data, Other Diagnostic Data | `app_errors` reports (message, stack, app version, platform) | App Functionality |
| Financial Info | Not collected by PinPlan (Stripe / Apple handle cards) | — |

## 8. Before launch day

- [ ] `npm run build`, `npm test`, `npm run typecheck`, `npm run lint` pass on the release commit.
- [ ] Production smoke test: sign up, create team, invite a technician, import a PDF, place devices, take a photo,
      run an AI scan, publish a proposal and accept it from another device, export a job backup, delete a test account.
- [ ] Open the browser console on the main pages and confirm there are no CSP errors.
- [ ] `https://<domain>/api/health` returns `200` with `"database": "ok"`. Signed in (or with the access code) it lists
      which services are configured — all should be `true` except ones you intentionally don't use.
- [ ] Do a restore drill from backup into a scratch project ([docs/backups.md](backups.md)).

## 9. Monitoring

- [ ] **Uptime:** point an uptime monitor (Better Stack, UptimeRobot, Vercel checks…) at `https://<domain>/api/health`.
      It returns `503` when the database is unreachable.
- [ ] **Admin dashboard:** `https://<domain>/admin` (only for `PLATFORM_ADMIN_EMAILS`) shows companies, plan status,
      seats, jobs, photos, storage and the last 50 app errors. Check it daily at first.
- [ ] **Errors:** client errors land in `public.app_errors` (insert-only; 90-day retention; flood-protected). The iOS app
      can insert into the same table — columns are documented at the top of `supabase/migrations/20261121020000_ops.sql`.
- [ ] Vercel → Logs / Observability for server errors; Supabase → Logs for database/auth errors; Stripe → Developers → Webhooks for failed deliveries.
- [ ] AI routes are rate limited per user/IP (in memory, per server instance — see `src/lib/server/rateLimit.ts`). Watch
      Anthropic usage in its console and set a spend limit; move limits to a shared store (Redis/KV) if abuse appears.

## Rotating keys

Rotate on a schedule (e.g. yearly), whenever someone with access leaves, and immediately if a key may have leaked.

| Key | How |
| --- | --- |
| Supabase service-role / anon (JWT) keys | Supabase → Project Settings → API (new API keys or JWT secret rotation). Update Vercel env vars, redeploy. Rotating the JWT secret signs everyone out. |
| `ANTHROPIC_API_KEY` | Create a new key in the Anthropic console, update Vercel, redeploy, then delete the old key. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → roll key (Stripe lets the old key live briefly). Update Vercel, redeploy. |
| `STRIPE_WEBHOOK_SECRET` | Roll the endpoint's signing secret in Stripe, update Vercel, redeploy. |
| `RESEND_API_KEY` / SMTP password | New key in Resend, update Vercel and Supabase SMTP settings, delete the old key. |
| `PINPLAN_ENCRYPTION_KEY` | Changing it makes stored Billdu credentials unreadable: re-enter them in Settings → Billdu after rotating. |
| Billdu key/secret | Customer rotates in Billdu and re-enters it in PinPlan Settings → Billdu. |

## Incident basics

1. **Detect:** uptime alert, `/admin` error spike, customer email.
2. **Triage:** check `/api/health`, Vercel status/logs, Supabase status/logs, Stripe status. Decide severity.
3. **Mitigate:** roll back the deployment in Vercel (Deployments → previous → Promote), disable a feature by removing its
   env var (e.g. `ANTHROPIC_API_KEY` stops AI routes with a clear 501), or rotate a leaked key.
4. **Communicate:** email affected customers (and post on the support page if widespread). The app keeps working offline,
   so tell field users their work is saved on the device.
5. **Personal data breach:** preserve logs, work out what data and which customers were affected, notify customers without
   undue delay; check state breach-notification laws (and GDPR's 72-hour rule if applicable) with your lawyer.
6. **Afterwards:** short write-up (what happened, impact, fix, follow-ups).

## Customer data export and deletion requests

- **Self-serve export:** Job tab → Backup → Download backup (whole job incl. plans and photos), PDFs/CSVs from each tab,
  catalog CSV. Documented on `/support#export`.
- **Full account export on request:** with the service-role key (never shared), export the team's rows from each table
  (filter by the team members' `owner_id` / `project_id`) and the `plans/<project_id>/…` storage objects; see
  [backups.md](backups.md) for the tools. Deliver via a time-limited link. Target: within 7 days (promised on `/support`).
- **Deletion:** in-app account deletion; for email requests, verify the requester controls the account email first.
  Deleting an auth user cascades to their projects and team; remember storage objects and Stripe customer records.
  Backups roll off within the PITR window.
