# Sheet index and plan hyperlinks

On a 40-sheet set, crews lose time hunting for the detail or the riser diagram. PinPlan reads real sheet numbers,
titles and disciplines from the PDF's text layer and turns callouts ("E-501", a "3" over "E-501" in a section bubble)
into tappable red boxes that jump to that sheet. Office staff can also draw links to job documents (cut sheets,
specs), photos and web pages. No AI: only the text the PDF already carries, plus on-device OCR (self-hosted Tesseract) to read the floor name of
scanned pages and photos. Floor names ("1ST. FL", "LEVEL 2", "BASEMENT") become the sheet names at import, in a page
picker where unwanted pages are skipped.

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

## Floor names (`src/lib/floorName.ts`, pure; Swift: `PinPlanCore/FloorName.swift`, same rules)

Title blocks often carry only the floor ("ATTIC", "1ST. FL", "CELLAR", "LEVEL 2"), with no PLAN / DETAILS word, so
`parseSheetTitle` proposes nothing for them. `parseFloorName(items | text)` reads them:

- Phrases: ordinals with a floor word (`1ST FL`, `1ST. FL`, `FIRST FLOOR`, `2ND FLR`, `TWELFTH FLOOR`,
  `FIRST & SECOND FLOOR`), named floors and levels (`GROUND FLOOR`, `MAIN LEVEL`, `LOWER LEVEL`, `UPPER FLOOR`,
  `BASEMENT LEVEL`), numbered levels (`LEVEL 2`, `LEVEL B1`, `LVL 3`, `FLOOR 3`; `L2` only as a line of its own),
  `BASEMENT`, `SUB-BASEMENT`, `CELLAR`, `ATTIC`, `ROOF`, `MEZZANINE`, `PENTHOUSE`, `CRAWL SPACE`, units
  (`UNIT 3B`, `APT 4`, `SUITE 200`) and `SITE PLAN`.
- Where: with positions (PDF text layer or OCR lines) each line is scored: the title block (bottom-right 30%, or a
  vertical strip down the right edge — rotated runs are tall, narrow boxes), a line that is only the floor plus title
  words (`FIRST FLOOR ELECTRICAL POWER PLAN`), `PLAN` on the line, and type size against the largest on the page.
  Plain text: a phrase followed by `PLAN` wins, else the first one not inside a pointer.
- Not floors: things on a floor or marks (`FLOOR DRAIN`, `FLOOR BOX`, `ATTIC ACCESS`, `ROOF DRAIN`, `ROOF TOP UNIT`),
  elevation marks (`FIN. FL. ELEV`, `T.O. 2ND FLOOR`, `2ND FL. ELEV.`), levels of something else (`SOUND LEVEL 3`),
  pointers and notes (`STAIR DOWN TO BASEMENT`, `SEE 2ND FLOOR PLAN`, lines with SEE / TO / FROM / PROVIDE…), long
  sentences, and small schedule rows outside the title block.
- Name: the plan's own wording in Title Case — `1ST. FL` → `1st Fl`, `FIRST FLOOR` → `First Floor`, `LEVEL 2` →
  `Level 2`, `L2` → `Level 2`, `UNIT 3B` → `Unit 3B`; a trailing `PLAN` is dropped (`ROOF PLAN` → `Roof`).
- `floorKey(name)` compares floors however written (`FIRST FLOOR` = `1st Fl` = `1ST FLR` → `f1`); re-issued sets match
  pages to sheets with it (`src/lib/revisions.ts`). `guessFloorName(text, fallback)` is `parseFloorName` on text.
- Proposed sheet name (`proposeSheetName`): the floor if found, else the sheet title (Title Case), else the sheet
  number, else the current name. `isDefaultSheetName` tells a made-up name ("Sheet 3", "Page 2", `IMG_4031`, the file
  name) from one someone typed: only made-up names are ever replaced.
- Tests: `tests/floorName.test.ts` and `FloorNameTests.swift` share `tests/fixtures/floorNames.json` (title-block
  wording, false positives, plain text, and the text PDF.js reads from `samples/demo-plan-set.pdf` and
  `samples/doors-windows-demo.pdf`, written by `scripts/floor-name-fixture.mjs`).

The samples show the gap this closed: their title blocks say `ATTIC`, `1ST. FL`, `2ND. FL`, `CELLAR` (and `1ST. FL` in
small print on the doors and windows set): `parseSheetTitle` returns null for every page; `parseFloorName` reads
`Attic`, `1st Fl`, `2nd Fl`, `Cellar`.

## OCR for scans and photos (web: `src/lib/ocr.ts`)

