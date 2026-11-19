# Saved measurements

Lengths, runs (polylines) and areas drawn on a calibrated sheet and **kept**: grouped by a label ("3/4" EMT",
"Drop ceiling", "Cat6 tray"), totalled per sheet and per job, exported as CSV and (office only) added to the estimate
as a custom line. The older transient **Measure** tool (`tool.kind === "measure"`, ruler in the plan toolbar) is
unchanged: it still shows one distance and forgets it.

## Using it (web)

- Plan tab → **Measure** (under the sheet title). The strip has **Length** (2 taps, saves itself), **Run** (tap each
  bend; double-tap, **Done** or Enter to finish) and **Area** (tap each corner; tap the first corner, double-tap or
  **Done** to close), the **group label** (with recent labels), colour, show/hide and the totals panel.
- While drawing: the live value shows in the dark bar; the mouse shows a rubber-band segment; **Shift** snaps to 0/45/90°;
  a tap on a device or closet snaps to its centre (home-run distances). Undo point = Backspace or the ↶ button; Esc
  cancels. Devices can't be dragged while the measure strip is open (the overlay "captures" the plan); panning and
  zooming work as usual. Works in View mode too (technicians measure without switching to Edit).
- Sheet without a scale: "Calibrate this sheet first" with a button that switches to the editor's calibrate tool.
- With the strip closed, tap a measurement to select it: label, **Extra (drops)** in feet, **Waste %**, notes, colour,
  delete (with Undo). Del/Backspace deletes the selected one.
- **Totals panel** (list icon): Sheet / Job scope, one row per group (label + kind), count, total, area perimeter,
  sheets involved; expand a row to jump to each measurement. Measurements on uncalibrated sheets are listed apart and
  not totalled. **CSV** downloads the rows shown.
- **Add to estimate** (owner/admin only — `can(role, "prices")`; hidden for technicians): asks for a unit price,
  prefilled from the existing line, else the job's wire price for a matching cable name ("Cat6 tray" → Cat6), else a
  product whose model/SKU matches. Writes the custom line `custom:meas-<slug(label)>-<kind>` with qty rounded up and
  unit `ft` / `sq ft` (via the editor store's `upsertEstimateLine`). Adding again updates the same line's quantity.
  The panel shows "In estimate: N ft · now M" when the drawing changed since.

## Data model (synced; iOS-friendly)

Table `measurements` (Dexie v24 `id, projectId, sheetId, updatedAt`; Postgres `public.measurements`,
`supabase/migrations/20261123100400_measurements.sql`).

| Field (app) | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | text | |
| `projectId` | `project_id` | text, required | FK to projects |
| `sheetId` | `sheet_id` | text | soft link |
| `kind` | `kind` | text, required | `"length"` \| `"polyline"` \| `"area"` (treat unknown kinds as polyline) |
| `points` | `points` | jsonb, required | flat `[x0, y0, x1, y1, …]`, **relative 0–1** to the sheet image |
| `label` | `label` | text? | group label; blank = "Unlabeled" |
| `color` | `color` | text? | `#rrggbb` |
| `extraFt` | `extra_ft` | float8? | extra feet (drops, loops); ignored for areas |
| `wastePct` | `waste_pct` | float8? | % allowance |
| `notes`, `author` | `notes`, `author` | text? | |
| `createdAt`, `updatedAt`, `deleted` | `created_at`, `updated_at`, `deleted` | | soft delete, last-write-wins |

No value is stored: always compute from `points` and the sheet's **current** `pxPerFt`, so recalibrating updates
everything. RLS: any member of the job (`is_project_member`, technicians included — no prices here); read-only when the
subscription has lapsed (`job_write_guard`). Included in backups (`ProjectBundle.measurements`).

Rotating a sheet 90° clockwise turns its measurements with it (`rotatePointsCW`: `(x, y) → (1 − y, x)`, called from
`rotateSheetCW`). That write is not part of the editor's undo step.

## Maths (`src/lib/measure.ts`, tested in `tests/measure.test.ts`) — mirror these on iOS

- px = rel × (sheet.width, sheet.height).
- `lengthFt` = Σ segment lengths (px) / pxPerFt (open path). `perimeterFt` = same, closed.
- `areaSqFt` = |shoelace(px)| / 2 / pxPerFt². A self-crossing outline gives the absolute shoelace value plus a warning.
- `totalFt` = (length + extraFt) × (1 + wastePct/100); for an area its perimeter is the length.
- `totalSqFt` = area × (1 + wastePct/100).
- Negative / missing allowances count as 0. Uncalibrated sheet (no or ≤ 0 pxPerFt) → no value.
- Saving: drop repeated taps closer than 0.0015 (relative), drop an area's closing point equal to its first, a length
  keeps its two ends; fewer than 2 points (3 for an area) is discarded.
- Grouping: label trimmed, spaces collapsed, case-insensitive; **Length and Run share a group** (both linear feet), Area
  is separate. Group key `label|length` or `label|area`.
- `formatFeetInches(12.5)` = `12' 6"` (rounded to the inch); areas `1,234 sq ft`.
- Estimate key `custom:meas-<slug>-<length|area>`, slug = lower-case, non-alphanumerics → `-`, trimmed; qty =
  ceil(total); description = label (areas: "label (area)").

## Code map

| File | |
| --- | --- |
| `src/lib/measure.ts` | pure geometry, totals, summary, CSV, estimate line, price suggestion, hit testing |
| `src/lib/measurements.ts` | zustand store of the job's rows (Dexie read/write, reload on sync), `rotateSheetMeasurements` |
| `src/components/measure/registerOverlay.ts` | registers the plan overlay (`src/lib/planOverlays.ts`, order 40) |
| `src/components/measure/measureInput.ts` | taps, double-tap, finish / undo / cancel |
| `src/components/measure/MeasureLayer.tsx` | Konva drawing (constant-size labels via `name="cs"`) |
| `src/components/measure/MeasureOverlay.tsx`, `MeasureToolbar.tsx`, `MeasureEditCard.tsx`, `MeasurementsPanel.tsx` | HTML chrome |

The overlay registry gained two optional hooks for this (`src/lib/planOverlays.ts`): `onDoubleTap` (so finishing a run
doesn't zoom) and `capturing` (no device drags while drawing). `PlanEditor.tsx` only imports the overlay module.
