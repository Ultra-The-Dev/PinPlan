# Plan markups

Redlines, clouds, arrows, shapes and text notes drawn on a plan sheet, sorted into named layers. They are seen by the
office as soon as they sync, and they **never count**: `computeTakeoff` only reads markers and runs, so the takeoff,
estimate, proposals and Billdu are unchanged by anything drawn here.

## Using it (web)

Open a sheet on the **Plan** tab and tap the pencil button in the column at the top right of the plan (under
View / Edit). The tool column opens there:

| Tool | Key | Notes |
| --- | --- | --- |
| Select | V | Tap a markup to select it; drag to move; drag a corner / end handle to resize. Tap a selected text box to edit it. |
| Pen | P | Freehand. Strokes are simplified (Ramer–Douglas–Peucker) when you lift your finger, so they stay small. |
| Highlighter | H | Six times wider, translucent. |
| Line | L | |
| Arrow | A | |
| Cloud | C | Revision cloud, drawn corner to corner. |
| Rectangle / Ellipse | R / E | Corner to corner. |
| Text | T | Tap where the note goes; type it in the dialog. |

- One finger draws, two fingers pinch and pan (a second finger cancels the stroke in progress).
- **Colour and size**: six colours plus purple **Private** (only you see it; it never prints), S / M / L.
  With a markup selected, picking a colour or size changes that markup.
- **Layers**: draw on "Redlines" (default), "As-built", "Notes" or a layer you add. Each layer has an eye; hidden
  layers are remembered per user on this device. The big eye hides or shows all markups and turns red whenever
  anything is hidden. "Move here" moves the selected markup to another layer.
- **List** shows this sheet's markups with author, time, layer and a Private badge; tap one to select it.
- **Long-press** (or right-click) a markup for its details: who drew it and when, Edit text, Duplicate, Delete.
- **Delete / Backspace** removes the selected markup; **⌘/Ctrl+Z** and **⇧⌘Z** undo / redo this session's markup
  actions while the markup column is open (the device undo is untouched). **Esc** steps back: details, selection,
  tool, then closes the column.
- **PDF**: Takeoff → "Include markups" (on by default) draws non-private markups on the marked-up plans PDF.
- **Rotate** on the Sheets tab turns markups with the sheet. If a sheet's image is replaced later, its markups stay on
  the same `sheetId`.

## Permissions

Everyone on the job can draw. Only the author, or the office (owner / admin; also anyone working alone), can edit or
delete a markup. Private markups are visible to their author only — filtered on the device (`visibleMarkups`) and by
row-level security in the database.

Sync rules (`markupsToPush`): markups drawn signed out (no `authorId`) are claimed by the user who signs in on that
device before they're pushed, and rows the database would refuse (another person's markup changed by a technician,
e.g. when a tech turns a sheet) stay on the device instead of blocking the sync. Only the author can make a markup
private; turning a shared markup private deletes the shared copy and keeps a new private one (other people never see
updates to a private row, so they would otherwise keep the old shared copy).

## Data model

Synced table `planMarkups` (Dexie v22, `id, projectId, sheetId, updatedAt`) ↔ `public.plan_markups`
(migration `supabase/migrations/20261123100200_plan_markups.sql`). Local-first like everything else: every write goes
through `put()`, deletes are soft (`deleted: true`), last write wins.

| Field (app) | Column | Type | Meaning |
| --- | --- | --- | --- |
| `id` | `id` | text | 12-char id |
| `projectId` | `project_id` | text | the job |
| `sheetId` | `sheet_id` | text | the sheet (soft link) |
| `kind` | `kind` | text | `pen` `highlight` `line` `arrow` `cloud` `rect` `ellipse` `text` |
| `points` | `points` | jsonb `number[]` | relative (0–1) `x, y` pairs, see below |
| `text` | `text` | text | text boxes only (≤ 4000 chars) |
| `color` | `color` | text | `#rrggbb`; `#7c3aed` is the private purple |
| `width` | `width` | float8 | stroke width as a fraction of the **sheet width** (S 0.0012, M 0.0024, L 0.0048) |
| `fontSize` | `font_size` | float8 | text size as a fraction of the sheet width (S 0.009, M 0.013, L 0.02) |
| `layer` | `layer` | text | layer name ("Redlines", "As-built", "Notes", or user-made) |
| `private` | `private` | bool | author-only |
| `author` | `author` | text | display name at the time of drawing |
| `authorId` | `author_id` | uuid | Supabase user id (null when drawn signed out) |
| `createdAt`, `updatedAt`, `deleted` | `created_at`, `updated_at`, `deleted` | | as every synced table |

