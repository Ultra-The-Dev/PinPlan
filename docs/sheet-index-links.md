# Sheet index and plan hyperlinks

On a 40-sheet set, crews lose time hunting for the detail or the riser diagram. PinPlan reads real sheet numbers,
titles and disciplines from the PDF's text layer and turns callouts ("E-501", a "3" over "E-501" in a section bubble)
into tappable red boxes that jump to that sheet. Office staff can also draw links to job documents (cut sheets,
specs), photos and web pages. No AI: only the text the PDF already carries. Scanned PDFs (no text layer) simply give
no proposals.

Web today; the data model is plain and synced so the iPad app can read and follow the same links.

## Data model

### Sheet (existing row, new optional fields)

| App field (Sheet) | Column (`public.sheets`) | Type | Notes |
| --- | --- | --- | --- |
| `number` | `sheet_number` | text | Printed sheet number, e.g. `E-101`, `A1.01`, `FA-001`. |
| `title` | `sheet_title` | text | As printed, e.g. `FIRST FLOOR POWER PLAN`. |
| `discipline` | `discipline` | text | `General`, `Civil`, `Architectural`, `Structural`, `Mechanical`, `Plumbing`, `Fire protection`, `Fire alarm`, `Electrical`, `Low voltage`, `Other` (or any custom text). Null = derive from the number. |
| `tags` | `tags` | jsonb (string array) | Free tags, e.g. `["Phase 2", "Bid set"]`. |

All four are optional; older rows and older apps simply don't have them. `name` stays the floor name used by the
takeoff ("1st Fl"); the display name is `sheetDisplayName(sheet)` = `"E-101 FIRST FLOOR POWER PLAN"` when there is a
number, else `name`.

### SheetLink (new synced table `sheetLinks` → `public.sheet_links`)

```ts
interface SheetLink {
  id: string;
  projectId: string;      // project_id
  sheetId: string;        // sheet_id: the sheet the link is drawn on
  x: number; y: number;   // top-left, relative 0–1 to the sheet image (like markers)
  w: number; h: number;   // size, relative 0–1
  target:                 // target jsonb, not null
    | { kind: "sheet"; sheetId: string; x?: number; y?: number }   // optional point to centre on
    | { kind: "document"; documentId: string }                     // a job document (JobDocument.id)
    | { kind: "photo"; photoId: string }
    | { kind: "url"; url: string };                                // http(s) only
  label?: string | null;  // short text: "3/E-501", the document name…
  auto?: boolean;         // found from callout text (true) or drawn by hand (false)
  createdAt: string; updatedAt: string; deleted?: boolean;        // soft deletes, last write wins
}
```

