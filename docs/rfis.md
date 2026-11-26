# RFIs (requests for information)

A per-job log of questions for the GC, architect or owner ("Where does the FACP go?", "Are these cans IC-rated?"). Each
RFI carries the spot on the plan, photos, a due date and a clear **ball in court**, and goes out as an email with a
link the other side can answer **without an account**. The log is the paper trail for change orders.

Web: **Field → RFIs** (`src/components/rfis/`). iOS: RFIs sync down (`PinPlanCore/FieldSync.swift`, lenient decoding) and drafts made on the device go up; there is no RFI screen yet — the data model below is what it should mirror.

## Workflow

1. **New RFI** (anyone on the job, techs included): subject, question, our suggestion, who it goes to, due date
   (quick picks: 2 days / 5 days / 1 week), priority, cost and schedule impact (yes / no / TBD).
   Attach photos (take one, upload, or pick from the job's photos), job documents, and **pick the spot on the plan**:
   a full-screen sheet picker (zoom 1–6×, tap the spot; tapping on or next to a device links the device).
   Techs save drafts; the office sends.
2. **Send** (owner / admin): makes a share token (24 random URL-safe characters) if there isn't one, freezes the
   company name / contact / phone / email / small logo on the RFI (`sender`), sets **open** with the **ball with
   them**, copies the link and opens the device's email app (`mailto:`) with the text from `emailText()`.
   Resending keeps the same link and the first `sentAt`.
3. **Answer**:
   - through the link: `/q?t=<token>` shows the job address, code, question, suggestion, photos (with mark-up), a crop of
     the plan around the spot, due date and impacts, plus an answer box and a name field. The answer lands on the server
     and arrives on the office's devices on the next sync pull;
   - or **Record answer** in the app when it came by phone, email or in a meeting.
   Either way: status **answered**, **ball with us**, `answeredBy` / `answeredAt` set.
4. **Close** (from open or answered), **Reopen** (back to open, ball with them; the earlier answer is kept and shown
   as "Earlier answer"), **Void** (link stops working). Drafts can be deleted.
5. **PDFs**: one RFI (facts, question, suggestion, answer, plan crop drawn on a canvas with a ring on the spot, photos
   with mark-up) and the **RFI log** (table of all RFIs with status, ball, sent, due, answered and the answer).

Statuses and ball in court (`transition()` in `src/lib/rfis.ts`; anything else throws):

| Action | From | To | Ball | Stamps |
| --- | --- | --- | --- | --- |
| send | draft, open | open | them | `sentAt` (first time only), `shareToken` |
| answer | open | answered | us | `answer`, `answeredBy`, `answeredAt` |
| close | open, answered | closed | us | `closedAt` |
| reopen | answered, closed | open | them | clears `closedAt`, keeps the answer |
| void | draft, open, answered, closed | void | us | `closedAt` |

**Overdue** = open and `due` < today (due today is not overdue). The list filters are Open (draft / open / answered),
With them (open, ball with them), Overdue and All; the summary shows open, with them, overdue and the average days from
sent to answered.

## Permissions (`canRfi(role, action)`)

| | Tech | Owner / admin / no team |
| --- | --- | --- |
| view, create, edit drafts, add photos | yes | yes |
| edit after sending, send, record answer, close, reopen, void, delete draft | no | yes |

RFIs have no prices. The database lets any member of the job read and write them (same as checklists); the role rules
are app-side.

## Offline

Create, edit and send work offline (Dexie, queued for sync). A sent RFI whose row is still in the sync queue shows
"Will be live once synced": the link only works once the row (with its token) reaches the cloud. Without Supabase
configured the link section says links need cloud sync, and the email asks them to reply instead (record the answer
by hand).

## Data model

Local Dexie table `rfis` (db version 27: `id, projectId, status, updatedAt`), Supabase `public.rfis`
(`supabase/migrations/20261123100700_rfis.sql`), sync mapping in `src/lib/syncMap.ts`, included in project backups.
Soft deletes (`deleted`). Unknown fields must be ignored when decoding (iOS: decode leniently).

| App (camelCase) | Column | Type | Notes |
| --- | --- | --- | --- |
| id | id | text PK | nanoid |
| projectId | project_id | text | job |
| number | number | integer | per job, `nextRfiNumber()` = highest ever + 1 (deleted/void included); shown as `RFI-007` |
| subject | subject | text | |
| question | question | text | |
| suggestion | suggestion | text? | our proposed answer |
| status | status | text | draft / open / answered / closed / void |
| ballInCourt | ball_in_court | text | us / them |
| priority | priority | text? | low / normal / high |
| costImpact, scheduleImpact | cost_impact, schedule_impact | text? | yes / no / tbd |
| toName, toEmail, toCompany | to_name, to_email, to_company | text? | |
| cc | cc | jsonb string[]? | |
| due | due | date? | YYYY-MM-DD |
| sheetId, x, y | sheet_id, x, y | text?, double? | relative 0–1 like markers |
| markerId | marker_id | text? | linked device |
| taskId | task_id | text? | "Linked task #n" is shown only when the install has a `tasks` table |
| photoIds, documentIds | photo_ids, document_ids | jsonb string[]? | job photos / job documents |
| answer, answeredBy, answeredAt | answer, answered_by, answered_at | text?, text?, timestamptz? | |
| shareToken | share_token | text? | unique (partial unique index); synced |
| (server only) | share_expires_at | timestamptz? | when the `/q` link stops working: set by the database a year after it is shared or sent again; `/api/rfis/public` answers 404 after it |
| sentAt, closedAt | sent_at, closed_at | timestamptz? | |
| createdBy | created_by | text? | display name; never shown on the public page |
| sender | sender | jsonb? | `{company, contact, phone, email, website, logo, brandColor}` frozen at send (logo only if ≤ 300 KB, data:/https) |
| createdAt, updatedAt, deleted | created_at, updated_at, deleted | | plus server `synced_at` |

Numbering is per device + sync: two people creating RFIs offline on the same job at once can pick the same number
(rare; edit one). Codes are display only, the id is the key.

### Database rules

- RLS `rfis_member`: `is_project_member(project_id)` for everything. `anon` has no access at all.
- `rfis_write_guard`: the billing read-only lock (`job_write_guard()`), installed by this migration.
- `rfis_keep_answer`: a stale offline copy (an app push from a device that hadn't seen the latest server row) never
  undoes what already happened: a push that blanks `answered_at` keeps the stored answer (and, if it says draft/open,
  sets answered / ball with us); a push that turns a sent RFI back into a draft, drops its share token, brings a void
  RFI back, or deletes a draft that was sent meanwhile keeps the server's status/token. In every such case
  `updated_at` is stamped newer so that device pulls the row back. The app never clears `answered_at` (reopen keeps
  it), never un-sends and never un-voids, so this only catches stale copies. iOS must follow the same rules.
- The answer route stamps `updated_at` past the row's current value even when the last saving device's clock ran
  ahead of the server, so every device pulls the answer.

## Public answer route

`src/app/api/rfis/public/route.ts`, service role on the server only (`SUPABASE_SERVICE_ROLE_KEY`):

- `GET ?t=<token>` → `publicRfiView()` (whitelist: code, subject, question, suggestion, status, priority, impacts, due,
  sentAt, to name/company, job address, answer/by/at, sender block, photos as signed URLs with their mark-up, plan sheet
  as a signed URL with x/y). 404 for unknown tokens and for draft, void or deleted RFIs (all look the same).
- `POST {t, answer, name}` → only while open (`PATCH … status=eq.open`, so two answers can't both land): sets answer,
  answered_by, answered_at, status answered, ball us and `updated_at = now` (so the office's pull picks it up). 409 once
  answered/closed, 400 for an empty answer or name, 429 when rate-limited (per IP and per link), 501 without the service key.

Signed URLs last 24 hours; the page fetches fresh ones on every load.

## iOS notes (to build)

Mirror `src/lib/rfis.ts` in PinPlanCore (`nextRfiNumber`, `rfiCode`, `transition`, `isOverdue`, `rfiSummary`, `canRfi`,
`emailText`) with the same tests as `tests/rfis.test.ts`; add `rfis` to the sync table list after `salesPayments`.
Use `MFMailComposeViewController` (or `mailto:`) for the email and the share sheet for the link.
