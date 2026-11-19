# Set up the PinPlan server and API keys

The iPad app works offline on its own. Two features need the server (the web app, hosted for free on Vercel):
sending estimates to **Billdu** and the **AI plan reader**. The keys live only on the server, never on the iPad.

You need four values. Set them up in this order (about 20 minutes).

## 1. Anthropic API key (AI plan reader)
1. Go to **console.anthropic.com** and sign in.
2. **Billing**: add a payment method and some credit (a plan read costs cents).
3. **API Keys → Create Key**, name it `PinPlan`, copy it. It starts with `sk-ant-`.
   You only see it once; paste it somewhere safe for step 4.

## 2. Billdu API key and secret
Only the Billdu **account owner** can do this.
1. Sign in to Billdu on the web.
2. **Settings → API** (in some accounts: Settings → Integrations → API).
3. Create / show the **API key** and **API secret**, copy both.

## 3. Team access code
Make one up: a long phrase nobody would guess, e.g. `copper-ladder-91-orchard`.
Anyone with this code and the server address can use your Billdu and AI from the app, so treat it like a password.

## 4. Deploy on Vercel and add the keys
1. Go to **vercel.com**, sign in with GitHub.
2. **Add New → Project**, pick **Ultra-The-Dev/PinPlan**, press **Deploy**. Wait for it to finish (about 2 minutes).
3. Open the project → **Settings → Environment Variables**. Add these four (Environment: Production):

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the `sk-ant-…` key from step 1 |
   | `BILLDU_API_KEY` | the Billdu API key from step 2 |
   | `BILLDU_API_SECRET` | the Billdu API secret from step 2 |
   | `PINPLAN_ACCESS_CODE` | your code from step 3 |

4. **Deployments →** the latest one **→ ⋯ → Redeploy** (keys only take effect after a redeploy).
5. Note the address Vercel shows, e.g. `pinplan-abc123.vercel.app`.

## 5. Connect the iPad
1. Open PinPlan → gear icon (**Settings**) → **PinPlan server**.
2. Enter the address from step 4.5 and your access code.
3. Tap **Check connection**. You should see four green checks:
   Server found · Access code accepted · AI plan reader · Billdu.
   An orange item tells you exactly which value is missing.

The web app works too: open the same address in Safari, go to **Settings**, enter the access code.

## 6. Cloud sync between iPhone, iPad and the web app (optional)
Without this, each device keeps its own jobs (move them with **Job → Share backup**). With it, every device
signed in to the same account sees the same jobs, catalog and products.

1. Create a free project at [supabase.com](https://supabase.com) → **New project**.
2. In the project: **SQL Editor** → run each file in `supabase/migrations/` in name order (oldest first).
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
4. In Vercel → **Settings → Environment Variables** add `NEXT_PUBLIC_SUPABASE_URL` (the URL) and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon key), then **Redeploy**. These two are public by design;
   row-level security keeps each account's data private. Never paste the `service_role` key into the app.
5. Web app: **Settings → Account** → create an account (confirm the email), then sign in.
6. iPad / iPhone: **Settings → Cloud sync → Get cloud settings from my PinPlan server** → sign in with the same
   email and password. The first sync uploads this device's jobs; after that it syncs a few seconds after each change
   and every minute while the app is open. Works offline; if the same item is edited on two devices, the later edit wins.

## 7. Client proposal links
Needs step 6 (cloud sync) — make sure you ran every file in `supabase/migrations/`, including
`20261116000000_proposals.sql`, `20261117000000_fix_project_upsert.sql` and `20261118000000_estimate_line_sort.sql`.

**Not working?** Web app → **Settings → Account → Check cloud setup**. It tests each piece on your Supabase project
(keys, sign-in, tables, proposal functions, image storage, saving a job) and tells you which file to run if one is missing.

