# PinPlan — notes for Claude Code

Floor Plan Device Mapper: installers pin devices on floor plans → per-floor takeoff → priced estimate → Billdu.
Full spec: `PLAN.md`. See also `AGENTS.md` (Next.js 16 — read `node_modules/next/dist/docs/` before using unfamiliar APIs).

## Commands
- `npm run dev` / `npm run build` / `npm start`
- `npm test` (vitest, `tests/`), `npm run typecheck`, `npm run lint`
- `postinstall` copies the PDF.js worker to `public/pdf.worker.min.mjs` (gitignored).

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
- Tests: `tests/hilltop.test.ts` encodes the 20 Hilltop hand counts from PLAN.md.
- Tailwind v4 with component classes in `src/app/globals.css` (`btn`, `input`, `card`, `tab`, `tbl`, `label`).
