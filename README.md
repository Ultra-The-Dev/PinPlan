# PinPlan — Floor Plan Device Mapper

Tablet-first web app (PWA) for low-voltage / smart-home installers: upload the client's plan set, tap to place every device,
get an automatic per-floor takeoff (counts, LED linear feet, cable by wire type), turn it into a priced estimate, and push it
to Billdu as an estimate, order or invoice. Spec: [PLAN.md](PLAN.md).

## Features
- **Plan import** — multi-page PDF (each page → a sheet, floor name guessed from the title block), phone photos (JPG/PNG/HEIC)
  with auto page-edge detection (OpenCV.js) and manual 4-corner straightening. Rename/reorder sheets.
- **Markup** — searchable device menu by category with a “room for new devices” field, tap to place, drag to move, tap/long-press to edit (room, auto label `CAM-1-03`,
  mount, wire type, home-run closet, notes, photo, tentative `?`). LED runs (zone, switch, LF measured or typed), stair LED
  (steps × LF/step), closets (equipment / switch / rack), wire runs and one-tap auto home runs. Layers, undo/redo, pinch-zoom,
  duplicate device, rotate a sheet with its markup, measure tool (feet-inches from the scale), find any device by label or room
  (jumps to its floor and centres it), keyboard shortcuts on a laptop (V select, M measure, F fit, L labels, ⌘Z / ⇧⌘Z, Delete).
- **Scale** — type the plan scale (PDF sheets) or draw a line over a known dimension.
- **Takeoff** — per floor and whole house, tentative items listed separately; CSV and marked-up plan PDF with legend and
  per-floor count box.
- **Crew** — wiring-only sheets by layer (no prices) with a home-run schedule; CSV.
- **Estimate** — catalog prices, markup, labor (combined or separate), wire $/ft, tax; override/remove/add lines; optional
  tentative lines; branded client PDF (number, validity date, job scope, signature block) and CSV.
- **Billdu** — encrypted server-side credentials, connection test, catalog → products, find/create client, create or update
  an estimate/order/invoice, deposit invoices by %, billed-vs-estimate tracking, CSV/PDF fallback.
- **AI scan assist** — Claude vision suggests sheet names, LED callouts and hand-drawn symbols as ghost markers you accept,
  move or reject. Counts never change until you accept.
- **Price list** — export the catalog as CSV, fill prices in a spreadsheet, import it back with a preview of every change.
- **Backup** — one-file project backup (plans, markup, estimate edits, photos) and restore on any device.
- **Offline** — data in IndexedDB, app shell cached by a service worker; optional Supabase sync, accounts and team sharing.

## Run
```bash
npm install
cp .env.example .env.local   # all optional; without values the app runs local-only
npm run dev                  # http://localhost:3000
npm test                     # unit + route tests (see below)
PGHOST=… npm run test:db     # applies supabase/migrations to a scratch Postgres and checks the RLS policies
```
Try it with `samples/demo-plan-set.pdf` (a synthetic 4-sheet demo — not the real 20 Hilltop drawings).

## What the tests cover
- **Takeoff & estimate** — the 20 Hilltop Dr E hand counts per floor (from PLAN.md), tentative items, LED zones/LF, pricing, overrides.
- **Billdu route** — against a fake Billdu API that verifies every request's HMAC signature: client create/reuse, estimate,
  50% deposit invoice, update instead of duplicate, rejected credentials.
- **AI scan route** — with the Claude API mocked at the HTTP layer: request shape (image + JSON schema), validation/clamping
  of the model's JSON, refusal, missing key, bad image type.
- **API auth** — open / access-code / Supabase-session modes.
- **Sync ↔ schema contract** — every synced field maps to an existing column and every required column is sent.
- **Database** (`npm run test:db`) — migrations apply on Postgres 16; owners, members and outsiders see exactly what they
  should (projects, markers, plan images in storage, per-owner catalog), and the secret store is service-role only.

## Configuration
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Accounts + cloud sync. Apply `supabase/migrations/*.sql` first. |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`) | AI scan assist. |
| `PINPLAN_ENCRYPTION_KEY` | Encrypts Billdu credentials saved from Settings. |
| `PINPLAN_DATA_DIR` | Where the encrypted credentials file lives (default `.data/`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Stores the encrypted Billdu credentials in Supabase (`app_secrets`) — use this on Vercel, whose filesystem isn't persistent. |
| `BILLDU_API_KEY`, `BILLDU_API_SECRET` (`BILLDU_HOST`) | Alternative to saving credentials in Settings. |
| `PINPLAN_ACCESS_CODE` | Team access code protecting the Billdu and AI-scan routes when Supabase accounts aren't used. |

## Security
The server routes that talk to Billdu and Claude require a signed-in Supabase user when Supabase is configured, or the
`PINPLAN_ACCESS_CODE` otherwise. **Don't deploy publicly with neither set** — anyone with the URL could create Billdu documents.
Billdu credentials are encrypted with `PINPLAN_ENCRYPTION_KEY` and never sent to the browser.

## Deploy
Vercel: import the repo, set the variables above, deploy. On the iPad, open the site in Safari → Share → Add to Home Screen.
