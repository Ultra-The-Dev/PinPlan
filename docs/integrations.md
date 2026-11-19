# Accounting integrations

How invoices get from PinPlan into a company's books. Each company picks what suits it:

| Way | Status | Needs |
| --- | --- | --- |
| **Export for accountant** (Invoices page): QuickBooks Online CSV, Xero CSV, QuickBooks Desktop IIF, plain CSV | Live at launch | Nothing |
| **QuickBooks Online** (Settings → Connected apps) | Beta, off until keys are set | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` |
| **Xero** (Settings → Connected apps) | Beta, off until keys are set | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` |
| **Billdu** (Settings → Billdu) | Live | The company's own Billdu API key (see `docs/billdu.md`) |

Only **issued** invoices and credit notes ever leave PinPlan: never drafts, never quotes. Void documents are left out
of exports, and a document that was already pushed and is then voided in PinPlan is voided in the accounting app
(QuickBooks credit memos are deleted, as its API can't void them).

## The lines always add up

Every export and push is one line per PinPlan line, built by `exportLines()` in `src/lib/accountingExport.ts` from the
same maths as the document (`lineAmounts` / `documentTotals` in `src/lib/documents.ts`):

1. each item at quantity × unit price (before any discount); optional lines and section headings are left out;
2. one **Discount** line (line discounts plus the document discount), negative;
3. each **fee**;
4. one line per **tax** (its amount, on the tax item / tax account);
5. **deductions** on final invoices ("less amount already invoiced"), negative.

So the lines add up to the document total to the cent (tested in `tests/accountingExport.test.ts`, including random
documents). Every line is sent as **not taxable** (QuickBooks tax code `NON`, Xero `LineAmountTypes: NoTax`), because the
tax is already its own line: the accounting app must not add tax again. Credit notes are the same lines with the sign
turned around (QuickBooks credit memo, Xero `ACCRECCREDIT`).

After a push PinPlan compares the accounting app's total with its own and shows a warning (and logs it) when they
differ, which usually means a tax or item setting in the accounting app needs a look.

## Export for accountant

Invoices page → **Export for accountant**: pick a date range (issue date), then **Download**. Under **More**:

- **Format**: QuickBooks Online CSV (default), Xero CSV, QuickBooks Desktop IIF (invoices, credit memos and the payments
  against the invoices in the file; tab-separated, CRLF), or a plain CSV.
- **Names in your books**: product/service names, income / tax / receivable accounts, Xero tax type, date format. They
  are saved for the whole company (`integration_connections`, provider `export`) and kept on the device when offline.

Spreadsheet formula injection is blocked: text starting with `=`, `+`, `-` or `@` gets a leading `'`. Documents issued
offline that don't have their number yet export as `PENDING-xxxxxxxx`.

When QuickBooks Online or Xero is connected, the same dialog also offers **Send to QuickBooks Online / Xero** for
every issued document in the range (unchanged ones are skipped).

## Connected apps (QuickBooks Online and Xero)

Settings → **Connected apps** (office only; technicians never see it). Each app shows Connect / Disconnect, the
connected company and the last sync. **More** has the mapping (which product/service or account each kind of line goes
to) and the last 20 events.

Rules the server enforces (`src/lib/server/integrations/`):

- **Office only**: technicians get 403. Signed-in accounts only (servers with just an access code can export files).
- **Subscription**: connect, test and push answer **402 `subscription_inactive`** when the team's trial ended or the
  subscription lapsed (the same rule as the database's write lock). Disconnect always works.
- **Sign-in state**: HMAC-signed (key derived from `PINPLAN_ENCRYPTION_KEY`), valid 10 minutes, bound to the provider
  and company, with a random nonce stored in `integration_oauth_states` and deleted on first use, so a callback URL
  can't be replayed. Xero also uses PKCE (S256); the verifier never leaves the server.
- **Tokens** are encrypted with AES-256-GCM (`src/lib/server/secrets.ts`), bound to the company and provider. Refreshes
  use a compare-and-swap on `integration_connections.version`, so two servers never both rotate the same token.
  A refused refresh (`invalid_grant`) marks the connection **needs reconnect** and Settings asks to connect again.
- **Idempotency**: every create/update carries a key derived from the company, document and its content (QuickBooks
  `requestid`, Xero `Idempotency-Key`), so a retried request is applied once. A document whose content hasn't changed
  since its last successful push is not sent again.
- **Payments** on an invoice are sent with it (QuickBooks Payment linked to the invoice; Xero payment against the
  invoice, which needs the bank account code under More). Voided payments are removed there. Refunds aren't sent.

### Tables (`supabase/migrations/20261124100700_integrations.sql`)

`integration_connections` (one per company and provider: status, encrypted tokens, expiry, meta such as the QuickBooks
realm id / Xero tenant id, mapping settings), `integration_links` (local invoice / credit note / payment / customer →
remote id, QuickBooks SyncToken, content hash, last error), `integration_events` (audit trail), and
`integration_oauth_states`. RLS is on and there are no policies for `anon` / `authenticated`: only the server (service
role) reads or writes them. Tests: `supabase/tests/integrations_test.sql`.

### Routes

`GET /api/integrations` and `/api/integrations/[provider]/{status,connect,callback,test,push,disconnect,settings,links}`,
implemented in `src/lib/server/integrations/routes.ts`. Providers implement the interface in `types.ts`
(`connect, callback, refresh, disconnect, test, pushInvoice, pushPayment, pushCustomer`) and are listed in
`registry.ts`. Billdu is wrapped by `billdu.ts` without changing the existing Billdu code.

## Server setup

Environment variables (names only; set the values in the hosting dashboard, never in the repo):

| Variable | What |
| --- | --- |
| `PINPLAN_ENCRYPTION_KEY` | Already required: encrypts tokens and signs the sign-in state. Changing it disconnects every app. |
| `PINPLAN_APP_URL` | The public app address, e.g. `https://app.example.com`. Builds the redirect URIs; set it so they match exactly. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already required for accounts; the integration tables live there. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` | From the Intuit developer portal (app → Keys & credentials). |
| `QBO_ENVIRONMENT` | `sandbox` while testing with development keys; leave unset (production) for live keys. |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | From the Xero developer portal (My apps → your app → Configuration). |
| `XERO_SCOPES` | Optional. Defaults to `offline_access accounting.transactions accounting.contacts accounting.settings.read`; set it if Xero assigns your app the newer granular scopes. |

Redirect URIs to register with each provider (replace the host with `PINPLAN_APP_URL`):

- QuickBooks Online: `https://<your app host>/api/integrations/quickbooks/callback`
- Xero: `https://<your app host>/api/integrations/xero/callback`

Then run the migration `20261124100700_integrations.sql`. Each provider stays hidden as "Not available yet" until both
of its keys are set.

Before turning QuickBooks Online on for customers, Intuit requires its app review (production keys, privacy policy and
terms URLs, an end-user licence, and the security questionnaire). Xero requires certification for more than a small
number of connected organisations. Until then keep the providers off and point companies to Export for accountant.

## Not yet

- A per-invoice "Send to QuickBooks / Xero" button and a "sent" badge in the invoice editor (the API is ready:
  `POST /api/integrations/[provider]/push` and `GET …/links?ids=`).
- Automatic push when an invoice is issued or a payment is recorded (today: on request, from the Invoices page).
- Reading payments back from the accounting app.
