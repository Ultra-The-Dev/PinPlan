# Online invoice payments (Stripe Connect)

A company connects its own Stripe account once (**Settings → Quotes & invoices → Online payments**, owner or admin).
From then on every finalized invoice's client link (`/d?t=…`) shows **Pay $X by card** (and, if the office turns it on,
US bank account / ACH for USD invoices). The client pays on Stripe's hosted Checkout page; no card data touches
Northpin. When Stripe confirms the payment, the server records it on the invoice exactly like a payment typed in with
"Record payment", the invoice turns **Partly paid** / **Paid**, the team sees it after the next sync, and the client
page says **Paid — thank you**.

The feature is **off and invisible** until the server has `STRIPE_CONNECT_WEBHOOK_SECRET` (plus the Stripe key and the
service-role key it already uses). Without it the Settings card doesn't appear, the client page shows no button, and
`/api/payments/*` answer 501.

Code: `src/lib/onlinePay.ts` (pure rules), `src/lib/server/onlinePayments.ts` (Stripe + database), routes under
`src/app/api/payments/` (`account`, `checkout`, `confirm`, `webhook`), the client page
`src/components/documents/ClientDocument.tsx`, Settings `src/components/documents/OnlinePaymentsPanel.tsx`, database
`supabase/migrations/20261125002100_online_payments.sql`. Tests: `tests/onlinePayments.test.ts`,
`tests/onlinePayRoutes.test.ts`, `supabase/tests/online_payments_test.sql`.

## Why Stripe Connect with Standard-type accounts

- **Standard** (created as `controller: {stripe_dashboard: full, fees: account, losses: stripe,
  requirement_collection: stripe}`, which is what Stripe now calls a Standard account) gives the company its **own
  full Stripe dashboard**: it is the merchant of record, sees its payouts, issues refunds and answers disputes itself,
  and pays Stripe's fees itself. Stripe collects and checks its details (KYC). Northpin carries no negative-balance or
  dispute liability and needs no support process for payouts.
- **Express** would give a slicker branded onboarding, but the platform then answers for negative balances and
  disputes and has to build the dashboard pieces itself. Not worth it for contractor invoicing.
- Onboarding uses **Account Links** (Stripe-hosted). A contractor who already uses Stripe signs in with the same Stripe
  login during onboarding and gets a new account for this company under it (Stripe can't attach an existing account
  through Account Links; that would need the legacy OAuth flow and a separate client id, which we don't use).
- **Direct charges**: every Checkout page is created *on the connected account* (`Stripe-Account` header). The money
  lands in the company's Stripe balance and is paid out to its bank. It never passes through the platform's balance.
  The optional platform fee (`PINPLAN_PAYMENTS_FEE_BPS`) is an `application_fee_amount` on the charge; default 0.

## How a payment flows

1. The client opens the invoice link. `get_document()` returns `payOnline: {available, ach, payable, processing,
   paidOnline}` (worked out in SQL: account connected and allowed to take charges, switched on, invoice issued and not
   void/paid, balance less bank payments still processing).
2. **Pay** → `POST /api/payments/checkout {token}`. The server asks the database (`online_payment_target`) what this
   link may pay **now**: a live link (not withdrawn, not expired), an issued invoice that isn't void, a balance above
   zero, nothing already processing for it, a connected account. It reuses an open page for the same amount, otherwise
   closes the invoice's other open pages in Stripe and opens one Checkout page for exactly the payable balance
   (idempotency key per invoice, amount, open pages and 10-minute slot: a double click gets the same page). The page
   is remembered in `online_payment_sessions` before its URL is handed out.
3. The client pays on Stripe. Stripe sends them back to `/d?t=…&paid=1&cs=<session>`; the page calls
   `POST /api/payments/confirm`, which re-reads that session from Stripe and applies it the same way as the webhook (so
   the payment shows even if the webhook is a few seconds late), then shows "Paid — thank you" or "Payment received —
   $X is still due".
4. Stripe's Connect webhook (`/api/payments/webhook`) delivers `checkout.session.completed` (card: paid; bank account:
   processing) and later `checkout.session.async_payment_succeeded` / `_failed` for bank payments.
   `record_online_payment()` then, under a lock on the page and the invoice:
   - only accepts a page the server opened, on the account it opened it on (else `unknown_session` / `wrong_account`);
   - records it **once** (a repeat answers `duplicate`), as payment `stripe_<payment intent>`, method `card` or `ach`,
     reference the payment intent, note "Paid online (Stripe)";
   - never records more than the invoice still owes at that moment. Anything beyond (paid twice from two tabs, the
     office recorded a check meanwhile, the invoice was voided) is **refunded automatically** on the connected account
     (idempotency key per page, `refund_application_fee: true`, metadata `pinplan=excess`).
5. The database's money trigger (20261125000400_money_integrity.sql) recomputes the invoice: `amount_paid`,
   `balance_due`, status `partially_paid` / `paid`, `paid_at`. The row syncs to the web app and the iPad app like any
   other payment.
6. **Refunds made in the company's Stripe dashboard** (`charge.refunded`) come back as negative payments
   `stripe_re_<refund>` (once each, never more than was applied). The invoice reopens accordingly.
7. `account.updated` keeps the company's status current; `account.application.deauthorized` (the company removed
   Northpin in its Stripe dashboard) forgets the account.

Voiding an online payment in the app only changes the books (the app warns): money moves only through Stripe refunds.

