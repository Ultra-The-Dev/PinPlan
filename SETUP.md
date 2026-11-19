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

## 10. Public sign-up, sign-in links and account deletion
New companies sign up at `/signup` (landing page `/welcome`, pricing `/pricing`). Sign-in is `/login`, password
reset `/reset`, and the first-run checklist `/start`. Supabase's emails (confirm address, sign-in link, reset
password) only open pages it allows:

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: your Vercel address, e.g. `https://pinplan-abc123.vercel.app`.
3. **Redirect URLs**: add each of these (with your address):
   `https://pinplan-abc123.vercel.app/login`, `https://pinplan-abc123.vercel.app/reset`,
   `https://pinplan-abc123.vercel.app/settings`, `https://pinplan-abc123.vercel.app/join` (or `https://pinplan-abc123.vercel.app/**`).
   Add your own domain too if you use one.
4. **Confirm email** (Authentication → Sign In / Providers → Email) can be on or off. Off: new accounts work straight
   away. On: the person confirms their address first, and their company is created the first time they sign in on
   the device they signed up on.
5. **Delete account** (Settings → Account; required by Apple for apps with sign-up) needs `SUPABASE_SERVICE_ROLE_KEY`
   on Vercel (step 9). Without it the button explains that deletion isn't switched on and to contact support.
   Owners must remove their team members first; a member's jobs stay with the company (moved to the owner).

## Optional, later
- `PINPLAN_ENCRYPTION_KEY`: only if you'd rather type the Billdu keys into the web app's Settings than use
  environment variables (needs Supabase storage on Vercel).

## If something's wrong
- **"That address isn't a PinPlan server"**: check the address; redeploy if the project is older than this guide.
- **Access code not accepted**: it must match `PINPLAN_ACCESS_CODE` exactly (case-sensitive); redeploy after changing it.
- **AI or Billdu orange after adding keys**: you added them but didn't redeploy.
- **Billdu send fails**: the key/secret must come from the account owner; check them in Billdu → Settings → API.