1. Fill in **Settings → Your business** (name, phone, email, terms). The client sees these.
2. Open a job → **Estimate** → **Client proposal** → **Create proposal link**: add a message, validity, deposit %,
   choose whether to show every line or section totals, then **Publish**. The link is copied — text or email it.
3. The client opens it on any phone or computer (no account), ticks any optional add-ons, types their name, signs
   and taps **Accept** (or declines with a note).
4. You see *Opened* / *Accepted* / *Declined* on the same card. When accepted, the job turns **Approved** and the
   add-ons they picked are switched on in the estimate. Then send the deposit invoice with **Send to Billdu**.

Sending an updated proposal withdraws the previous link. You can withdraw a link any time.

## 8. Job photos, checklists, daily logs and photo reports
Run `supabase/migrations/20261119000000_field_docs.sql` in the Supabase **SQL Editor** (safe to run again).
It adds the photos, comments, checklists, daily logs and documents tables, plus photo report links.
Without it, those stay on the device they were made on and **Share link** on a photo report won't work.

- **Photos** tab: take or add photos. Each one records the time, who took it and (if allowed) where.
  Then mark it up, caption and tag it, link it to a device, pair before/after photos and comment.
  **AI caption** needs the server's Anthropic key.
- **Field** tab (web: **Field**): checklists from templates (an item can require a photo), daily logs
  (with **Draft from photos**), documents and a timeline of everything on the job.
- **Photo report**: pick photos, then **Download PDF** or **Share link** (the client opens `/r?t=…`, no account).
- Web header: **Photos** shows every job's photos; **Map** shows jobs placed from photo GPS or the Job tab.
- To set the name stamped on your photos: on the web, Photos tab → name; on iPad, Photos tab → ⋯ → Your name.

## 9. Team accounts (office staff and technicians)
Needs step 6 (cloud sync). Everyone gets their own login; everyone on the team works on the owner's jobs and catalog.

| Role | Can do |
| --- | --- |
| **Owner** (you) | Everything, including the team. One per company. |
| **Office / admin** | Everything: estimates, proposals, Billdu, catalog, inviting people. |
| **Technician** | Field work on every job: plans, devices, photos, checklists, logs and tasks. No prices, estimates, proposals or Billdu, and can't delete jobs. |

1. Supabase **SQL Editor** → run `supabase/migrations/20261120000000_teams.sql` (safe to run again).
2. Make sign-up painless for workers — pick **one**:
   - **Recommended:** in Supabase **Project Settings → API**, copy the **service_role** key and add it in Vercel →
     **Settings → Environment Variables** as `SUPABASE_SERVICE_ROLE_KEY` (Production), then **Redeploy**.
     Invited workers then get a working login straight away, with no confirmation email. The key stays on the
     server — never put it in the app, a chat or an email.
   - Or in Supabase **Authentication → Sign In / Providers → Email**, turn off **Confirm email**.
   - Otherwise each worker must open Supabase's confirmation email first. Supabase's built-in mailer only sends a
     few emails an hour, so invites may stall.
3. Web app → **Settings → Team** → **Start your team** (company name, your name).
4. **Invite someone** → their name (optional) and role (Technician or Office / admin) → **Create invite**.
   Send the code with **Share**, **Text it** or **Copy link**. Each code works once, for 14 days; revoke it any time.
5. The worker opens the link (or goes to `/join` on your PinPlan address and types the code), enters their name,
   email and a password, and they're in. On the iPad or iPhone they sign in with the same email and password.

Change someone between Technician and Office / admin, or remove them, under **Settings → Team**. Prices are also
protected in the database and on the server, not just hidden in the app.

## 10. Billing (Stripe)
Optional: without it PinPlan works as before (self-hosted / founder mode) and the billing buttons say billing isn't
set up. Needs step 9 (teams): a paying customer is a company team. New teams get a 14-day free trial; teams that
existed before the billing update are **comped** (free for good, no seat limit, never locked).

