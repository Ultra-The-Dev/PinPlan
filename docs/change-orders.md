# Change orders

Extras are where small contractors lose the most money: work done on a verbal OK and never billed. A change order (CO)
prices the extra from the same catalog as the estimate (or straight from devices added or marked tentative on the plan),
goes to the client as a link they sign on a phone, and keeps a per-job log with the revised contract value.

Office only: everything here is behind `can(role, "prices")` in the apps and `not is_tech()` in the database.
Approved change orders are billed from the invoice dialog or "Bill this change" (see [Invoicing](#invoicing)).

## Where things live

| What | File |
| --- | --- |
| Pure logic (pricing, totals, life cycle, contract value, client view) | `src/lib/changeOrders.ts` (tests: `tests/changeOrders.test.ts`) |
| Types `ChangeOrder`, `ChangeOrderLine`, `ChangeOrderPublicView` | `src/lib/types.ts` |
| Local table | Dexie `changeOrders` (`src/lib/db.ts`, version 28): `id, projectId, status, updatedAt` |
| Cloud table + RLS + guard | `supabase/migrations/20261123100800_change_orders.sql` (`public.change_orders`) |
| Sync mapping | `src/lib/syncMap.ts` (`changeOrders`, pushed after `salesPayments`) |
| Job tab "Changes" | `src/components/changeOrders/ChangeOrdersTab.tsx`, `ChangeOrderEditor.tsx`, `AddFromPlanDialog.tsx`, `DevicePicker.tsx` |
| PDFs (one CO with signature block; the CO log) | `src/components/changeOrders/ChangeOrderPdf.tsx` |
| Client link page `/co?t=<token>` | `src/app/co/page.tsx`, `src/components/changeOrders/PublicChangeOrder.tsx` |
| Client API (service role) | `src/app/api/change-orders/public/route.ts` |

## Data model

`ChangeOrder` (camelCase locally, snake_case in Postgres; every optional field may be missing — readers, including the
iPad app, must tolerate unknown and missing keys):

| Field | Column | Notes |
| --- | --- | --- |
| `id`, `projectId` | `id`, `project_id` | text ids like every synced table |
| `number` | `number` int | 1, 2, 3… per job, shown as `CO-001` (`coCode`). `nextCoNumber` = highest + 1 (void and revised numbers are never reused). A revision keeps its number. |
| `title`, `reason`, `description` | same | reason: `client_request` · `plan_revision` · `field_condition` · `rfi` · `other` |
| `status` | `status` | `draft` · `sent` · `approved` · `rejected` · `void` |
| `lines` | `lines` jsonb not null | `ChangeOrderLine[]`, see below |
| `markupPct`, `taxPct` | `markup_pct`, `tax_pct` | prefilled from the job's pricing (project pricing over global) |
| `scheduleDays` | `schedule_days` | working days added (negative = saved) |
| `photoIds`, `rfiId`, `sheetIds`, `markerIds` | jsonb / text | evidence; soft links (no foreign keys). `photoIds` are `Photo.id`s. |
| `shareToken` | `share_token` (unique) | client link token (20+ chars, same generator as proposals) |
| `publicView` | `public_view` jsonb | what the link shows, frozen when sent (`publicCoView`) |
| (server only) | `share_expires_at` timestamptz | when the link stops working: set by the database a year after the link is shared or sent again (`20261126001000_audit_hardening.sql`); `/api/change-orders/public` treats an expired link as unknown (404) |
| `sentAt`, `respondedAt` | timestamptz | |
| `approvedName`, `signatureImageId`, `clientComment` | text | the answer. The signature PNG is stored like every job file: storage bucket `plans`, path `<projectId>/<signatureImageId>`, and pulled into the local `images` table by sync. |
| `createdBy`, `createdAt`, `updatedAt`, `deleted` | | soft deletes, last write wins |

`ChangeOrderLine`: `{ id, kind, deviceTypeId?, description, qty, unit, unitPrice, taxable? }`

| kind | Priced as |
| --- | --- |
| `device` | the estimate's price for that device type (or the job's chosen product): `priceDeviceLine` — material × (1 + pricing markup) (+ labor when labor is combined), rounded to cents exactly like `buildEstimate` |
| `labor` | per device (`priceLaborLine`, when labor is listed separately) or hours × the job's labor rate (`pricing.laborRate`, an optional key stored in the project's `pricing` JSON) |
| `material` | cost; the CO's `markupPct` is added per unit |
| `custom` | as typed |

Negative quantities are credits (work taken out). `taxable` defaults to true.

## Money

`changeOrderTotals(co)` → `{ subtotal, markup, tax, total }`, all in cents, rounded half away from zero with
`money()` from `estimate.ts`:

