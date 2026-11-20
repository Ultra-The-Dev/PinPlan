# Set up PinPlan

There are two ways to run PinPlan:

- **[Part A — Hosted service](#part-a--hosted-service-default)** (the default): one PinPlan address that many
  companies sign up to and pay for. Accounts, companies and sync run on Supabase, billing on Stripe, email on Resend.
- **[Part B — Self-host for one company](#part-b--self-host-for-one-company)**: your own server for your own crew,
  with no public sign-up or billing.

For a launch, follow the order in **[docs/launch-checklist.md](docs/launch-checklist.md)** (what to buy, decide and
switch on, with costs). This file gives the click-by-click steps behind it. Every setting is described in
[.env.example](.env.example). Running the live service (monitoring, key rotation, incidents) is in
[docs/production-checklist.md](docs/production-checklist.md).

`https://<your-domain>` below is your PinPlan address. Keys and passwords go only into the service dashboards and
your password manager, never into this repo (it is public), an issue, a chat or an email.

AI features are switched off. Leave `NEXT_PUBLIC_AI_ENABLED`, `AI_ENABLED`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
unset in both setups.

---

# Part A — Hosted service (default)

## A1. Supabase: database, sign-in, files and cloud sync
1. [supabase.com](https://supabase.com) → **New project** on the **Pro** plan. Pick the region on purpose; it goes into
   the Privacy Policy (`COMPANY.dataRegion` in `src/lib/legal.ts`). Add point-in-time recovery.
2. **Run the migrations with the Supabase CLI** (test them first on a local database with
   `PGPASSWORD=postgres PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres bash scripts/test-supabase.sh`):
   ```
   supabase login
   supabase link --project-ref <project-ref>
   supabase migration list
   supabase db push
   ```
   This runs every file in `supabase/migrations/` in name order, up to `20261124100800_ops_hardening.sql`. The files
   are safe to run again. Run them **before** deploying new code: `/api/health` answers 503 while the database is
   behind the code, and the app shows "needs the latest migration" in its sync status.
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key for A4.
   The service role key stays on the server only.
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://<your-domain>`
   - **Redirect URLs**: `https://<your-domain>/**` (covers `/login?confirmed=1`, `/reset`, `/join` and `/settings`,
     used by the web app and by the iPad and iPhone app). Remove `localhost`.
5. **Authentication → Sign In / Providers → Email**: **Confirm email ON** (the email limits depend on it), minimum
   password length **10**, leaked-password protection on. Turn off anonymous sign-ins.
6. **Storage**: keep the `plans` bucket private, with a file size limit of at least 25 MB.
7. **Advisors → Security and Performance**: fix every error and warning.
8. After the security migration, withdraw and publish again every live client quote link and photo report link, so old
   links stop working. See [launch-checklist.md](docs/launch-checklist.md) §4 for the billing rows to check
   (`billing_settings.comp_owner_ids`, `launched_at`, `enforce`).

## A2. Email (Resend)
PinPlan emails quotes and invoices to clients, team invites, answer notifications, trial and payment reminders, and
Supabase's own sign-up, sign-in link and password emails. You need your own domain: email services won't send for
`vercel.app` or a Gmail address.

1. Sign up at [resend.com](https://resend.com) (Pro plan).
2. **Domains → Add domain**: use a subdomain such as `mail.<your-domain>` so your normal mailbox isn't affected. Add
   each DNS record Resend shows at your DNS host, exactly as shown:
   - **SPF** (a `TXT` record, and an `MX` record for bounces).
   - **DKIM** (a `TXT` record named like `resend._domainkey`).
   - **DMARC**: a `TXT` record named `_dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc-reports@<your-domain>`. Move to
     `p=quarantine` after 2–4 weeks.
   Press **Verify** and wait until the domain shows **Verified**.
3. **API Keys → Create API key**, permission **Sending access**, limited to that domain. It starts with `re_` and is
   shown once.
4. In A4 you set `RESEND_API_KEY`, `EMAIL_FROM` (for example `PinPlan <noreply@mail.<your-domain>>`, on the verified
   domain) and optionally `EMAIL_REPLY_TO` (for example `support@<your-domain>`).

Each company has daily email limits (trial: 20 client emails, 10 invites, 5 to one address; paid: 300 / 50 / 25),
and client emails need the company's business email (Settings → Company) and a confirmed account.

### Supabase sign-up and password emails through Resend
1. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

   | Field | Value |
   | --- | --- |
   | Sender email | `noreply@mail.<your-domain>` (the verified domain) |
   | Sender name | `PinPlan` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a Resend API key (typed into Supabase's form directly) |

2. **Authentication → Rate Limits**: raise **Rate limit for sending emails** to 30–100 an hour.
3. **Authentication → Emails → Templates**: for each template, set the subject and paste the HTML file:

   | Template | Subject | File |
   | --- | --- | --- |
   | Confirm signup | Confirm your PinPlan email | `supabase/templates/confirm-signup.html` |
   | Invite user | You're invited to PinPlan | `supabase/templates/invite.html` |
   | Magic link | Your PinPlan sign-in link | `supabase/templates/magic-link.html` |
   | Reset password | Reset your PinPlan password | `supabase/templates/reset-password.html` |
   | Change email address | Confirm your new PinPlan email | `supabase/templates/change-email.html` |
   | Reauthentication | Your PinPlan confirmation code | `supabase/templates/reauthentication.html` |

**Not arriving?** Resend → **Emails** lists every send with its status. A `403` there means the key or the sender
domain is wrong. `https://<your-domain>/api/email/status` should say `"configured":true`.

## A3. Billing (Stripe)
A paying customer is a company. New companies get a 14-day free trial. The base price includes 3 users; each extra
user is a seat the owner or office adds in **Settings → Plan & billing**. After an unpaid trial ends, or when a subscription is
cancelled or unpaid, the company becomes **read-only**: everyone can still open and export every job, but changes
stay on their device until the subscription restarts. Past due keeps working while Stripe retries the card.

Work in **Test mode** first, then repeat steps 1–4 in **Live mode** (test products, prices, webhooks and portal
settings don't carry over).

1. **Product catalog → Add product** (for example "PinPlan Team") with **two recurring monthly USD prices**: a **flat**
   base price and a **per-unit** price per extra user. Copy each price id (`price_…`). They must match
   `src/lib/plans.ts`; Settings → Plan & billing shows a warning to the owner when they don't, and
   `/api/billing/check` lists the differences.
2. **Developers → Webhooks → Add endpoint**: URL `https://<your-domain>/api/billing/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the **Signing secret** (`whsec_…`).
3. **Settings → Billing → Customer portal**: allow updating the payment method, viewing invoices and cancelling at the
   end of the period. Leave **changing quantities and switching plans off**. In **Subscriptions and emails**: Smart
   Retries on; after all retries fail, cancel or mark unpaid; turn on the failed-payment and expiring-card emails.
4. **Settings → Public details**: Terms of Service URL `https://<your-domain>/terms`, Privacy Policy URL
   `https://<your-domain>/privacy`. Then `STRIPE_TERMS_CONSENT=1` makes customers tick "I agree to the Terms".
   If you collect sales tax: turn on Stripe Tax, add your registrations, then set `STRIPE_TAX=1`.
5. **Developers → API keys**: the **Secret key** (`sk_test_…`, later `sk_live_…`).
6. **Trial and payment reminders** run daily from Vercel Cron (`vercel.json`: `/api/cron/billing-reminders` at 15:17
   UTC). They need `CRON_SECRET` (A4), Resend (A2) and `billing_settings.enforce = true`.
7. **Test**: Settings → Plan & billing → start the subscription, pay with `4242 4242 4242 4242`, any future date, any
   CVC. The status turns **Active**; in Stripe → Webhooks every delivery shows **200**. Try adding a user and
   **Manage billing**, and cancel from the portal to see the read-only banner.
8. **Switch billing on** after one real live purchase worked end to end (SQL editor):
   `update public.billing_settings set enforce = true;` Until then an unpaid trial never locks anyone and no trial
   reminders are sent.

To give a company free access for good, add its owner's user id to `billing_settings.comp_owner_ids` before they set
up their company, or set the team's `plan_status` to `comped` in the SQL editor.

## A4. Deploy on Vercel
1. [vercel.com](https://vercel.com) → **Add New → Project** → import this repository (Pro plan). Keep the build
   command `npm run build`.
2. **Settings → Environment Variables → Production**. Required:

   | Name | Value |
   | --- | --- |
   | `PINPLAN_APP_URL` | `https://<your-domain>` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL (A1.3) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key (A1.3) |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service role key (A1.3) |
   | `PINPLAN_ENCRYPTION_KEY` | `openssl rand -base64 32`; keep a copy in your password manager |
   | `STRIPE_SECRET_KEY` | A3.5 |
   | `STRIPE_WEBHOOK_SECRET` | A3.2 |
   | `STRIPE_PRICE_BASE`, `STRIPE_PRICE_SEAT` | A3.1 |
   | `STRIPE_TERMS_CONSENT` | `1` (after A3.4) |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `RESEND_API_KEY`, `EMAIL_FROM` | A2 |
   | `PLATFORM_ADMIN_EMAILS` | your confirmed account email, for `/admin` |
   | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_TILE_KEY`, `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | A5 |
   | `NEXT_PUBLIC_WEATHER_URL`, `OPEN_METEO_API_KEY` | A5 |

   Optional: `EMAIL_REPLY_TO`, `STRIPE_TAX`, `NEXT_PUBLIC_APP_STORE_URL`, the Turnstile, accounting app and Billdu
   settings (A6).

   **Leave unset** on the hosted service: `PINPLAN_ACCESS_CODE`, `PINPLAN_ALLOW_ACCESS_CODE`, `PINPLAN_ALLOW_OPEN`,
   `PINPLAN_DATA_DIR`, `CSP_REPORT_ONLY` and the AI settings.
3. **Settings → Environment Variables**: turn on "Automatically expose System Environment Variables". Set the
   Functions region near your Supabase region. Turn on Deployment Protection for previews and spend alerts.
4. **Settings → Domains**: add `<your-domain>`.
5. **Deployments → ⋯ → Redeploy** after any change: settings only take effect after a redeploy, and `NEXT_PUBLIC_`
   values are built into the app.
6. The production build **stops** while `src/lib/legal.ts` or `public/.well-known/security.txt` still has a
   `[placeholder]` (run `npm run check:legal` locally to list them).

## A5. Map tiles and weather
- **Map tiles** (jobs map): OpenStreetMap's public tiles aren't allowed for a commercial app. Make an account with
  MapTiler, Stadia Maps or Mapbox, restrict the browser key to `<your-domain>`, and set `NEXT_PUBLIC_MAP_TILE_URL`
  (a Leaflet template such as `https://<provider>/{z}/{x}/{y}.png?key={key}`), `NEXT_PUBLIC_MAP_TILE_KEY` and
  `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`.
- **Weather** (daily logs): Open-Meteo's free API is non-commercial only. Buy an Open-Meteo API subscription and set
  `OPEN_METEO_API_KEY` (server only) and `NEXT_PUBLIC_WEATHER_URL=/api/weather`.

## A6. Optional services
- **Bot check (Cloudflare Turnstile, free)**: create a widget for `<your-domain>`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  shows it on web sign-up, sign-in, reset and join and opens the CSP for it; `TURNSTILE_SECRET_KEY` makes
  `/api/team/join` check it (see the note in launch-checklist.md before setting it). Turn on Supabase
  **Authentication → Attack Protection → CAPTCHA** only once the iPad and iPhone app sends captcha tokens.
- **QuickBooks Online and Xero (Beta)**: Export for accountant works without setup. To connect directly, create an
  Intuit developer app (redirect URI `https://<your-domain>/api/integrations/quickbooks/callback`; set
  `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, and `QBO_ENVIRONMENT=sandbox` only with development keys) and/or a Xero app
  (redirect URI `https://<your-domain>/api/integrations/xero/callback`; set `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`).
  Until then both show "Not available yet".
- **Billdu**: each company connects its own Billdu account under **Settings → Connected apps** (an owner or office user
  pastes the key and secret from Billdu → Settings → API and presses **Test connection**). They are stored encrypted
  with `PINPLAN_ENCRYPTION_KEY`. Server-wide `BILLDU_API_KEY` / `BILLDU_API_SECRET` serve only your own company, named
  by `PINPLAN_FOUNDER_TEAM_ID` (its id in the `teams` table). Details: [docs/billdu.md](docs/billdu.md).

## A7. The iPad and iPhone app
The App Store build has the server address built in (the GitHub variable `PINPLAN_SERVER_URL`, see
[docs/app-store.md](docs/app-store.md)). People sign in with the same email and password as on the web, or sign up in
the app. Development builds: **Settings → PinPlan server** → `https://<your-domain>` → **Check connection**.

The app needs `https://<your-domain>` to answer `/api/config`, `/terms`, `/privacy`, `/support`, `/reset`, and
`DELETE /api/account` for account deletion.

## A8. Companies and team members (team accounts)
Everyone has their own login and belongs to one company. Someone who signs up without an invite sets up their own
company (company name, their name, trades) and starts the trial.

| Role | Can do |
| --- | --- |
| **Owner** | Everything. One per company. |
| **Office** | All field work, plus pricing, quotes, invoices, price list, connected apps, Plan & billing and inviting people. |
| **Technician** | Field work on every job: plans, devices, photos, checklists, daily logs and tasks. No prices, quotes or invoices, and can't delete jobs. |

**Settings → Team → Invite someone**: their name and role → send the code by email, text or link. Each code works
once, for 14 days. The person opens the link (or `/join` and types the code), agrees to the terms and sets a
password. Change a role or remove someone under **Settings → Team**; prices are protected in the database too.

**Delete account** (Settings → Account) uses `SUPABASE_SERVICE_ROLE_KEY`. Owners remove their team first; a member's
jobs stay with the company.

## A9. Check it works
1. `https://<your-domain>/api/health` returns `200` with `"database": "ok"`. A 503 means the database is down, the
   database is behind the code (run A1.2), or a required setting is missing (the Vercel log names it).
2. Sign up on a laptop, confirm the email on a phone, sign in with an emailed link, reset a password.
3. Set up your company in **Settings → Company** (name, phone, email, logo, colours), then **Settings → Quotes &
   invoices** (tax, payment terms, payment instructions).
4. Invite a technician by email and have them join on the web and in the app.
5. Make a quote, **Get client link**, open it signed out and approve it. Send an invoice by email to a Gmail and an
   Outlook address and check SPF, DKIM and DMARC pass in the message headers.
6. The full list is in [launch-checklist.md](docs/launch-checklist.md) §11.

---

# Part B — Self-host for one company

For your own crew on your own server, without public sign-up or billing. Skip Stripe, the cron and the email limits.

1. **Without Supabase** the web app runs local-only: each device keeps its own jobs (move them with **Job → Share
   backup**).
2. **With Supabase** (recommended, for sync between devices and team logins): follow A1 (any plan), A2 if you want
   email, and the Supabase and encryption settings from A4. Without Stripe settings nothing is billed or locked.
   Start your company in **Settings → Team** and invite your crew as in A8.
3. **Protecting the server.** With Supabase, the server routes need a signed-in user. Without Supabase, set a shared
   team access code: make up a long phrase nobody would guess and set `PINPLAN_ACCESS_CODE`; each device enters it
   once in Settings. A production server with neither refuses those routes (503) unless `PINPLAN_ALLOW_OPEN=1` says it
   is meant to be open; use that only on a private network. To accept the access code alongside Supabase sign-in (for
   example older iPad builds), set `PINPLAN_ALLOW_ACCESS_CODE=1`. Never use these on a server other companies use.
4. **Billdu**: set `BILLDU_API_KEY` and `BILLDU_API_SECRET` (Billdu → Settings → API, account owner only). With
   Supabase, also set `PINPLAN_FOUNDER_TEAM_ID` to your company's id in the `teams` table, or connect Billdu under
   **Settings → Connected apps** instead.
5. **Encrypted credentials** need `PINPLAN_ENCRYPTION_KEY`, and either `SUPABASE_SERVICE_ROLE_KEY` (stored in Supabase)
   or a persistent folder in `PINPLAN_DATA_DIR` (default `./.data`).
6. **Hosting**: Vercel works as in A4 (use your own domain or the `vercel.app` address), or any Node host with
   `npm run build` and `npm start`. Redeploy after changing a setting.
7. **iPad and iPhone**: **Settings → PinPlan server** → your address (and the access code when you use one) →
   **Check connection**. With Supabase: **Settings → Cloud sync** → sign in with the same email and password.

## If something's wrong
- **`/api/health` answers 503**: see A9.1.
- **"That address isn't a PinPlan server"**: check the address; redeploy if the project is older than this guide.
- **Access code not accepted** (Part B): it must match `PINPLAN_ACCESS_CODE` exactly (case-sensitive), and with
  Supabase it's ignored unless `PINPLAN_ALLOW_ACCESS_CODE=1`. Redeploy after changing it.
- **A setting has no effect**: redeploy; `NEXT_PUBLIC_` values only change with a new build.
- **Billdu send fails**: the key and secret must come from the Billdu account owner (Billdu → Settings → API).
- **Checkout, billing portal or emails answer 501**: `PINPLAN_APP_URL` or a Stripe or Resend setting is missing.
- **Settings → Account → Check cloud setup** tests each Supabase piece and names the migration to run if one is missing.