Pages with no text layer (scanned PDFs) and photos are read on the device by Tesseract.js 7 (Apache-2.0) with the
English `best_int` model, self-hosted in `public/vendor/tesseract-7.0.0/` (≈ 7 MB: engine 3.9 MB, English data 3 MB,
scripts 0.2 MB; see `public/vendor/README.md`). It loads only when a page needs it, runs in a Web Worker served from
our own origin (so the service worker caches it on first use and it works offline after), reports progress ("Getting
text recognition ready… / Reading page n (scanned)…") and can be stopped. It reads the bottom-right 38% at full detail
first, then the whole page downscaled, and hands the lines to `parseFloorName`. When the files are missing or the
browser lacks WebAssembly SIMD, the picker says "Scanned pages can't be read here — name them by hand." No AI service
is involved. `node scripts/vendor-ocr.mjs` downloads the pinned files from the npm registry and checks each SHA-256;
`--check` only verifies them.

iPad: Vision text recognition (`ScanProcessing.recognizeLines` / `floorName(in:)`) with the same `FloorName` rules:
scan review, photos, and PDF pages without a text layer (`PlanImporter.floorName(text:image:)`).

## UI (web)

- **Import: choose and name pages** (`src/components/ImportPagePicker.tsx`). Choosing a PDF opens one screen with every
  page: a large thumbnail (rendered as it scrolls into view, so 60-page sets open at once; tap to enlarge), a tick to
  keep or skip it (cover, specs, near-duplicates; "Skip all" / "Keep all"), and its name, filled in with the floor read
  from the page ("Read from the page" / "Read from the scan"), else "please name it". Scanned pages are read by OCR in
  the background, one at a time, without overwriting a name being typed. **Import N pages** renders only the kept pages
  (`renderPdf(file, onProgress, pages)`); a page left unnamed is called "Page n". Touch targets are 44 px. iPad:
  `PDFPagePickerView` (same step).
- **Review sheet names** follows when the title blocks carry sheet numbers or titles — name, number, title and
  discipline per page, editable, "Use page numbers" to drop numbers and titles, a duplicate-number warning. A floor
  name read from the page fills the name only when the sheet still has a made-up one (never a typed name). Saving
  creates automatic links from callouts (optional checkbox). From **Detect names & links from PDF** it also appears
  when only floor names were found.
- **Photos** are named from the photo by OCR after they are straightened, while the name is still the file name.
- **Sheet menu on the plan** (`src/components/editor/viewer/SheetMenu.tsx`, office): the ⋯ button on the sheet pill,
  a long press on the pill (touch) or a right-click: Rename (in place), Move up / down, Manage sheets, Delete (asks;
  one undo step, **Undo** on the toast and on the plan toolbar; the plan steps to the neighbouring sheet).
- **Manage sheets**: inline rename as before; **Select sheets** → tick several → **Delete selected** (one undo step,
  Undo on the toast). Move up / down is one undo step (`moveSheet`).
- Deleting keeps the soft delete: the sheet row gets `deleted: true` and syncs; its devices, runs and closets stay
  stored but leave the takeoff, estimate and exports with the sheet (`computeTakeoff` counts live sheets only); Undo
  brings everything back (`tests/sheetDelete.test.ts`, `SheetDeleteTakeoffTests`). iPad: the sheet pill and the
  sheet browser have Rename / Move / Delete in their long-press menus, the plans screen has **Select plans** →
  **Delete selected** (one undo step, `SheetActions`).
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

- OCR reads English only, horizontal text best (a title strip turned 90° on a scan is read by the whole-page pass
  only if Tesseract finds it). Handwritten floor names are not read.
- The iPad import changes (page picker, OCR naming of scanned PDFs, sheet menus) were written without compiling the
  app target here; `PinPlanCore` (with `FloorName`) is built and tested with `swift test`.
- Rotating a sheet (Sheets › Rotate) rotates devices and runs but not its links yet: redraw them, or run
  "Detect names & links from PDF" after removing the auto links (only unrotated sheets match the PDF).
- Links from sheets imported before this feature appear only after "Detect names & links from PDF".

## Permissions

Office (owner/admin, or working alone) creates, edits and deletes links and sheet numbers/titles/disciplines.
Technicians follow links and may edit sheet tags only (the database enforces the link rules).

## Tests

- `tests/floorName.test.ts`, `tests/sheetDelete.test.ts`, `ios/PinPlanCore/Tests/PinPlanCoreTests/FloorNameTests.swift`
  (see above); `e2e/sheets.spec.ts`: the page picker on `samples/demo-plan-set.pdf` (names read, a page skipped, one
  renamed), the review, the sheet menu (rename, delete, Undo, long press), Manage sheets multi-delete with Undo, and a
  scanned PDF (`e2e/fixtures/scanned-plan.pdf`, no text layer) named `1st Fl` / `2nd Fl` by OCR.
- `tests/sheetIndex.test.ts`: numbers (with scale / date / revision look-alikes), titles, disciplines, grouping,
  display names, callouts (own number and title block excluded, duplicates skipped), dedupe, hit testing, text-item
  transforms (incl. rotation), page matching, sync round trip; and the real fixture `tests/fixtures/sheet-links.pdf`
  (made by `scripts/make-sheet-links-fixture.cjs`).
- `tests/schema.test.ts`, `tests/syncMap.test.ts`: the new columns and table.
- `scripts/e2e-sheet-links.cjs` (Playwright, desktop + phone): import the fixture, accept names, red link on page 1,
  tap → sheet 2, Back → sheet 1, draw a link to a document and open it, "Linked on E-101", sheet index.