- `subtotal` = Σ money(qty × unitPrice) (before markup);
- `markup` applies to **material lines only** (catalog devices already include the pricing markup, labor is never marked
  up — the same rule as the estimate). Like the estimate it is applied to the unit price and rounded first, so the
  client's lines (`sellLines`) add up exactly to `subtotal + markup`;
- `tax` = money(Σ taxable client line totals × taxPct / 100);
- `total` = subtotal + markup + tax.

`contractSummary(estimateTotal, cos)` → `{ original, approved, pending, revised }`: approved = Σ approved CO totals,
pending = drafts + sent, revised = original + approved. The Changes tab computes `original` with `projectEstimate`
over the plan **without** devices that sit on a live (draft / sent / approved) CO (`baseContractMarkers`), so
confirming those devices on the plan never counts them twice.

## Life cycle

`transition(co, action, now, opts)` (throws when not allowed):

| from \ action | send | approve | reject | void | revise |
| --- | --- | --- | --- | --- | --- |
| draft | sent | approved | rejected | void | — |
| sent | sent (same link) | approved | rejected | void | original → void, new draft copy |
| approved | — | — | — | — | — |
| rejected | — | — | — | void | new draft copy |
| void | — | — | — | — | new draft copy |

- Only drafts are editable. **Approved change orders are final** (in the apps and in the database).
- `approve` needs a name: the client's typed name on the link, or the office's "Mark approved" (verbal / paper OK, or the
  client signs on the office tablet — that signature is saved like a photo and synced).
- `revise` copies the lines into a new draft with the same number and the title suffix `(rev 1)`, `(rev 2)`…
- Approving a CO does **not** change markers or estimate lines. The editor offers "Mark these devices as confirmed in
  the plan", which sets `tentative = false` on the CO's devices through the editor store (`updateMarkers`, one undo step).

## The client link

1. **Send** freezes `publicView = publicCoView(co, project, settings)`: code, title, reason, description, schedule days,
   client prices per line (no cost, markup %, line kinds, device ids, markers, RFI, internal notes or creator), totals,
   the company's branding (same source as proposals: Settings → business) and the attached photos.
2. The row syncs; until then the editor shows "Waiting to sync — the link works once this device is online". Without
   cloud sync the link can't work: approve by hand.
3. `GET /api/change-orders/public?t=` (service role, rate-limited) returns the frozen view, the live status and the
   answer, with short-lived signed links to the photos. Drafts and deleted rows are 404, void links 410.
4. `POST /api/change-orders/public {t, decision: "approve"|"reject", name, signature, comment}`: only while `sent`.
   Approve needs a name and a PNG data URL signature (≤ 200 KB decoded, PNG magic checked). The signature is uploaded to
   `plans/<project>/<id>`, then one conditional update (`status = sent`) sets `status`, `approved_name`, `responded_at`,
   `signature_image_id`, `client_comment`, `updated_at`. A second answer gets 409.

## Database rules (`20261123100800_change_orders.sql`)

- RLS: select / insert / update for project members who are **not** techs (`is_project_member(project_id) and not
  is_tech()`, like `estimate_lines`). No delete policy (soft deletes). `anon` has no access; clients go through the route.
- `change_orders_guard`: for app writes, an approved or void row is kept exactly as it is (every column), a row that
  was sent never goes back to draft (a stale offline draft would kill the client's link), and a rejected row keeps
  its answer and can only become void. The kept row is stamped newer so the device that pushed a stale copy pulls
  the right one back. The route likewise stamps the client's answer past the stored `updated_at`, so an office device
  whose clock runs ahead still takes it.
- `job_write_guard` (read-only when the subscription lapsed) and the `synced_at` trigger + index, like every job table.

## Invoicing

`approvedLinesFor(cos)` (and `approvedChangeOrderLines(projectId)`, which reads the local database) return each
approved CO with its client lines, tax % and totals; `billableChanges(cos, billed)` turns the ones not billed yet into
invoice sections. They go on an invoice from the quote ("Include approved change orders", default on for the remaining
balance) or on their own ("Bill this change" on the approved CO). The invoice records `options.changeOrderIds`, so each
CO is billed once; voiding the invoice frees it. See docs/documents.md → Conversions.

The Change orders tab compares against the job's **approved quote** (`contractFromQuote`: "Approved quote" →
"Approved changes" → "New contract total"); without one, the live job pricing stands in, labelled "Not approved yet".

## iPad app (not built yet)

Mirror `src/lib/changeOrders.ts` in PinPlanCore: `priceDeviceLine`/`priceLaborLine` reuse `Money.round` and the
estimate's per-unit price; `changeOrderTotals`, `transition`, `contractSummary`, `coCode`, `nextCoNumber`. Decode
`change_orders` rows tolerantly (`lines` items may gain fields; `public_view` can be ignored by the app). The client link
and server route are shared; an iPad "Send" must write `public_view` the same way.
