# Launch checklist (owner)

Everything you have to buy, set up or switch on before PinPlan opens for paying companies, in the order to do it.
This is the one list to follow. [SETUP.md](../SETUP.md) has the click-by-click steps for each service,
[.env.example](../.env.example) describes every setting, and [production-checklist.md](production-checklist.md) covers
running the service after launch (monitoring, key rotation, incidents).

- **R** = required before launch. **O** = optional or recommended.
- `<your-domain>` is the address people open, for example `app.example.com`. Use the same one everywhere.
- Costs are rough list prices in USD at the time of writing. Check them when you buy.
- **The repo is public.** Keys, passwords, your email and customer data go only into the service dashboards and your
  password manager. Never into a file in this repo, an issue, a pull request or a chat.
- AI features stay **off** for launch. Don't set any of the AI settings (step 7.3).

**Lean setup (recommended for launch): about $30 a month**, plus the domain (about $10–$14 a year at cost from
Cloudflare Registrar), Stripe fees on each payment, Apple $99 a year once you ship the App Store app, and one-time
company formation (your state's fee). Upgrade a line when you outgrow it; the "Later" column is the step up.

| Service | Launch with | About | Later |
| --- | --- | --- | --- |
| Cloudflare Workers (hosting) | Workers Paid; the app is set up for it ([cloudflare.md](cloudflare.md)) | $5 a month | — (Vercel Pro, $20 per member a month, also works: section 7) |
| Supabase (database, sign-in, files) | Pro, which already includes 7 days of daily backups | $25 a month | Point-in-time recovery add-on (~$100 a month) once you have many paying companies |
| Resend (email) | Free: 3,000 emails a month, 100 a day, one domain | $0 | Pro ($20 a month) when you near 100 a day; Amazon SES ($0.10 per 1,000) at scale |
| Map tiles | A provider's free commercial tier, or leave the jobs map background off (pins and list still work) | $0 | MapTiler / Stadia / Mapbox paid plan |
| Weather on daily logs | See step 8.2 for the free options | $0 | Open-Meteo commercial subscription |
| Mailboxes (support@, privacy@, security@) | Cloudflare Email Routing (free forwarding to your existing inbox; reply as support@ through Gmail "Send mail as"), or Zoho Mail's free plan | $0 | Google Workspace / Microsoft 365 |
| Uptime monitor, bot protection | UptimeRobot or Better Stack free; Cloudflare Turnstile | $0 | — |
| Legal pages | A policy generator (Termly, iubenda) as a starting point | $0–$20 a month | A flat-fee lawyer review (~$300–$500) once revenue starts; full review $1,000–$3,000 |
| Stripe | pay as you go | 2.9% + 30¢ per card payment, 0.7% Billing | Stripe Tax (0.5%) only if an accountant says you must collect sales tax |
| Apple Developer Program | organization | $99 a year | Optional at launch: the web app works on iPad and phones, including offline |

The fuller setup the audits first suggested (Supabase point-in-time recovery, Resend Pro, paid maps and weather,
paid mailboxes) is about $170–$250 a month. Nothing in the app needs it on day one.

---

## 1. Decisions (no cost)

1. **R: Product name.** Keep PinPlan or rename. The name goes into the domain, the email sender, the Stripe statement
   descriptor, the App Store name, the bundle id (`com.pinplan.app` today) and the Terms. Do a trademark search
   (USPTO) and check that the domain and the App Store name are free before buying anything.
2. **R: Prices.** `src/lib/plans.ts` shows placeholders: $49 a month including 3 users, plus $15 a month for each extra
   user, in USD. Whatever you choose, the Stripe prices (step 6.2) must match `plans.ts` exactly. Ask the developer to
   change `plans.ts` if they differ.
3. **R: Confirm the trial rules.** Every account belongs to a company: someone who signs up without an invite sets up
   their own company and gets the same 14-day trial. Accounts made before `billing_settings.launched_at` keep working
   with no trial deadline (step 4.6).
4. **R: Technician rights.** Decide whether technicians may edit plans and set the scale, or only view, measure, mark
   up, use tasks and record progress.
5. **R: Data after cancellation.** Deletion on request (what the Privacy Policy says now) or an automatic purge (would
   have to be built).
6. **R: App Store countries.** US only at first (recommended), or accept the review risk of the "manage your account on
   the web" link in other countries.
7. **R: Approve the look** (5-tab layout, Blueprint Ink colours, new app icon) from a screenshot pass once the launch
   work is merged.
8. **O: Old personal details in git history.** Check the history of this public repo for personal contact details
   committed earlier. Either rewrite history (`git filter-repo`, then force-push and ask collaborators to re-clone) or
   treat them as public and change them.

## 2. Company and legal

1. **R: Form the company** (LLC or similar). Get an EIN, a business bank account and a **D-U-N-S number** (free, takes
   1–2 weeks; Apple needs it in step 10).
2. **R: Fill in every `[placeholder]` in `src/lib/legal.ts`**: `LEGAL_EFFECTIVE_DATE`, and in `COMPANY`: legal name,
   entity, state, county, address, contact / support / privacy / security emails, website, data region (step 4.1),
   support time zone and transfer mechanism, plus `RETENTION.backupDays` (your Supabase recovery window, step 4.1).
   Run `npm run check:legal`: it must print nothing left. Then set `LEGAL_CHECK=strict` in Vercel's Production
   environment: from then on a build fails if a placeholder ever comes back. (Until you set it, builds only warn, so
   deployments keep working before launch.)
3. **R: Edit `public/.well-known/security.txt`**: the security email and your domain. Move `Expires` forward (to less
   than a year ahead) every year, or production builds fail.
4. **R: Lawyer review** of `/terms`, `/privacy`, `/legal/dpa`, `/legal/subprocessors`, `/accessibility`, `/support` and
   the wording clients sign on a quote. That covers the DPA, the 30-day deletion promise and the transfer mechanism.
   Keep a countersignable copy of the DPA.
5. **R: Accept the providers' DPAs** in each dashboard: Supabase, Vercel, Stripe, Resend, and the map and weather
   providers you choose. Make sure `/legal/subprocessors` lists exactly the services you use.
6. **R: Accessibility.** WCAG 2.2 AA is the target. Approve the `/accessibility` statement; it uses the support mailbox.
7. When the Terms or Privacy Policy change later: ask the developer to change `TERMS_VERSION` in
   `src/lib/onboardingLogic.ts` together with `LEGAL_EFFECTIVE_DATE` in `src/lib/legal.ts`.

## 3. Domain and mailboxes (domain about $10–$15 a year; mailboxes can be free with Cloudflare Email Routing)

1. **R: Buy the domain.** Later, in Vercel → Project → Settings → Domains, add it (apex and `www`, or an `app.`
   subdomain) and redirect one to the other.
2. **R: Mailboxes on the main domain:** `support@`, `privacy@`, `security@` (aliases are fine) and `dmarc-reports@`.
   Use role addresses, not a personal one, and make sure someone reads them every day.

## 4. Supabase (Pro $25 a month, includes 7 days of daily backups; point-in-time recovery is an optional ~$100 a month add-on)

1. **R: Production project on the Pro plan.** Pick the region on purpose (near your customers, and use the same region
   for Vercel functions in step 7.4). Write it into `COMPANY.dataRegion`. Add the point-in-time recovery add-on and put
   its window in days into `RETENTION.backupDays`.
2. **R: Test the migrations locally first:**
   `PGPASSWORD=postgres PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres bash scripts/test-supabase.sh` (or `npm run test:db`
   against any throwaway Postgres). It must finish with no failed check.
3. **R: Run every migration on production with the Supabase CLI**, up to and including
   `20261124100800_ops_hardening.sql`. Don't paste them by hand.
   ```
   supabase login
   supabase link --project-ref <project-ref>
   supabase migration list      # what production already has
   supabase db push             # runs the rest, in name order
   ```
   The earlier files are written to be safe to run again. The launch migrations are `…100100_security_hardening`,
   `…100200_billing_policy`, `…100400_rate_limits`, `…100500_email_guard`, `…100600_company_settings`,
   `…100700_integrations` and `…100800_ops_hardening`. Run them **before** deploying the launch code: without them,
   emails are refused, the shared rate limits fall back to per-server counting, joining with an invite code uses the
   normal sign-up, and `/api/health` answers 503 because the database is behind the code.
4. **R: Withdraw and re-publish old client links.** Right after the security migration, open every job with a live
   quote link or photo report link, withdraw it and publish it again (the old links may already have been seen or
   listed). Then check that listing the `proposals` storage bucket signed out returns nothing. Old images from links
   withdrawn before this change are still in the bucket: delete them in Storage if you want them gone.
5. **R: Check who is free for good (comped)** in the SQL editor (read-only):
   ```sql
   select id, name, plan_status from public.teams where plan_status = 'comped';
   select launched_at, enforce, comp_owner_ids from public.billing_settings;
   ```
   Put only your own user id (Authentication → Users) in the comped list, and move any team that shouldn't be comped
   back to a trial:
   ```sql
   update public.billing_settings set comp_owner_ids = array['<your-user-id>']::uuid[];
   -- for each team that shouldn't be comped:
   update public.teams set plan_status = 'trialing', trial_ends_at = now() + interval '14 days' where id = '<team-id>';
   ```
6. **R: Set the launch time.** `billing_settings.launched_at` was set when the first billing migration ran. Accounts made
   before it never get a trial deadline. If that was well before the real launch, set it to the launch time:
   `update public.billing_settings set launched_at = '<launch time, e.g. 2026-12-01T00:00:00Z>';`
   Leave `enforce` false for now (step 12.1).
7. **R: Authentication → URL Configuration.** Site URL = `https://<your-domain>`. Redirect URLs =
   `https://<your-domain>/**` (this covers `/login?confirmed=1`, `/reset`, `/join` and `/settings`, which the web and
   iOS apps use). Remove `localhost`, every `*.vercel.app` and `*.workers.dev` address and any preview address: a
   sign-in or reset link may only ever send someone back to your own domain. Test sign-in on a separate staging
   Supabase project, never by adding a preview address here.
8. **R: Authentication → Emails → SMTP Settings → custom SMTP through Resend** (after step 5.1): host
   `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key, sender `noreply@mail.<your-domain>`,
   sender name `PinPlan`. Then Authentication → Rate Limits: raise the email limit to 30–100 an hour, and keep the
   other limits at or below the defaults: sign-ups and sign-ins per IP (about 30 per 5 minutes), token verifications
   (about 30 per 5 minutes) and token refreshes (about 150 per 5 minutes). Don't raise them to fix a test: the app's
   own limits (`20261124100400_rate_limits.sql`) sit behind these, not instead of them.
9. **R: Authentication → Emails → Templates:** paste the six files from `supabase/templates/`: `confirm-signup`,
   `invite`, `magic-link`, `reset-password`, `change-email` and `reauthentication` (subjects are in SETUP.md).
10. **R: Authentication hardening.**
    - Sign In / Providers → Email: **Confirm email ON**. The email limits rely on it: with it off, every address counts as
      confirmed.
    - Minimum password length **10** (the web and iOS apps ask for 10).
    - Leaked-password protection on, anonymous sign-ins off, and sign-ups only by email (no phone or other providers
      you haven't set up).
    - **Email:** Secure email change **on** (both the old and the new address must confirm). Secure password change
      (asks for a recent sign-in) **on**. Email OTP / link expiry **3600 seconds** or less.
    - **Sessions** (Authentication → Sessions, Pro): Detect and revoke compromised refresh tokens **on**, refresh token
      reuse interval **10 seconds**, inactivity timeout **30 days** or less (a field tablet that hasn't been opened in
      a month signs in again), and time-box sessions at **90 days** or less. Leave "single session per user" off:
      technicians use a phone and a tablet. JWT expiry (Project Settings → JWT Keys) stays **3600 seconds** or less,
      so a removed team member's access ends within the hour.
    - **MFA** (Authentication → Multi-Factor): TOTP (authenticator app) **enabled**, so owners and admins can add it,
      and multi-factor sign-in on your own Supabase dashboard account and every Supabase organization member.
11. **R: Storage.** Keep the `plans` bucket private with a file size limit of at least 25 MB (and no more than
    100 MB). Every other bucket: private unless a migration made it public on purpose (`proposals` is public for
    client links and must not be listable signed out, step 4.4), with a file size limit (10 MB for photos and
    logos) and allowed MIME types set to images and PDF. Storage → Settings: a global upload limit of 100 MB. Set
    usage alerts.
12. **R: Advisors → Security and Performance.** Fix every error and warning.
13. **R: Restore drill** into a scratch project, following [backups.md](backups.md).
14. **O, then R once the iOS app sends captcha tokens: Cloudflare Turnstile in Supabase** (Authentication → Attack
    Protection → CAPTCHA, provider Turnstile, the same widget's secret key). Only after an App Store build that sends
    captcha tokens is released and most users have updated: turning it on earlier breaks sign-in and sign-up in the
    iPad and iPhone app. The web side is step 7.1.

## 5. Resend (free plan at launch: 3,000 emails a month, 100 a day; Pro about $20 a month when you outgrow it)

1. **R: Verify `mail.<your-domain>`** (Domains → Add domain). Add the SPF, MX and DKIM records it shows at your DNS
   host. Add DMARC: a `TXT` record `_dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc-reports@<your-domain>`, and move
   to `p=quarantine` after 2–4 weeks of clean reports.
2. **R: API key** with **Sending access** limited to that domain. Use it for `RESEND_API_KEY` and as the Supabase SMTP
   password (or make a second key for SMTP so you can rotate them separately). Set usage alerts.
3. **R: Plan.** The free plan sends 100 emails a day across the whole service, including Supabase's sign-up,
   reset and invite emails (step 4.8). Once a day's real total gets near 70, move to Pro before launch traffic, or
   sign-ups stop getting their confirmation email. Turn on Resend's usage alerts and two-factor sign-in.
4. **R: Check the sending limits suit you.** Per company per day: trial 20 client emails, 10 invites, 5 emails to one
   address; paid 300 / 50 / 25. They are `email_daily_cap` and `email_recipient_cap` in
   `20261124100500_email_guard.sql`; ask the developer for a migration to change them.

## 6. Stripe (fees per payment)

1. **R: Activate the account:** business details, bank account, statement descriptor, support email and URL,
   Checkout and portal branding.
2. **R: Live mode → Product catalog:** one product with two **monthly USD** prices: a flat base price, and a per-unit
   price for each extra user. They must match `src/lib/plans.ts`. After deploying, open Settings → Plan & billing as
   the owner: a warning appears if they differ (`/api/billing/check` lists the differences).
3. **R: Developers → Webhooks → Add endpoint** `https://<your-domain>/api/billing/webhook` with the events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy its signing secret.
4. **R: Settings → Billing → Customer portal:** allow updating the card, viewing invoices and cancelling at the end of
   the period. Turn **off** changing quantities and switching plans (seats are changed in PinPlan). Under
   Subscriptions and emails: Smart Retries on, and after all retries fail → cancel the subscription or mark it unpaid;
   turn on the failed-payment, expiring-card and renewal emails. Customer information: let customers change only the
   billing address and tax ID, not the email (billing emails follow the company's `billing_email`). Default
   redirect link: `https://<your-domain>/settings`.
5. **R: Settings → Public details:** set the Terms of Service URL (`https://<your-domain>/terms`) and Privacy Policy URL
   (`https://<your-domain>/privacy`). Then set `STRIPE_TERMS_CONSENT=1` (step 7.1). Without the Terms URL, checkout
   with that setting fails.
6. **R or O: Sales tax.** Ask an accountant where you must collect. If anywhere: turn on Stripe Tax, add the
   registrations, then set `STRIPE_TAX=1`.
7. **O:** each company can have a `billing_email` on its team row; otherwise billing emails go to the owner's email.
8. **O: Online invoice payments** (companies' clients pay invoices by card into the company's own Stripe account;
   off until you do this). Full steps: [payments.md](payments.md).
   1. **Connect → Get started** on this same Stripe account; in Connect → Settings allow **Standard** accounts, set
      the branding, and turn on cards (and ACH Direct Debit if companies may offer US bank account).
   2. **Developers → Webhooks → Add endpoint** `https://northpin.app/api/payments/webhook` (your domain), **Listen to:
      Events on Connected accounts**, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `account.updated`,
      `account.application.deauthorized`. Copy its signing secret into `STRIPE_CONNECT_WEBHOOK_SECRET` (step 7.1;
      on Cloudflare a repository secret of that name) and turn on failure alerts for it.
   3. **O:** a platform fee: `PINPLAN_PAYMENTS_FEE_BPS` (basis points, 100 = 1 %; empty = no fee). Say so in your
      Terms and pricing page before you set it.
   4. Test it in test mode first (payments.md, "Owner setup" step 5).

## 7. Hosting

**Cloudflare Workers (recommended, $5 a month):** follow [cloudflare.md](cloudflare.md). It uses the same settings as
the table below: `NEXT_PUBLIC_` values go in the Worker's build variables, everything else as Worker secrets, and the
cron is already in `wrangler.jsonc`. Steps 7.2 and 7.3 apply as written; skip 7.4 (Vercel project settings).
Also, for Cloudflare:

- **R: GitHub environments** (repo Settings → Environments). `production`: deployment branches **Selected branches**
  → the deploy branch only; put `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and every server secret the deploy
  workflow copies in as **Environment secrets**, then delete the repository-level copies. `appstore`: deployment
  branches and tags → `main` and tags `ios-v*`; the four Apple secrets as Environment secrets (step 10.4).
  Optionally add yourself as a required reviewer on both.
- **R: Deploy branch.** The deploy workflow still also runs on `claude/quirky-clarke-gjz5h1`. Once `main` is the
  deploy branch, remove that branch from `.github/workflows/cloudflare-deploy.yml` (the line marked TODO) and from the
  `production` environment's branch list.
- **R: Cloudflare domains.** The Worker → Settings → Domains & Routes: your custom domain added; the `workers.dev`
  route and Preview URLs **off** (`wrangler.jsonc` sets both, check the dashboard agrees). Then
  `https://pinplan.<your-subdomain>.workers.dev` must answer **404** (or not resolve). Workers Builds, if you use
  it: no builds for non-production branches (a staging Worker with its own Supabase project instead).
- **R: Cloudflare API token** scoped to this account and **Workers Scripts: Edit** only (the "Edit Cloudflare
  Workers" template), with an expiry date in your calendar; two-factor sign-in on the Cloudflare account.

**Or Vercel (Pro $20 per member a month):** the steps below.

1. **R: Production environment variables** (Project → Settings → Environment Variables → Production). Full
   descriptions are in [.env.example](../.env.example). `NEXT_PUBLIC_` values are built into the app: redeploy after
   changing them.

   | Variable | Value | |
   | --- | --- | --- |
   | `PINPLAN_APP_URL` | `https://<your-domain>` | R |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | R |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | R |
   | `SUPABASE_SERVICE_ROLE_KEY` | same page, the service role key (server only) | R |
   | `PINPLAN_ENCRYPTION_KEY` | `openssl rand -base64 32`; keep a copy in your password manager | R |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | live secret key; the endpoint's signing secret (step 6.3) | R |
   | `STRIPE_PRICE_BASE`, `STRIPE_PRICE_SEAT` | the two live price ids (step 6.2) | R |
   | `STRIPE_TERMS_CONSENT` | `1` (after step 6.5) | R |
   | `STRIPE_TAX` | `1` only if you collect sales tax (step 6.6) | O |
   | `STRIPE_CONNECT_WEBHOOK_SECRET` | the Connect endpoint's signing secret (step 6.8); turns online invoice payments on | O |
   | `PINPLAN_PAYMENTS_FEE_BPS` | platform fee on online invoice payments in basis points (step 6.8); empty = none | O |
   | `CRON_SECRET` | `openssl rand -hex 32`. Needed for trial reminders and payment-failed emails | R |
   | `RESEND_API_KEY` | step 5.2 | R |
   | `EMAIL_FROM` | `PinPlan <noreply@mail.<your-domain>>` | R |
   | `EMAIL_REPLY_TO` | `support@<your-domain>` | O |
   | `PLATFORM_ADMIN_EMAILS` | your confirmed account email (only here, never in the repo); opens `/admin` | R |
   | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_TILE_KEY`, `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | step 8.1 | R |
   | `NEXT_PUBLIC_WEATHER_URL`, `OPEN_METEO_API_KEY` | `/api/weather` and your Open-Meteo key (step 8.2) | R |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile widget for `<your-domain>` (free). The site key shows a bot check on web sign-up, sign-in, reset and join. Set the secret only after the developer item below about the join page is done, or joining with an invite code fails | O |
   | `NEXT_PUBLIC_APP_STORE_URL` | the App Store listing, once the app is live (step 10.6) | O |
   | `PINPLAN_FOUNDER_TEAM_ID` | your own company's team id, only if your company uses the server-wide Billdu keys | O |
   | `BILLDU_API_KEY`, `BILLDU_API_SECRET` | only with `PINPLAN_FOUNDER_TEAM_ID` | O |
   | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | step 11.4 | O |

   Checked at start-up: `PINPLAN_APP_URL` (must start with `https://`), the three Supabase values,
   `PINPLAN_ENCRYPTION_KEY`, the four `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` values,
   `RESEND_API_KEY` and `EMAIL_FROM`. Until they're all set, `/api/health` answers 503 and the server log names what's
   missing (names only, never values). Set the same values (with test-mode Stripe
   keys) on Preview if you test there: without `PINPLAN_APP_URL`, checkout, the billing portal, the cron and email
   answer 501.
2. **R: Leave these unset** on the hosted service: `PINPLAN_ACCESS_CODE`, `PINPLAN_ALLOW_ACCESS_CODE`,
   `PINPLAN_ALLOW_OPEN`, `PINPLAN_DATA_DIR`, `CSP_REPORT_ONLY`. If `PINPLAN_ACCESS_CODE` was ever set, delete it and
   redeploy. (They are for a self-hosted, single-company server; see SETUP.md.)
3. **R: Leave AI off:** don't set `NEXT_PUBLIC_AI_ENABLED`, `AI_ENABLED`, `ANTHROPIC_API_KEY` or `ANTHROPIC_MODEL`.
   Turning AI on later also changes the legal pages and adds a subprocessor, so it needs a new legal review first.
4. **R: Project settings.**
   - Functions region: the one nearest your Supabase region.
   - Environment Variables → "Automatically expose System Environment Variables" on.
   - Build command stays `npm run build` and install scripts stay on (`postinstall` copies the PDF reader,
     `prebuild` checks the legal pages, `postbuild` makes the offline service worker). On the first deploy, open
     `https://<your-domain>/sw.js`: it starts with `const BUILD = "…"` and a long list of files.
   - Cron jobs on (from `vercel.json`: `/api/cron/billing-reminders` daily at 15:17 UTC).
   - Deployment Protection on Preview deployments.
   - Spend management alerts.
   - **O:** Skew Protection. **O:** a Firewall rate-limit rule on `/api/*` (for example 60 requests a minute per IP).
5. **R: Domain.** Settings → Domains: add `<your-domain>` (step 3.1). TLS is automatic.
6. **R: Supabase Authentication → Redirect URLs and Stripe's webhook** point at this final domain (steps 4.7 and 6.3).

## 8. Map and weather licences

1. **R: Map tiles.** OpenStreetMap's public tile server doesn't allow a commercial app's traffic. Use a provider whose free tier allows commercial use, or a paid plan (MapTiler, Stadia Maps or Mapbox, raster tiles). Free option:
   leave `NEXT_PUBLIC_MAP_TILE_URL` unset. A production build then shows the jobs map with pins on a plain background
   (it never uses the OpenStreetMap server). Otherwise make an account, restrict the browser key to `<your-domain>`, then set
   `NEXT_PUBLIC_MAP_TILE_URL` (a Leaflet template such as `https://<provider>/{z}/{x}/{y}.png?key={key}`),
   `NEXT_PUBLIC_MAP_TILE_KEY` and `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` (the credit line the provider asks for).
2. **R: Weather on daily logs.** Open-Meteo's free API is for non-commercial use only. Cheapest options, in order:
   - **Self-host Open-Meteo** (open source) on a small server (~$5 a month) and set `NEXT_PUBLIC_WEATHER_URL` to its
     https address. No per-call fees.
   - **Buy an Open-Meteo API subscription**, then set `OPEN_METEO_API_KEY` (server only) and
     `NEXT_PUBLIC_WEATHER_URL=/api/weather`.
   - Free sources that allow commercial use (US National Weather Service `api.weather.gov`, MET Norway with
     attribution) need a small code change to the weather adapter; ask the developer before relying on them.

## 9. Security hygiene (free)

1. **R: Multi-factor sign-in** on GitHub, Vercel, Supabase, Stripe, Resend, Cloudflare, the map and weather
   providers and Apple. Every key lives in a password manager.
2. **R: GitHub → Settings.** Secret scanning, push protection and Dependabot alerts on. Branch protection on `main`:
   require the web, database and Swift core checks, and block force-pushes. Actions → General: workflow permissions
   **Read repository contents**, and "Allow GitHub Actions to create and approve pull requests" off. Fork pull request
   workflows: require approval for all outside collaborators.

## 10. Apple (Developer Program $99 a year)

1. **R: Enroll as an organization** (needs the D-U-N-S number). Register the bundle id for the final name. Accept the
   Free Apps agreement and enter tax details.
2. **R: App Store Connect → Apps → New app** with that bundle id.
3. **R: App Store Connect → Users and Access → Integrations → App Store Connect API:** a key with the App Manager role.
   Download the `.p8` file (only possible once).
4. **R: GitHub → repo Settings → Environments → `appstore`** (the TestFlight workflow runs in it). Environment secrets
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole `.p8` text); deployment branches and tags
   limited to `main` and `ios-v*` tags. Variable `PINPLAN_SERVER_URL` = `https://<your-domain>`
   (built into the app; the TestFlight workflow stops without it). Check that `https://<your-domain>/api/config`
   returns the Supabase address and public key.
5. **R: Release:** Actions → iOS TestFlight → Run workflow (or push a tag like `ios-v1.0.1`). **O:** a TestFlight round
   on a real iPad and iPhone before you submit.
   **Order matters for migration `20261125000100_…`:** release the iOS build that goes with it (approved and live on
   the App Store, not only in TestFlight) **before** running that migration on production. It tightens database
   rules that older iOS builds still rely on, so running it first can break sync for people on an older build.
6. **R: Listing.** Fill the `<…>` placeholders in [app-store.md](app-store.md) (no Billdu or AI claims). Enter the App
   Privacy answers exactly as written there. Age rating 4+, Support URL `https://<your-domain>/support`, Privacy
   Policy URL `https://<your-domain>/privacy`, screenshots for 6.9" iPhone and 13" iPad. Once live, set
   `NEXT_PUBLIC_APP_STORE_URL` in Vercel and redeploy.
7. **R: App Review demo account:** a solo owner of a comped company with a sample job and no real data. Put the
   sign-in only in App Review Information.

## 11. Before opening sign-ups

1. **R: End-to-end on the production domain.**
   - `https://<your-domain>/api/health` returns 200 with `"database": "ok"`.
   - `https://pinplan.<your-subdomain>.workers.dev/` answers **404** (or doesn't resolve): production is only on your
     domain.
   - `https://<your-domain>/sw.js` comes with `Cache-Control: no-cache`, and `https://<your-domain>/icon.svg` with
     `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `X-Content-Type-Options: nosniff`.
   - Make one real purchase with your own card, add a user, cancel, refund, and check the company turns read-only.
   - Sign up on a laptop and confirm the email on a phone. Sign in with an emailed link. Reset a password.
   - Invite a technician by email and have them join on the web and on the iOS app.
   - Sign out and sign in as someone else in the same browser: the first account's jobs must not show.
   - Send a quote and an invoice to a Gmail and an Outlook address. In the message headers, SPF, DKIM and DMARC all
     pass. Approve the quote from the client link.
   - As an owner, publish and withdraw a quote link and check its plan image stops loading. Open a quote link signed
     out.
   - Open the browser console on the main pages: no Content-Security-Policy errors.
2. **R: Offline field test** on a cleared iPad and an Android tablet: load the app, deploy a new version, reopen online,
   go offline, open a plan, take a photo and write a daily log, come back online and check everything synced.
3. **R: Your own company.** Settings → Company: name, phone, email, website and colours (nothing is filled in for you
   any more), and upload your logo again. Settings → Quotes & invoices: tax rates, payment terms, payment
   instructions and an optional online payment link. Invite each technician with their real full name and have each
   sign in once on their phone. Tell customers to fill in the business email under Settings → Company, or their
   client emails are refused.
4. **O: Accounting apps (Beta).** Export for accountant (QuickBooks Online CSV, Xero CSV, QuickBooks Desktop IIF) works
   with no setup. Until keys are set, QuickBooks Online and Xero show "Not available yet"; leave them off if the app
   reviews aren't done. Before turning either on, add it to `/privacy` and `/legal/subprocessors`.
   - QuickBooks Online: an Intuit developer app with redirect URI
     `https://<your-domain>/api/integrations/quickbooks/callback`; set `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` (and
     `QBO_ENVIRONMENT=sandbox` only with development keys). Production keys need Intuit's review (privacy and terms
     URLs, security questionnaire; allow 1–4 weeks).
   - Xero: a Xero app with redirect URI `https://<your-domain>/api/integrations/xero/callback`; set
     `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (`XERO_SCOPES` only if Xero gives the app granular scopes). Xero
     certification is needed beyond a small number of connected organisations.
5. **O: Billdu.** Each company connects its own account under Settings → Connected apps (stored encrypted). Keep
   `PINPLAN_ENCRYPTION_KEY` stable: changing it without `PINPLAN_ENCRYPTION_KEY_PREVIOUS` disconnects every company
   (see production-checklist.md → Rotating keys).
6. **O: Search engines.** Verify the domain in Google Search Console and Bing Webmaster Tools (DNS), and submit
   `https://<your-domain>/sitemap.xml`.
7. **O: Analytics.** Only something privacy-friendly on the marketing pages (Plausible or Vercel Analytics). Add it to
   `/legal/subprocessors` and the CSP first, and keep it out of the iOS app.
8. **O: Social preview image.** A 1200×630 image for link previews (today the 512 px app icon is used).

## 12. Launch day and the first weeks

1. **R: Switch billing on** once the live purchase in step 11.1 worked (SQL editor):
   `update public.billing_settings set enforce = true;`
   While it is false, an unpaid trial never locks anyone and no trial reminders are sent.
2. **R: Uptime monitor** (Better Stack or UptimeRobot, free tier) on `https://<your-domain>/api/health`, alerting your
   phone. It answers 503 when the database is down, the database is behind the code, or a required setting is missing.
3. **R: Stripe → Developers → Webhooks:** turn on failure alerts for the endpoint.
4. **R: Check `/admin` every day** for the first weeks (companies, plan status, errors in `app_errors`).
5. **O:** a Vercel log drain or longer log retention.
6. **Every year:** move `Expires` in `public/.well-known/security.txt` forward.

## Developer items still open when the launch work merged

Not owner tasks, but check they're done before launch. (Done since: the jsdom dialog and signature tests run in CI,
the join page and `/api/team/join` agree on the Turnstile token, the quote number fallback is `Q-{0000}`, and the iOS
cloud sync screen has the account-switch choice.)

- A short manual accessibility pass: Escape closes dialogs and focus returns; a client can sign a quote by typing a
  name; messages stay readable while a dialog is open. Ideally with VoiceOver or NVDA.
- iOS: build once in Xcode after merging the iOS branches; check the dark and tinted app icons in the asset catalog;
  set the server address in each build (Settings → PinPlan server) so the web links, quotes and invoices and the Billdu
  card appear.
- Optional: run `scripts/e2e-plan-viewer.cjs`, `scripts/e2e-sheet-links.cjs` and `scripts/e2e-install-progress.cjs`
  against a dev build and look at the plan at 390 px and 1280 px wide.