## Owner setup (once, for the whole platform)

1. **Stripe → Connect → Get started** on the platform account (the one whose `STRIPE_SECRET_KEY` the server uses).
   Choose the platform / marketplace profile, and in **Connect → Settings**:
   - Account types: allow **Standard** accounts (full Stripe dashboard).
   - Branding: your name, icon and colour (shown during the company's onboarding).
   - Onboarding / OAuth: nothing to set (Account Links need no redirect URI or client id).
   - Payment methods for connected accounts: cards on; **ACH Direct Debit** on if you want companies to be able to
     offer US bank account.
2. **Developers → Webhooks → Add endpoint** — a **second** endpoint, separate from the billing one:
   - URL: `https://northpin.app/api/payments/webhook` (your own domain if different)
   - **Listen to: Events on Connected accounts**
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `account.updated`,
     `account.application.deauthorized`
   - Copy its signing secret into `STRIPE_CONNECT_WEBHOOK_SECRET` and turn on failure alerts for the endpoint.
3. **Server settings** (Vercel environment variables, or Cloudflare Worker secrets through the deploy workflow:
   repository secret `STRIPE_CONNECT_WEBHOOK_SECRET`, repository variable `PINPLAN_PAYMENTS_FEE_BPS`):

   | Variable | Value | |
   | --- | --- | --- |
   | `STRIPE_CONNECT_WEBHOOK_SECRET` | the Connect endpoint's `whsec_…` (step 2). Turns the feature on | R for this feature |
   | `PINPLAN_PAYMENTS_FEE_BPS` | platform fee in basis points (100 = 1 %), whole number 0–1000; empty = 0 | O |
   | `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PINPLAN_APP_URL` | already set for billing | R |

4. Run the migration `20261125002100_online_payments.sql` (schema version `20261125002100_online_payments`;
   `/api/health` answers 503 until the database has it). The platform admin's `/api/health` shows
   `config.onlinePayments`: `on`, `off` or `incomplete`.
5. **Test mode first:** with test keys, connect a test company, pay an invoice with `4242 4242 4242 4242`, then with a
   test bank account (`000123456789`, routing `110000000`), refund one in the connected account's dashboard, and check
   the invoice in the app each time.

## For a company (what the office does)

Settings → Quotes & invoices → **Online payments** → **Connect Stripe** → Stripe's onboarding (sign in with an existing
Stripe login or create one; business details, bank account) → back to Settings. Status: *Setup not finished* →
*Waiting for Stripe* → **Taking card payments**. Switches: *Clients can pay invoices online*, *Also accept US bank
account (ACH) on USD invoices*. **Disconnect** makes Northpin forget the account (the company keeps it and its
money). Technicians never see any of this.

Fees: Stripe's own processing fees are charged to the company's Stripe account (it is the merchant), plus the platform
fee if `PINPLAN_PAYMENTS_FEE_BPS` is set. Receipts to the client are Stripe's (the company turns on "Successful
payments" emails under its Stripe settings → Emails).

## Database

- `payment_accounts` (one row per company, `owner_id` = the billing owner): `stripe_account_id`, `charges_enabled`,
  `details_submitted`, `payouts_enabled`, `enabled`, `ach`, `country`, `default_currency`, `connected_by`,
  `connected_at`. RLS: the office of the company reads it; only the server writes it.
- `online_payment_sessions`: every Checkout page the server opened (`id` = `cs_…`, `account_id`, `document_id`,
  `project_id`, `link_id`, `amount`, `currency`, `url`, `expires_at`, `status` open · processing · paid · failed ·
  expired · canceled, `payment_intent`, `payment_id`, `applied`, `excess`, `result`). Server only.
- Service-role functions: `online_payment_target(token)`, `online_payment_session_open(…)`,
  `online_payment_session_update(id, account, status, intent)`, `record_online_payment(…)`,
  `record_online_refund(…)`. Nobody else may call them.
- `document_public()` adds `payOnline` to what `get_document()` / `respond_document()` return.

## Abuse limits

- `/api/payments/checkout`: 20 per 10 minutes per address and 10 per link (shared store, `rate_limit_hit`); the
  token must be a live link; at most one open page per invoice.
- `/api/payments/confirm`: 30 per 10 minutes per address; only for a page opened from that same link.
- `/api/payments/account`: owner/admin only (someone without a team is their own company); 20 per 10 minutes per
  company.
- Webhook: Stripe signature (HMAC-SHA256, 5-minute tolerance) with the Connect endpoint's own secret; body capped at
  1 MB; events without a connected account are ignored.

## iPad / iPhone

Read-only, like the rest of the documents: an invoice paid online shows "Paid online by card" (or bank) in Job → Quotes
& invoices, and the list's footer says that card payments are set up on the web (Settings → Quotes & invoices →
Online payments).

## Not handled (yet)

- Disputes (chargebacks) are handled in the company's Stripe dashboard; the app isn't told. If the company loses one,
  it voids the payment in the app by hand.
- A refund that later fails at the bank (rare, mostly bank-account refunds) stays recorded as refunded.
- Three-decimal currencies (BHD, JOD, KWD, OMR, TND) can't be paid online; zero-decimal currencies (JPY, KRW…) are
  charged in whole units.
- Stripe's minimum charge (about $0.50) applies: a smaller balance can't be paid online (the client is told to use
  the other ways to pay on the invoice).
