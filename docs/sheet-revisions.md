# Sheet revisions

Plans get re-issued. A new revision replaces a sheet's **drawing** while the **Sheet row stays**, so everything
pinned to the sheet by `sheetId` (devices, runs, closets, photos, tasks, plan markups, sheet links) carries over
with no copying. The history keeps every earlier drawing, so any two can be compared and an old one restored.

Web code: `src/lib/revisions.ts` (pure, tested in `tests/revisions.test.ts`) and `src/components/revisions/*`.

## Data model

Two optional fields on the existing `sheets` table (migration `20261123100300_sheet_revisions.sql`); no new table.

| Sheet field (web / iOS) | Column           | Type                 | Meaning |
|-------------------------|------------------|----------------------|---------|
| `revisionLabel`         | `revision_label` | text, nullable       | Label of the **current** drawing, e.g. `Rev B`, `IFC 2026-11-20`. Null = unlabelled (shown as "Original" until a revision exists). |
| `revisions`             | `revisions`      | jsonb array, nullable | Earlier drawings, **newest first**. |

`imageId`, `width`, `height`, `pxPerFt`, `pxPerInch`, `scaleLabel` keep describing the current drawing, exactly as
before. Apps that don't know about revisions simply show the current drawing.

Each `revisions[]` entry (`SheetRevision`):

```jsonc
{
  "id": "k3J9…",              // stable id of the entry
  "label": "Rev A",            // "Original" if the drawing was never labelled
  "imageId": "a8Fz…",          // images table / storage <projectId>/<imageId>, like sheet images
  "imageUrl": null,            // local-only hint, ignore
  "width": 4800, "height": 3200,
  "pxPerFt": 24.0, "pxPerInch": 300, "scaleLabel": "1/4\" = 1'-0\"",
  "uploadedAt": "2026-11-12T…",  // when it became the current drawing
  "uploadedBy": "dana",
  "replacedAt": "2026-11-20T…",  // when the next drawing replaced it
  "replacedBy": "sam",
  "note": "Rolled back to Rev A", // optional
  "transformToNext": [a, b, c, d, e, f] // or null
}
```

Decoders must ignore unknown keys and treat every key except `id`, `imageId`, `width`, `height` as optional.

### Transforms

`transformToNext` is the **relative-coordinate** affine transform applied to the markup when the next drawing
(the entry before it in the array, or the current drawing for `revisions[0]`) replaced this one:

```
x' = a·x + c·y + e
y' = b·x + d·y + f        (x, y in 0–1 of this drawing; x', y' in 0–1 of the next one)
```

It comes from a 2-point alignment: a similarity (rotation + uniform scale + shift) in pixel space, converted to
relative coordinates using both image sizes, so it works across different page sizes. `null` means the markup kept
its relative positions (identity). To go from drawing *i* to a newer drawing *j*, compose the links in between; to
go back, invert. `transformBetween()` does this.

## Operations

- **Upload a revision** (`pushRevision`): the current drawing becomes `revisions[0]` (with `replacedAt/By`), the
  new image becomes current, `transformToNext = null`. Markup is untouched. Scale:
  - same size (width, height and aspect within 1%): `pxPerFt` kept;
  - else, PDF render with a known `pxPerInch` on both: `pxPerFt = old.pxPerFt / old.pxPerInch × new.pxPerInch`
    (same paper scale), label kept;
  - else a scale printed on the new PDF page is used;
  - else `pxPerFt = null` → **recalibrate** (amber flag: `!pxPerFt && revisions[0].pxPerFt`). Run lengths keep their
    measured feet until the sheet is calibrated again.
- **Align** (office): tap 2 matching spots on the previous and the new drawing. Markup created before the new
  drawing arrived moves by the transform (clamped to 0–1; "3 devices fell off the new sheet" lists them), as one
  undo step; the transform is stored as `revisions[0].transformToNext`. Re-aligning first undoes the earlier
  transform. If the scale was reset, it is carried over: `pxPerFt = previous.pxPerFt × pixel scale of T`.
  A sideways re-issue can be rotated first ("Rotate new" swaps the image only).
- **Roll back** (office): the chosen entry becomes current again; the drawing it replaces goes to the front of the
  history (`note: "Rolled back to …"`, `transformToNext` = current → restored), the chosen entry is removed from
  the history and the link across the gap is composed. Markup follows the stored alignments.
- **Compare** (everyone): any two drawings of this sheet or any other sheet. Overlay: A tinted red, B blue by
  darkness, multiplied, so shared ink is black; aligned with the stored transforms (or an ad-hoc 2-point alignment
  when shapes differ). Swipe mode, fade slider, devices on top. Works offline with drawings stored on the device;
  an older drawing that was never downloaded is fetched from storage when online ("Not downloaded yet" otherwise).
  On the Plan tab, a sheet with earlier drawings shows its revision chip (opens the history) and Compare in the plan
  rail at the top right (`src/components/revisions/revisionOverlay.tsx`, a plan overlay).

Moved rows: markers (`x`,`y`), runs (`points`), closets (`x`,`y`) and anything registered with
`registerRevisionCarry(table, { xy: ["x","y"] } | { points: "points" })`. Photos follow by `sheetId` (no position).

## Sync and storage

Revision images are uploaded like sheet images (`<projectId>/<imageId>` in the `plans` bucket); the sync engine
also resolves the project of an image referenced only from `revisions`. A pulled sheet whose `image_path` doesn't
name its current `image_id` (row arrived before the new image finished uploading) falls back to
`<projectId>/<imageId>`. Backups include revision images.

## Permissions

Upload, align, roll back and relabel are office only (`role !== "tech"`); techs see the history and can compare.
The "changed since estimate" note (a revision after the latest estimate line edit) is shown to people who see prices.

## iOS (not built yet)

Mirror `SheetRevision` as an optional `[SheetRevision]?` with a lenient decoder, show `revisionLabel` on the sheet,
and keep sending only the columns it knows (upserts merge, so `revisions` written by the web survive). The pure
logic in `revisions.ts` (transform maths, `pushRevision`, `rollbackRevision`, `matchPagesToSheets`) has no browser
dependencies and ports directly to PinPlanCore.