`points` by kind:

- `rect`, `ellipse`, `cloud`: two opposite corners `[x0, y0, x1, y1]` (any order; draw from min / max).
- `line`, `arrow`: `[x0, y0, x1, y1]`; the arrow head is at the second point.
- `pen`, `highlight`: a polyline `[x0, y0, x1, y1, …]`.
- `text`: `[x, y]`, the top-left corner of the text box. The box is drawn with a white fill and a border in `color`;
  lines are split on `\n`; its size is estimated from the text (0.6 em per glyph, 1.25 em per line, 0.35 em padding).

Rendering rules that another client (iPad) should match, all in `src/lib/markups.ts`:

- Stroke in sheet pixels = `width × sheetWidth`; highlighter ×6 at 35 % opacity.
- Arrow head: filled triangle, length `max(5 × stroke, 0.008 × sheetWidth)`, half as wide each side (`arrowHead`).
- Cloud: `cloudPath(x0, y0, x1, y1, arc)` with `arc = 0.014 × max(sheetW, sheetH)`: sine scallops of ~`arc` along each
  side of a box inset by the bulge height (`min(arc / 3, shortSide / 4)`), bulging outwards so the outline stays
  inside the box. Closed.
- Sheet rotation (90° clockwise): every point `(x, y) → (1 − y, x)` (`rotateMarkupPointsCW`), widths × old ÷ new sheet
  width; a text box's anchor moves left by its own width so the text stays upright (`rotateMarkupCW`).

Clients must tolerate unknown or missing fields (treat missing `private` as false, missing `layer` as "Redlines",
missing `width` as M).

## Database rules

- `select`: project member and (not private, or `author_id = auth.uid()`).
- `insert` / `update` / `delete`: project member, and the row is unowned, yours, or you're not a technician
  (`is_tech()`); a private row must be yours (`author_id = auth.uid()`). An upsert checks the insert rule against the sent row, so
  the office can upsert edits of a technician's markup but a technician can't take one over.
- `synced_at` trigger + index like the other synced tables; the billing `job_write_guard` trigger makes it read-only
  when the subscription lapses.

## Code map

- `src/lib/markups.ts` — pure geometry (`cloudPath`, `arrowHead`, `simplifyStroke`, `bbox`, `hitTest`, `translate`,
  `resize`, `rotateMarkupPointsCW`), `visibleMarkups`, `canEditMarkup`, and `drawMarkupsOnCanvas` for the PDF.
  Tests: `tests/markups.test.ts`.
- `src/components/markups/useMarkups.ts` — markup state, saving, undo / redo, hidden layers (localStorage per user).
- `src/components/markups/MarkupLayer.tsx` — the Konva layer (markups, the stroke being drawn, the selection box).
- `src/components/markups/markupInput.ts` — plan input: tap, drag (draw / move / resize), long-press / right-click,
  hit testing in screen px.
- `src/components/markups/MarkupToolbar.tsx` — tool column, colour / size, layers, list, details card, text dialog.
- `src/components/markups/registerOverlay.ts` — a plan overlay (`registerPlanOverlay` in `src/lib/planOverlays.ts`,
  docs/plan-viewer.md): `konva` layer, `html` toolbar in the plan rail, `onTap` / `onDragStart…` / `onLongPress`, and
  `capturing` while a draw tool is active (one finger draws, devices can't be dragged, a pause before drawing isn't a
  long-press). `PlanCanvas` only knows about overlays in general.
