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

## Optional, later
- `SUPABASE_*`: accounts and syncing between devices (see `.env.example`). The access code keeps working alongside it.
- `PINPLAN_ENCRYPTION_KEY`: only if you'd rather type the Billdu keys into the web app's Settings than use
  environment variables (needs Supabase storage on Vercel).

## If something's wrong
- **"That address isn't a PinPlan server"**: check the address; redeploy if the project is older than this guide.
- **Access code not accepted**: it must match `PINPLAN_ACCESS_CODE` exactly (case-sensitive); redeploy after changing it.
- **AI or Billdu orange after adding keys**: you added them but didn't redeploy.
- **Billdu send fails**: the key/secret must come from the account owner; check them in Billdu → Settings → API.
