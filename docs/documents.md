# Quotes, invoices and credit notes

PinPlan's own estimating / invoicing, for companies that don't use Billdu or QuickBooks. This page is the contract for
the web app, the database and the iPad app (which mirrors it). Code: `src/lib/documents.ts` (pure logic),
`src/lib/docFromEstimate.ts` (estimate → quote), `src/lib/docActions.ts` / `src/lib/docSettings.ts` (web I/O),
`supabase/migrations/20261122000000_documents.sql` (schema, RLS, RPCs), tests in `tests/documents.test.ts`,
`tests/documentEmail.test.ts` and `supabase/tests/documents_test.sql`.

## Concepts

- **One document model, three kinds**: `quote`, `invoice`, `credit_note`. "Estimate", "Quote" and "Proposal" are the
  same thing to an installer, so there is a single `quote` kind whose title is a company setting
  (`kinds.quote.label`, default "Estimate") and can be overridden per document (`title`).
- Documents **belong to a job** (`project_id`). Access follows the job: `is_project_member(project_id) and not is_tech()`.
  Technicians never see money (no rows, no settings, no links; the app hides the Billing tab and /invoices).
- Documents are **frozen copies**: a quote made from the Estimate tab copies its lines; editing the quote never changes
  the estimate, and vice versa.
- **Local-first**: documents and payments live in IndexedDB (Dexie tables `salesDocs`, `salesPayments`) and sync like
  every other job table (`syncMap.ts`, pushed after `projects`). Deletes are soft. Only **drafts** can be deleted;
  issued documents are **voided** (their number stays used).

## Tables

### `sales_documents` (Dexie `salesDocs`, type `SalesDoc`)

