# Install progress and as-built

Techs tap devices through **rough-in → installed → tested** on the plan (with a photo where the company asks for
one); the office **verifies**. That gives live % complete per floor, category and closet, proof of work, test
records, an issues list and an as-built PDF at close-out. Quotes, takeoff and estimates never change: counts still
come only from placed markers and runs, and `computeTakeoff` / `Takeoff.swift` ignore install state.

## Data

`Marker.install` and `Run.install` (optional `InstallState`, jsonb columns added by
`supabase/migrations/20261123101200_install_progress.sql`, synced like every other field):

```ts
{ status: "planned" | "roughed" | "installed" | "tested" | "verified" | "issue",
  by?, at?, photoIds?: string[], test?: { pass, value?, note? } | null,
  history?: { status, by?, at, note? }[] }
```

Runs use the same statuses: roughed = pulled, installed = terminated, tested = certified. Proof photos are ordinary
job photos linked to the device (`Photo.markerId`, tag `install`) and listed in `install.photoIds`.

Company setting `installPhotoRequired` (Settings → Install progress; default `["installed"]`).

## Logic

`src/lib/installProgress.ts` (tests: `tests/installProgress.test.ts`), mirrored by
`ios/PinPlanCore/Sources/PinPlanCore/InstallProgress.swift`: workflows per trade (labels such as "Trimmed out",
"Pulled", "Certified"), `nextStatus`, `applyInstall` (appends history), `requiresPhoto`, `canSetInstall` (verify is
office only; techs can't change a verified device), `progress` by sheet / category / closet (tentative and deleted
devices excluded, empty groups hidden), `issues`, `installedQuantities` (for a future progress-billing integration;
not used by invoicing).

## Web

- Plan overlay (`src/components/progress/registerOverlay.ts`, through `src/lib/planOverlays.ts`): **Progress** rings
  every device in its status colour and lays a status line over runs; **Walk** makes one tap set the chosen status
  (or the next step) on the nearest device within 24 px, through the editor store so undo works; a photo-required
  status opens the camera first; an undo snackbar follows each tap. Long-press or right-click a device in walk mode
  for its sheet (status, photos, test pass/fail + reading, report issue, history).
- Inspector: an **Install** section on devices and runs.
- Crew tab: progress by floor / category / closet, issues (tap to open the plan there), office bulk verify, and the
  **As-built PDF** (cover summary, each sheet with status rings, a device table with test results; no prices).
- End-to-end check: `scripts/e2e-install-progress.cjs`.

## iPad / iPhone

`ios/PinPlan/Progress/`: the same overlay through `PlanOverlayRegistry` (rings, Progress / Walk controls, walk-mode
taps, a "Details" target that opens the device sheet), `DeviceInstallSheet` (camera, test result, big buttons) and
`ProgressDashboardView` in the Crew view. Status changes go through `EditorModel.edit`, so undo and saving work.