- Migration: `supabase/migrations/20261123100500_sheet_links.sql` (adds the sheet columns, creates the table with
  `synced_at` trigger + index, RLS, and the billing write guard; also listed in `job_write_guard`'s table list).
- RLS: everyone on the job reads (`is_project_member(project_id)`); only non-technicians insert, update or delete
  (`… and not is_tech()`).
- Local: Dexie `this.version(25).stores({ sheetLinks: "id, projectId, sheetId, updatedAt" })`; sync mapping in
  `src/lib/syncMap.ts` (`PUSH_ORDER` after the job's other rows); part of `ProjectBundle`, so it is in backups and
  restores.
- iOS decoding should tolerate unknown `target.kind` values (skip the link) and missing optional fields.

## Reading the PDF (`src/lib/sheetIndex.ts`, pure and unit-tested)

Text comes from PDF.js `getTextContent()`; each run's transform is mapped through the page viewport into a relative
box with y from the top (`textItemBox` / `pageTextItems` in `src/lib/importPlans.ts`; rotated pages handled).
`RenderedPage.items` carries them during import; they are not stored.

- `parseSheetNumber(items | text)`: tokens matching `/^(?:[A-Z]{1,3})[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?$/`, minus
  look-alikes (REV, NO, RM, LP, AHU…). Scales and dates never match. Prefers the title block (bottom-right 30%), a
  nearby `SHEET` / `SHEET NO.` label, a known discipline prefix and larger type. Plain text: the token after a `SHEET`
  label, else the last one with a known prefix.
- `parseSheetTitle(items, number)`: the largest line near the number (else in the title block, else anywhere) naming a
  drawing (PLAN, DETAILS, RISER, SCHEDULE, ELEVATION, SECTION, NOTES, DIAGRAM…); a same-size line just above is joined
  (`FIRST FLOOR` + `POWER PLAN`).
- `disciplineFromNumber("E-101")` → `Electrical` (G, C, A, S, M, P, FP, FA, E, T/LV/TC; a two-letter prefix like `EP`
  falls back to its first letter; otherwise `Other`).
- `findCallouts(items, sheets, selfSheetId)`: words equal to another sheet's number (`E-501`, `(E-501)`, `3/E-501`),
  with a detail number above or before it folded into the box. Skips the sheet's own number, its title block and
  numbers shared by several sheets (ambiguous).
- `dedupeLinks(links, existing)`: same sheet + same target + mostly the same box = repeat. Existing links count even
  when deleted, so re-detecting never brings back a link someone removed.
- Also: `sheetDisplayName`, `groupSheetsByDiscipline`, `matchSheet` (search), `duplicateNumbers`, `linkAt`
  (hit test with tolerance), `brokenReason`, `normalizeUrl`, `matchPagesToSheets`, `readPdfText(file)` (text-only pass,
  no rendering).

Helpers for the sheet browser (viewer team): `sheetDisplayName`, `sheetDiscipline`, `groupSheetsByDiscipline`,
`matchSheet`, `compareSheetNumbers`.

## UI (web)

- **Import** (Sheets tab): after a PDF is rendered, office users get **Review sheet names** — number, title and
  discipline per page, editable, "Use page numbers" to drop them, a duplicate-number warning. Saving names creates
  automatic links from callouts (optional checkbox).
- **Sheet index** (Sheets tab button): every sheet grouped by discipline; edit number / title / discipline / tags,
  bulk-set discipline, add or remove tags, **Detect names & links from PDF** for sheets imported earlier (re-pick the
  source PDF; pages match by page number and shape, nothing is re-rendered), **Remove auto links**. Sheet cards show
  the number, discipline, tags and link count.
- **Plan** (overlay `sheet-links`, `src/components/sheetIndex/registerOverlay.tsx`, through the viewer's
  `registerPlanOverlay`; no changes inside `PlanCanvas`): red translucent rounded boxes; grey dashed when the target
  was deleted (tapping explains). Tap = follow: sheet (pushes a back stack, "Back to E-101" pill), document (opens like
  Field › Documents), photo (photo viewer), URL (asks first, then a new tab). Devices under a link win the tap, and
  placing tools aren't interrupted. Side control: link tool (office, edit mode), show/hide links, auto links on/off
  (this device). Link tool: drag a box (or tap for a standard box), pick the target (sheets searchable by number /
  title, documents, photos, web link); tap an existing link to retarget or delete it.
- **Documents** (Field tab): "Linked on E-101" chips under documents that links point to.

## Known limits

- Rotating a sheet (Sheets › Rotate) rotates devices and runs but not its links yet: redraw them, or run
  "Detect names & links from PDF" after removing the auto links (only unrotated sheets match the PDF).
- Links from sheets imported before this feature appear only after "Detect names & links from PDF".

## Permissions

Office (owner/admin, or working alone) creates, edits and deletes links and sheet numbers/titles/disciplines.
Technicians follow links and may edit sheet tags only (the database enforces the link rules).

## Tests

- `tests/sheetIndex.test.ts`: numbers (with scale / date / revision look-alikes), titles, disciplines, grouping,
  display names, callouts (own number and title block excluded, duplicates skipped), dedupe, hit testing, text-item
  transforms (incl. rotation), page matching, sync round trip; and the real fixture `tests/fixtures/sheet-links.pdf`
  (made by `scripts/make-sheet-links-fixture.cjs`).
- `tests/schema.test.ts`, `tests/syncMap.test.ts`: the new columns and table.
- `scripts/e2e-sheet-links.cjs` (Playwright, desktop + phone): import the fixture, accept names, red link on page 1,
  tap → sheet 2, Back → sheet 1, draw a link to a document and open it, "Linked on E-101", sheet index.