How it behaves:
- **Trial / active / past due**: everything works. Past due keeps working while Stripe retries the card.
- **Trial ended without paying, canceled, unpaid**: the team is **read-only**: everyone can still open and export
  every job, but changes stay on their device until the subscription is restarted (the database refuses them).
- **Seats**: the base price includes 3 users; each extra user is a seat. When all seats are taken, a new invite can't
  be accepted — the owner presses **Settings → Billing → Add a seat** first (Stripe prorates it). Removing someone
  gives their seat back. Solo users (not on a team) are never billed or locked.

1. Supabase **SQL Editor** → run `supabase/migrations/20261121000000_billing.sql` (safe to run again).
2. Create a Stripe account at stripe.com. Work in **Test mode** first (the toggle at the top of the dashboard).
3. Stripe → **Product catalog → Add product**, e.g. "PinPlan Team", with **two recurring monthly prices**:
   - a **flat** price (e.g. $49/month) — the base, which includes 3 users;
   - a **per-unit** price (e.g. $15/month) — one per extra user.
   Copy each price's ID (`price_…`). Keep the display prices in `src/lib/plans.ts` in step with these.
4. Stripe → **Developers → API keys**: copy the **Secret key** (`sk_test_…`).
5. Stripe → **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your PinPlan address>/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Copy the endpoint's **Signing secret** (`whsec_…`).
6. Stripe → **Settings → Billing → Customer portal**: turn on updating payment methods, viewing invoices and
   cancelling. Leave **changing quantities and switching plans off** (seats are changed from PinPlan). Save.
   Also in **Settings → Billing → Subscriptions and emails**, turn on Stripe's emails for failed payments and
   card updates.
7. Vercel → **Settings → Environment Variables** (Production), then **Redeploy**:

   | Name | Value |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | the secret key from step 4 |
   | `STRIPE_WEBHOOK_SECRET` | the signing secret from step 5 |
   | `STRIPE_PRICE_BASE` | the flat monthly price ID |
   | `STRIPE_PRICE_SEAT` | the per-user monthly price ID |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 9 (the webhook writes the team's plan with it) |

   These stay on the server. Never put them in the app, a chat, an email or a `NEXT_PUBLIC_` variable.
8. Test: web app → **Settings → Billing → Start subscription** → pay with card `4242 4242 4242 4242`, any future
   date, any CVC. Back in PinPlan the status turns **Active** (or **Trial** with the remaining days carried over).
   In Stripe → **Webhooks** → your endpoint, the deliveries should all show **200**.
   Try **Add a seat** and **Manage billing & invoices**, and cancel from the portal to see the read-only banner.

**Going live** (test mode → live mode checklist):
- [ ] Activate the Stripe account (business details, bank account).
- [ ] Switch to **Live mode** and create the same product and two prices again (test prices don't exist in live mode).
- [ ] Add the webhook endpoint again in live mode (same URL and events) — it has a new signing secret.
- [ ] Set up the customer portal again in live mode.
- [ ] Replace all four `STRIPE_*` variables in Vercel with the live values (`sk_live_…`, new `whsec_…`, live
      `price_…` IDs), then **Redeploy**.
- [ ] Make one real subscription with your own card, check the webhook shows 200, then cancel and refund it.

To give a company free access (a friend, a partner), set its row in Supabase **Table Editor → teams** to
`plan_status = comped` and clear `seat_limit`. Only the server and the dashboard can change billing columns.

## Optional, later
- `PINPLAN_ENCRYPTION_KEY`: only if you'd rather type the Billdu keys into the web app's Settings than use
  environment variables (needs Supabase storage on Vercel).

## If something's wrong
- **"That address isn't a PinPlan server"**: check the address; redeploy if the project is older than this guide.
- **Access code not accepted**: it must match `PINPLAN_ACCESS_CODE` exactly (case-sensitive); redeploy after changing it.
- **AI or Billdu orange after adding keys**: you added them but didn't redeploy.
- **Billdu send fails**: the key/secret must come from the account owner; check them in Billdu → Settings → API.