| column | type | notes |
|---|---|---|
| `id` | text pk | client id (nanoid) |
| `project_id` | text → projects | |
| `owner_id` | uuid | **server-set**: the company (job owner's team owner, or the job owner when solo). Never sent by apps. |
| `kind` | text | `quote` · `invoice` · `credit_note` (fixed once numbered) |
| `title` | text? | overrides the kind's label |
| `number` / `number_seq` | text? / int? | **server-set** when issued (see Numbering). Apps send `number` but it's ignored. |
| `status` | text | see Statuses |
| `issue_date`, `due_date`, `valid_until` | date? | `YYYY-MM-DD`; due for invoices, valid-until for quotes |
| `terms_days` | int? | payment terms (0 = due on receipt; 7/15/30/45/60 or any) |
| `client` | jsonb | `DocClient` `{name, company?, email?, phone?, billingAddress?, siteAddress?}` (snapshot, not a link) |
| `lines` | jsonb | `DocLine[]` (below) |
| `discount` | jsonb? | `Adjust` `{type: "pct"|"fixed", value}` — before tax |
| `taxes` | jsonb | `DocTaxRate[]` `{id, name, rate}` (rate in %, e.g. 8.875) |
| `fees` | jsonb? | `DocFee[]` `{id, label, amount, taxable?}` (shipping, permits) |
| `deposit` | jsonb? | `Adjust` — deposit asked for (quotes: on acceptance) |
| `deductions` | jsonb? | `DocFee[]` — final invoices: amounts already invoiced, taken off **after** tax |
| `currency` | text | ISO 4217 |
| `notes`, `terms`, `footer` | text? | shown to the client |
| `internal_notes` | text? | **never** shown to the client (not in the snapshot) |
| `options` | jsonb? | `DocOptions` `{detail?: "lines"|"sections", columns?: Partial<DocColumns>, template?: "classic"|"modern"|"compact", plansUrl?, requireSignature?}` |
| `subtotal`, `discount_total`, `tax_total`, `total`, `amount_paid`, `balance_due` | double | denormalised by the app (`withTotals`) for lists; `amount_paid` includes credit notes |
| `source` | text | `manual` · `estimate` · `quote` · `invoice` · `duplicate` |
| `converted_from` | text? | the document this came from (quote → invoice, invoice → credit note, duplicate) |
| `invoice_type` | text? | `standard` · `deposit` · `progress` · `final` |
| `billed_pct` | double? | deposit / progress % of the quote |
| `share_token`, `share_hash` | text? | current client link token and a fingerprint of what it shows (stale-link warning) |
| `sent_at`, `viewed_at`, `responded_at`, `voided_at` | timestamptz? | |
| `signer_name`, `signature`, `client_note` | text? | **server-set** client answer (signature = PNG data URL ≤ 400 kB) |
| `paid_at` | date? | day the invoice was paid in full |
| `created_at`, `updated_at`, `deleted`, `synced_at` | | as every synced table |

`DocLine`: `{id, kind?: "item"|"section", description, details?, sku?, qty, unit?, unitPrice, discount?: Adjust,
taxable, taxIds?: string[] (subset of the document's taxes; null = all), optional?: boolean, key?: estimate line key}`.
A `section` row is a heading; the items after it belong to it.

### `sales_document_payments` (Dexie `salesPayments`, type `DocPayment`)

`id`, `project_id`, `document_id`, `amount` (+ payment, − refund), `paid_on` (date; app field `date`),
`method` (`cash` · `check` · `card` · `ach` · `zelle` · `other`), `reference`, `note`, `voided` (kept, not counted),
`created_at`, `updated_at`, `deleted`, `synced_at`. After any change the app recomputes the invoice
(`paymentSummary` → `amount_paid`, `balance_due`, `status`, `paid_at`) and saves it.

### `document_settings`

One row per company: `owner_id` (= `my_billing_owner()`), `config` (`DocumentSettings` JSON), `updated_at`, `updated_by`.
Readable by the office, written by owner/admins (and solo users). The apps cache it (web: `AppSettings.documents`);
newest `updatedAt` wins. Number formats in `config.kinds.<kind>.format` / `.yearlyReset` drive the server's numbering.

`DocumentSettings`: `kinds.{quote,invoice,credit_note}.{label, format, yearlyReset, terms, notes, footer}`,
`paymentTermsDays`, `quoteValidDays`, `depositPct`, `lateFee`, `taxes[] {id,name,rate,default}`, `laborTaxable`,
`currency`, `locale`, `columns {qty,unit,unitPrice,discount,tax,sku,lineTotal}`, `grouping`
(`category`|`floor`|`room`|`flat`), `detail`, `lineDetails`, `template`, `payment {instructions, bank, zelle,
checkPayable, payUrl}`, `signatureOnQuotes`, `reminders {enabled, daysBeforeDue, daysAfterDue[]}`, `updatedAt`.
Defaults: `DEFAULT_DOC_SETTINGS`; always read through `normalizeDocSettings`.

### `document_counters`

`(owner_id, kind, period)` → `next_value`. `period` = the year for yearly-reset formats, else 0. No RLS policies: only
the functions below touch it.

### `document_links`

Published client links: `id` (token, ≥ 20 chars), `document_id`, `project_id`, `owner_id` (publisher),
`snapshot` (`DocSnapshot`, frozen), `status` (`active` · `revoked`, one-way), `viewed_at`, `view_count`,
`responded_at`, `response_notified_at`. Apps may only insert and revoke; the stamps are the server's.

## Statuses

Stored: `draft → sent → viewed → accepted | declined` (quotes) and
`draft → sent → viewed → partially_paid → paid` (invoices), any issued document → `void`. Credit notes: `draft → sent`.

Never stored, worked out by `displayStatus(doc, today)`:
- `overdue`: an issued invoice (not paid/void) with `balance_due > 0` and `due_date < today`;
- `expired`: a `sent`/`viewed` quote with `valid_until < today`.

Invoice status after money changes (`invoiceStatus`): `paid` when `total > 0` and balance ≤ 0; `partially_paid` when
anything was paid or credited; otherwise back to `viewed` / `sent`. Drafts and void never change.

The database keeps the client's answer: once `responded_at` is set, a device pushing an older copy cannot clear the
signature or move the status back to draft/sent/viewed; `viewed_at` sticks the same way. Apps cannot write a signature.
The office may still mark a quote accepted/declined by hand (no signature). A quote the client signed is read-only in
the app (duplicate it to change it).

## Money

`documentTotals(doc)` — every step rounded to cents, half away from zero (`money`, same as the estimate):
1. each item: `gross = money(qty × unitPrice)`, line discount (% or fixed, never past the line), `net`;
   `optional` items are listed but not counted;
2. `subtotal` = Σ net of counted items; per-section totals for "section totals only";
3. document `discount` (% of subtotal or fixed) — spread over the lines in proportion, so tax is on the discounted
   amount;
4. `fees` added; taxable fees join the tax base;
5. each tax: `base` = Σ (net × (1 − discount share)) of taxable items that the tax applies to (+ taxable fees),
   `amount = money(base × rate / 100)`;
6. `grossTotal = subtotal − discount + fees + Σ taxes`; `total = grossTotal − Σ deductions`;
7. `deposit` = % of total or fixed.

Payments: `paid` = Σ non-voided payments (refunds negative); `credited` = Σ totals of issued, non-void credit notes
whose `converted_from` is the invoice; `balance = total − paid − credited`.

## Numbering

Formats use `{YYYY}` `{YY}` `{MM}` and `{0000}` (zero-padded to that many digits, never cut) or `{#}` (bare); a format
without a counter token gets `{0000}` appended. Defaults: quotes `EST-{0000}`, invoices `INV-{YYYY}-{0000}` (restarts
each January), credit notes `CN-{0000}`. `formatDocNumber` (TS) and `format_document_number` (SQL) are the same function.

Numbers are unique per company and per kind (unique index `(owner_id, kind, number)`), **given only by the database**:
- the row guard numbers a document the moment it arrives (insert or update) with `status <> 'draft'` and no number,
  taking the next value from `document_counters` under a row lock and skipping numbers already used;
- an upsert of an existing row is numbered on its UPDATE step only, so syncing never burns numbers;
- numbering bumps `updated_at`, so the issuing device's next pull receives the number (and the web pull also merges a
  server number into a local row that looks newer — clock skew).

