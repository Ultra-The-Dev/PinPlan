# Hosting on Cloudflare Workers

PinPlan runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`). This is the recommended
host for launch: the Workers Paid plan is **$5 a month** (Vercel Pro is $20 per member). Vercel still works too
(`vercel.json`); use one or the other, not both.

The free Workers plan is **not enough**: the app is about 4.3 MB compressed and the free plan's limit is 3 MB. The
paid plan allows 10 MB.

## What's in the repo

| File | What it does |
| --- | --- |
| `wrangler.jsonc` | The Worker: name `pinplan`, Node.js compatibility, static files, the daily cron (15:17 UTC, same as Vercel), `PINPLAN_ENV=production`, Smart Placement (runs near Supabase), logs on. |
| `open-next.config.ts` | OpenNext settings. Prerendered pages are served from the Worker's static files (no R2 bucket or KV namespace needed). |
| `cloudflare/worker.ts` | The Worker entry: OpenNext's handler plus the cron, which calls `/api/cron/billing-reminders` with `Authorization: Bearer <CRON_SECRET>`, like Vercel Cron. |
| `package.json` | `npm run cf:build`, `npm run cf:preview` (build and run locally in the Workers runtime), `npm run cf:deploy`. |

`PINPLAN_ENV=production` (set in `wrangler.jsonc`) tells the app it is the production deployment, the job `VERCEL_ENV`
does on Vercel: required settings are checked, `/api/health` answers 503 until they're all set, and open mode is
refused.

## Set it up (about 20 minutes)

1. **Cloudflare account.** Sign up at cloudflare.com and turn on two-factor sign-in. Workers & Pages → Plans →
   **Workers Paid** ($5 a month).
2. **Domain.** Buy it with Cloudflare Registrar (sold at cost), or move your domain's DNS to Cloudflare. The Worker's
   custom domain and Email Routing (free `support@` forwarding) both need the domain's DNS on Cloudflare.
3. **Connect the repository.** Workers & Pages → Create → **Import a repository** → GitHub → this repository.
   - Production branch: the branch you deploy from (today `claude/quirky-clarke-gjz5h1`; `main` once it's merged).
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - Non-production branch deploy command: `npx opennextjs-cloudflare upload` (makes a preview version, doesn't
     replace production).
   - Root directory: `/`.
   - Project name: `pinplan` (must match `name` in `wrangler.jsonc`).
4. **Build variables** (the Worker → Settings → Build → Variables and secrets). These are read while the app is
   built, so changing one needs a new deploy:
   - `NODE_VERSION` = `22`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-domain>`
   - Optional: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_MAP_TILE_URL` / `_KEY` / `_ATTRIBUTION`,
     `NEXT_PUBLIC_WEATHER_URL`, `NEXT_PUBLIC_APP_STORE_URL`
   - At launch: `LEGAL_CHECK` = `strict` (launch-checklist.md step 2.2)
5. **Runtime variables and secrets** (the Worker → Settings → Variables and secrets → add as **Secret**). The same
   list as the Vercel table in [launch-checklist.md](launch-checklist.md) step 7.1, minus the `NEXT_PUBLIC_` ones:
   `PINPLAN_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PINPLAN_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASE`, `STRIPE_PRICE_SEAT`, `STRIPE_TERMS_CONSENT`, `CRON_SECRET`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `PLATFORM_ADMIN_EMAILS`, and the optional ones you use
   (`TURNSTILE_SECRET_KEY`, `OPEN_METEO_API_KEY`, `QBO_*`, `XERO_*`, `STRIPE_TAX`, `PINPLAN_FOUNDER_TEAM_ID`,
   `BILLDU_*`). Also add the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values here as plain
   variables: server routes read them at run time too. Leave AI and the self-hosting settings unset (step 7.2–7.3).
   From the command line instead: `npx wrangler secret put STRIPE_SECRET_KEY` (and so on).
6. **Custom domain.** The Worker → Settings → Domains & Routes → Add → Custom domain → `<your-domain>` (and `www`
   if you want it). Cloudflare makes the DNS record and the certificate.
7. **Point the other services at the domain:** Supabase Authentication → URL configuration (Site URL and Redirect
   URLs), the Stripe webhook endpoint `https://<your-domain>/api/billing/webhook`, the QuickBooks / Xero redirect
   URLs, and the iOS build's server address (`PINPLAN_SERVER_URL` repository variable on GitHub).
8. **Check it:** `https://<your-domain>/api/health` answers 200 with `"schema":"ok"`, and `https://<your-domain>/sw.js`
   starts with `const BUILD = "…"`. The cron shows under the Worker → Settings → Trigger events; its runs and any
   errors are under Logs.
9. **Rate limit (free):** Security → WAF → Rate limiting rules → `/api/*`, 60 requests per minute per IP, action
   Block for 1 minute.
10. **Spend:** Manage account → Billing → set a usage notification. Workers Paid includes 10 million requests and
    30 million CPU-milliseconds a month, far more than launch needs.
11. **Vercel:** once Cloudflare serves the domain, delete the Vercel project (or disconnect its Git integration) so
    it stops building every push.

## Run it locally in the Workers runtime

```bash
npm run cf:preview          # builds, fills the page cache, serves on http://localhost:8787
```

Local secrets go in `.dev.vars` (gitignored), one `NAME=value` per line. To test the cron:
`npx wrangler dev --test-scheduled`, then open `http://localhost:8787/__scheduled?cron=17+15+*+*+*`.

## Notes

- `npx wrangler dev` on its own skips filling the page cache, so pages hang. Use `npm run cf:preview`, or run
  `npx opennextjs-cloudflare populateCache local` first.
- `compatibility_date` is pinned to 2025-09-01. Newer dates turn on a stricter promise rule that the current
  OpenNext cache doesn't handle yet; move it forward only after `npm run cf:preview` passes the e2e tests with the
  new date (`PLAYWRIGHT_BASE_URL=http://localhost:8787 npx playwright test`).
- No Skew Protection: after a deploy, an open tab keeps its old code until it reloads. The service worker shows
  "Update ready" and reloads on the next navigation, so this is rarely visible.
