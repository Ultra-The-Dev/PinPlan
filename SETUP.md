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
`20261116000000_proposals.sql` and `20261117000000_fix_project_upsert.sql`.

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

## Optional, later
- `PINPLAN_ENCRYPTION_KEY`: only if you'd rather type the Billdu keys into the web app's Settings than use
  environment variables (needs Supabase storage on Vercel).

## If something's wrong
- **"That address isn't a PinPlan server"**: check the address; redeploy if the project is older than this guide.
- **Access code not accepted**: it must match `PINPLAN_ACCESS_CODE` exactly (case-sensitive); redeploy after changing it.
- **AI or Billdu orange after adding keys**: you added them but didn't redeploy.
- **Billdu send fails**: the key/secret must come from the account owner; check them in Billdu → Settings → API.