**Offline**: issuing sets `status = 'sent'` locally; the list and editor show "number pending" / "number comes on the
next sync" until the row has synced. Nothing else waits on it (PDF and preview show "—"). A client link needs the cloud,
so publishing first syncs and then reads the number back. Without cloud sync at all (single-device mode), the device
numbers documents itself from a local counter.

`set_document_next_number(kind, n)` (owner/admin) moves the counter for the current period; `document_numbering()`
returns `{kind: {next, preview}}` for Settings.

## Conversions

- **Estimate → quote** (`quoteFromEstimate`): the job's priced estimate (`projectEstimate`) → lines, grouped by
  - `category` (Security, Network, Audio… then Cabling, Labor, Infrastructure, Additional items),
  - `floor` (one section per sheet; each line's quantity split over the floors its markers / LED runs / home runs are
    on, exact integers by largest remainder; feet to 0.01),
  - `room` (`Floor · Room` when there are several floors; LED by floor; cabling in one section),
  - `flat`.
  Options: device details under each line (rooms / labels), "section totals only", list optional "?" items.
  Unpriced lines are left off (as on the estimate PDF). Labor lines are untaxed unless `laborTaxable`.
- **Quote → invoice** (`invoiceFromQuote`): `full` (all counted lines), `deposit` / `progress` (one untaxed line for
  pct % of the quote total, taxes included), `lines` (chosen lines, with their headings), `final` (all lines, with the
  quote's discount, fees and taxes, plus `deductions` for each earlier non-void invoice from the quote). Deposit +
  progress + final add up to the quote total to the cent.
- **Invoice → credit note** (`creditNoteFor`): its lines, to edit down; once issued it reduces the invoice balance.
- **Duplicate**: a fresh draft (no number, link, answer or payments).

## Client link

Publishing (`publishLink`): issue if draft → sync → read the server number → `buildDocSnapshot` → insert into
`document_links` → save `share_token`/`share_hash` on the document → only then revoke the previous link.
`DocSnapshot` holds everything the page shows (business, client, lines with nets, sections, totals, taxes, notes, terms,
footer, payment instructions, layout, columns) — never internal notes or payments.

RPCs (security definer, `anon` + `authenticated`):
- `get_document(p_token) → jsonb | null`: `{snapshot, kind, status, number, total, amountPaid, balanceDue, dueDate,
  validUntil, respondedAt, signerName, clientNote, paidAt, expired, overdue}` (live money and status, frozen lines).
  Marks the document `viewed` (from `sent`) and counts the view. Null for unknown / revoked / deleted.
- `respond_document(p_token, p_accept, p_name, p_signature, p_note) → jsonb`: quotes only, once, before
  `valid_until`; accepting needs a name, and a signature when `snapshot.requireSignature`.

Office RPCs (`authenticated`): `issue_document(p_id) → number`, `document_numbering()`, `set_document_next_number`.

## Email (needs `RESEND_API_KEY` + `EMAIL_FROM`; `GET /api/email/status`)

- `POST /api/documents/email {documentId, token, to, kind: "document"|"reminder"|"receipt", message?}` — office only;
  reads the link and document with the caller's token (RLS). Sends the company-branded email with the link (and the
  pay-online link for invoices); replies go to the business email on the snapshot.
- `POST /api/notify/document-response {token}` — called by the client page after an answer; emails whoever published
  the link, once (`response_notified_at` claim).

## Pay online

`payment.payUrl` is the company's own link (Stripe Payment Link, Square, PayPal…) with `{amount}` (balance, 2 decimals),
`{number}` and `{currency}` filled in (`payUrl()`); only http(s) links are used. PinPlan doesn't take payments itself;
record them with "Record payment".

## Reminders

`reminderDue(doc, settings.reminders, today)` flags invoices `daysBeforeDue` before the due date and on/after each of
`daysAfterDue`. The Invoices page lists them; sending is one click (email "Payment reminder"). No scheduled sending.

## Billing lock

`sales_documents`, `sales_document_payments` and `document_links` have the `job_write_guard` trigger: a lapsed
subscription makes them read-only like every job table; `issue_document` checks it too.

## iPad / iPhone

The native app pulls `sales_documents` and `sales_document_payments` for people who see prices (never for
technicians) and shows them read-only under **Job → Quotes & invoices**: number, status (overdue / expired worked out
the same way as `displayStatus`), total and balance due, with **Open on the web** for everything else. It never
writes these tables. The estimate's "Invoiced so far" bar adds issued invoices (less credit notes, before tax) to
Billdu invoices. Code: `ios/PinPlanCore/Sources/PinPlanCore/SalesDocs.swift`, `ios/PinPlan/Money/`.
