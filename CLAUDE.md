# PinPlan — notes for Claude Code

Floor Plan Device Mapper: installers pin devices on floor plans → per-floor takeoff → priced estimate → Billdu.
Full spec: `PLAN.md`. See also `AGENTS.md` (Next.js 16 — read `node_modules/next/dist/docs/` before using unfamiliar APIs).

## Commands
- `npm run dev` / `npm run build` / `npm start`
- `npm test` (vitest, `tests/`), `npm run typecheck`, `npm run lint`
- `npm run test:db` (local Supabase test DB, `scripts/test-supabase.sh`), `npm run check:legal`, `npm run check:migrations`,
  `scripts/forbidden-strings.sh` (CI: no model ids outside `docs/`, plus a private denylist).
- Generated, gitignored files: `postinstall` copies the PDF.js worker to `public/pdf.worker.min.mjs`; `postbuild`
  (`scripts/build-sw.mjs`) writes `public/sw.js` from `scripts/sw.template.js` with the build id and precache list.
  Edit the template, never `public/sw.js`. `prebuild` runs `scripts/check-legal.mjs` (fails only with `LEGAL_CHECK=strict`).

## Architecture / conventions
- **Local-first.** All data lives in IndexedDB (Dexie, `src/lib/db.ts`). Every write goes through `put/putMany/remove/saveImage`,
  which also enqueue a sync item. Deletes are soft (`deleted: true`). Supabase sync (`src/lib/sync.ts`) is optional and only runs
  when `NEXT_PUBLIC_SUPABASE_*` are set; schema in `supabase/migrations/`.
- **Positions are relative (0–1)** to the sheet image (`x`, `y`, `points`). Lengths in feet; `Sheet.pxPerFt` is the scale.
- **Editor state** is a zustand store (`src/lib/store.ts`). Mutations go through `commit(changes)` which persists and records
  undo history. Use the store actions (`addMarker`, `updateRun`, …) rather than writing to Dexie directly from the editor.
- **Counts come only from placed markers/runs**: `computeTakeoff` (`src/lib/takeoff.ts`) is pure and is the single source for
  the takeoff tab, exports, estimate and Billdu. AI suggestions live in a separate table and never count until accepted.
- Estimate: `buildEstimate` (`src/lib/estimate.ts`) = takeoff × catalog prices (+markup, labor, wire) with user overrides
  stored as `EstimateLine` rows keyed by line key (`dev:<typeId>`, `opt:<typeId>` for tentative, `wire:<type>`, `custom:<id>`).
- Pages are static client pages using query params (`/project?id=…&tab=…`) so they work offline from the service worker
  (`public/sw.js`). Konva components are loaded with `dynamic(..., { ssr: false })`.
- Server-only code: `src/app/api/billdu/*` (HMAC-SHA512 signed requests, creds encrypted at rest by `src/lib/server/secrets.ts`)
  and `src/app/api/scan` (Claude vision). Secrets never go to the browser.
- Quotes / invoices / credit notes (Dexie `salesDocs`, `salesPayments`; `src/lib/documents.ts`, `src/components/documents/`):
  data model, numbering (given by the database when issued) and RPCs in `docs/documents.md`. Office only, like the estimate.
- **Navigation** (`docs/navigation.md`): job tabs Overview · Plan · Takeoff · Money (office) · Field. Money
  (`src/components/money/MoneyTab.tsx`, `step=pricing|quote|changes|invoices`) holds pricing, quotes, change orders and
  invoices; Field (`src/components/field/FieldTab.tsx`, `section=…`) holds checklists, logs, tasks, schedule, photos.
  Old `?tab=` values map through `src/lib/tabRoutes.ts`. Words come from the glossary in `docs/ux-audit.md`.
- **Plan overlays**: features that draw on the plan (markups, measurements, tasks, install progress, sheet links,
  revisions) register through `registerPlanOverlay` (`src/lib/planOverlays.ts`), imported once from
  `src/components/editor/overlays/index.ts`. `PlanCanvas` knows only overlays in general. iOS: `PlanOverlayRegistry`.
  Selection and draft colours: `src/lib/canvasColors.ts`. Device symbols show letters and trade colours, not icons.
- **Colours**: Blueprint Ink (`docs/brand.md`). App tokens in `globals.css`; document fallbacks in
  `src/lib/brandDefaults.ts`; status chips in `src/lib/statusStyle.ts`. No old orange or `#161616`.
- **Billing** (Stripe, `src/lib/server/billing.ts`, `src/lib/billingLogic.ts`): a lapsed company is read-only. Nothing
  locks and no trial reminders go out until `billing_settings.enforce = true` (switched on in SQL at launch).
- **Online invoice payments** (`docs/payments.md`, `src/lib/server/onlinePayments.ts`, `/api/payments/*`): companies
  connect their own Stripe account (Connect, Standard-type, direct charges); clients pay on the `/d` link. The webhook
  records an ordinary `salesPayments` row (`stripe_<intent>`) through `record_online_payment()`. Off until
  `STRIPE_CONNECT_WEBHOOK_SECRET` is set.
- **Production config**: `src/lib/server/envCheck.ts` lists the required settings and `REQUIRED_SCHEMA_VERSION`;
  `/api/health` answers 503 until both are met. Every env var is described in `.env.example`; the owner's launch
  order is `docs/launch-checklist.md`, running it is `docs/production-checklist.md`. AI stays off.
- Public repo: no secrets, no real customer data, no model identifiers in code (`ANTHROPIC_MODEL` is configuration).
- Tests: `tests/sampleJob.test.ts` encodes the sample job hand counts from PLAN.md.
- **Translation** (`docs/i18n.md`, `src/lib/i18n/`): English text is the key — `const t = useT(); t("New job")`,
  `t.tn("{n} device", "{n} devices", n)`, `<T>…</T>` in server components, `msg()` for text in data. Russian lives in
  `src/lib/i18n/ru/<area>.ts`; `npm run check:i18n`. Client-facing documents (quotes, invoices, PDFs, client links,
  client emails) stay in English.
- **Help, tours, tips** (`docs/help-and-tours.md`): guides in `src/lib/help/guides.ts` (`/help`, screenshots from
  `scripts/help-screens.mjs`); tours point at `data-tour` anchors registered in `src/lib/tour/anchors.ts` (a missing
  anchor never blocks); text in `src/lib/i18n/<lang>/help.ts`. Never on client pages.
- Tailwind v4 with component classes in `src/app/globals.css` (`btn`, `input`, `card`, `tab`, `tbl`, `label`).
