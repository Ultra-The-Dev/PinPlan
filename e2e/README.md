# Browser tests (Playwright)

- `smoke.spec.ts` checks the money path, local-only with no Supabase: new job → import `samples/demo-plan-set.pdf` →
  place 3 devices → the takeoff shows 3 → type a unit price → estimate total > 0 → quote → issue → invoice → issue →
  PDF download. Any console error or uncaught page error fails it.
- `a11y.spec.ts` runs an axe scan of `/welcome`, `/pricing`, `/login` and `/signup`. Critical violations fail the
  test. Everything else is attached to the report as a to-do list.
- `mobile.spec.ts` opens the key pages on phones (iPhone SE, iPhone 13, Pixel 7) and tablets (iPad Mini, iPad Pro 11
  landscape) with touch: no sideways page scroll, main actions at least 44×44 px (counting the touch hit area of
  `.btn`, `.tab` and `.tap`), text fields at 16px or more (iOS zooms into smaller ones), and the plan's controls.

## Run

```sh
npm run build                       # Supabase env must be unset
npx playwright install chromium     # once
npm run e2e                         # starts `next start` on port 3123 (E2E_PORT to change)
PLAYWRIGHT_BASE_URL=http://localhost:3201 npm run e2e   # against a server that is already running
```

Traces, screenshots and the HTML report go to `e2e/.output/` (ignored by git). Open a trace with
`npx playwright show-trace e2e/.output/results/<test>/trace.zip`. In CI (`.github/workflows/web.yml`) the folder is
uploaded as the `playwright` artifact when a test fails.

The older one-off scripts `scripts/e2e-*.cjs` (plan viewer, sheet links, schedule, templates, install progress) still
run by hand. They will be moved here later.

## CI checks at a glance

| Workflow | Runs on | What |
| --- | --- | --- |
| `web.yml` | every push and PR | lint, typecheck, unit tests with coverage gates (takeoff, estimate, documents), `next build`, this folder, `npm audit` (advisory), Gitleaks, `scripts/forbidden-strings.sh` |
| `db.yml` | `supabase/**` changes | `scripts/check-migrations.mjs` (names, unique timestamps, PRs only add newer ones), migrations + RLS tests on Postgres 17 |
| `swift-core.yml` | `ios/**`, `src/lib/**`, `tests/fixtures/**` changes | `swift test` for PinPlanCore on Linux |
