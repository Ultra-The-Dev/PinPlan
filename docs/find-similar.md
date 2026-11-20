# Find similar (count doors, windows and any repeated symbol)

Plan editor, Edit mode only. Toolbar → **Find similar** (on phones: **More → Find similar**). No AI: it runs on this
device, offline once loaded (AI stays off, `src/lib/features.ts`).

1. **Count as**: any device type from the device menu (Door, Window, Door contact, Window sensor…). The last one used
   is remembered on this device; otherwise the first type called "Door".
2. Pick how to find them:
   - **Match a symbol**: tap one symbol on the plan, or drag a box around it (a box is more precise). Every symbol that
     looks like it on this plan is found, turned by 90°, 180° or 270° and mirrored too (door swings go both ways).
     On phones one finger draws the box while picking; two fingers move the plan.
   - **Read tags**: door and window tags printed on the plan (`D1`, `D-12`, `W3`, `WD2`…), one suggestion per tag.
     "Tags start with" is editable (defaults: doors `D, DR`; windows `W, WD, WIN`; other types empty).
3. Results are **suggestions** (dashed ghost pins with the type's letters). They never count until accepted
   (CLAUDE.md: counts come only from placed devices). The card says **Found 14** with **Accept all · Review one by one ·
   Clear**:
   - tap a ghost to reject it (grey, crossed out); tap again to take it back;
   - **Review one by one** zooms to each in turn: Keep / Reject / previous / next / Done;
   - **Accept all** turns every shown, not rejected ghost into a normal device of the chosen type — one undo step
     (`useEditor.addMarkers`), so ⌘Z takes the whole batch back;
   - **Sensitivity** (match only): Fewer ↔ More, instant (no new search).
4. Spots that already have a device of the chosen type nearby are never suggested (so running it again, or after
   placing some by hand, doesn't double count). The card's footer shows this floor's count: "On this floor: Door: 9 ·
   Window: 10" (door / window types and the type being counted). The Takeoff tab counts them per floor like any device.

Results belong to one plan: moving to another plan clears them. Closing the card (or starting another tool) keeps them
until you open it again or press Clear; they are kept in memory only, never saved or synced.

## How matching works

`src/lib/findSimilar/match.worker.ts` (a Web Worker, so the plan stays responsive) with the pure helpers in
`src/lib/findSimilar/match.ts`:

- Loads the self-hosted OpenCV.js (`/vendor/opencv-4.10.0.js`, `OPENCV_URL` in `src/lib/perspective.ts`, the same file
  photo straightening uses; about 1 s the first time, cached by the service worker after that). The module is
  "thenable" (emscripten adds `then()`), so it is always passed around wrapped in an object; resolving a promise with
  it directly loops forever.
- Shrinks the sheet so the picked symbol's shorter side is ~32 px (`chooseScale`: never enlarged, sheet ≤ 3200 px on
  its long side, template ≥ 10 px), greys it, area-averages (keeps thin lines) and blurs 3×3. The template is cut from
  that same image. A tap picks a 4 ft square (1.5% of the sheet without a scale, `tapBox`) trimmed to its ink.
- Normalised cross-correlation (`TM_CCOEFF_NORMED`) for each distinct orientation of the template
  (`distinctOrientations`: symmetric symbols are searched once per distinct look, a door swing all 8 ways).
- Local peaks above the lowest slider threshold (`scorePeaks`), then greedy non-maximum suppression across all
  orientations (`nonMaxSuppress`, half the symbol's shorter side). NMS keeps a candidate only when no better one is
  near, so filtering by a higher threshold afterwards equals running NMS on the filtered list — the slider just
  filters (`thresholdFor`: 0 → 0.95, 50 → 0.70, 100 → 0.45).
- Found spots within 0.6 × the symbol's size of a device of the chosen type are hidden (`withoutExisting`).

Main-thread side: `src/lib/findSimilar/client.ts` (one search at a time; a newer one replaces it).

## How Read tags works

`src/lib/findSimilar/tags.ts` (pure): words of the PDF text layer (`wordsOf`) that match
`^(prefix)[-.]?\d{1,3}[A-Z]?$`, centred on the word; a tag drawn twice on the same spot counts once; schedules are
skipped (four or more tags stacked in one column with small gaps). A tag sits beside its symbol, so a tag within 4 ft
(2% of the sheet without a scale) of a device of the type is treated as already counted.

The text layer: plan import keeps each PDF page's positioned text on this device (`src/lib/findSimilar/sheetText.ts`,
its own IndexedDB `pinplan-sheet-text`, keyed by image id — a rotated sheet or a new revision has a new image, so stale
text never lines up with the wrong picture). Sheets imported before this, or on another device, get **Choose the PDF**
(the same page matching as the sheet index, `matchPagesToSheets`). Plans added as pictures (photos, scans) have no text:
the card says so and points to Match a symbol.

## Files

| File | What |
| --- | --- |
| `src/lib/findSimilar/match.ts` | Pure: orientations, peaks, NMS, scale, boxes, de-duplication. |
| `src/lib/findSimilar/match.worker.ts`, `client.ts` | OpenCV template matching in a worker. |
| `src/lib/findSimilar/tags.ts`, `sheetText.ts` | Read tags; the local text layer store. |
| `src/components/findSimilar/*` | Store (suggestions, accept), overlay (ghosts, taps, box drag), card. |
| `src/lib/store.ts` `addMarkers` | Several devices in one undo step. |
| `tests/findSimilar.test.ts` | Unit tests of the pure parts. |
| `samples/doors-windows-demo.pdf` | A synthetic plan: 9 doors (every turn and swing), 9 windows, tags, a door schedule. |

The card sits in the plan's left rail on tablets and desktops (`RailSlot side="left" order={50}`) and is a bottom sheet
on phones; it owns plan taps while open (`claimPlanInput("find-similar")`), like Measure or Markups.

## On the sample plan

`samples/doors-windows-demo.pdf` (4800 × 3105 px sheet after import, 1/4" = 1'-0"):

- Tap one door: 9 of 9 doors found (all four turns, both swings), no false positives at the default sensitivity
  (0.70); about 1.7 s for the first search including loading OpenCV. At high sensitivity (80) it finds 76 — walls and
  arcs start to look alike, which is what the slider is for.
- Box around one window (in a vertical wall): 9 of 9 windows plus 2 false positives — the two exterior door openings,
  whose wall break with jamb lines looks like a window. Tap them to reject, or review one by one.
- Read tags: 9 door tags (the 9 rows of the door schedule are skipped), 9 window tags.

## Limits

- Symbols are matched at the picked size: plans drawn at different scales on one sheet (enlarged details) are not
  matched across sizes, and turns other than multiples of 90° are not searched.
- Very busy sheets (hatching, dense text) give more look-alikes; drag a tight box and lower the sensitivity.
- Read tags needs the PDF's own text (not a scan) and tags that are real text, not lines; tags split into two text
  runs ("D" and "1") are not joined.
- Suggestions aren't saved: reloading the page drops them (run it again; it takes a second).

## iPad and iPhone

Same tool, same rules: plan → **Tools (⋯) → Find similar**, Edit mode. The card sits in the plan's controls column
(bottom right). Files: `ios/PinPlanCore/Sources/PinPlanCore/FindSimilar.swift` and `FindTags.swift` (pure, tested with
`swift test` in `FindSimilarTests`), `ios/PinPlan/FindSimilar/` (state, overlay, card).

- **Matching** is native Swift, no OpenCV: the sheet is decoded with ImageIO / Core Graphics at twice the work size,
  area-averaged and blurred 3×3 (`FindSimilar.prepare`), then normalised cross-correlation (TM_CCOEFF_NORMED) for every
  distinct turn and mirror, the orientations side by side on all cores, Accelerate's vDSP for the inner loop. Instead of
  OpenCV's FFT it searches each orientation at half size first and scores every promising spot exactly at full size
  (±2 px); windows of blank paper are skipped. Scores are full-size NCC, so the slider and the thresholds are the web's.
  About 1 s for a 3200 px sheet on a 4-core Linux runner without vDSP (`testBenchmarkFullSheet`).
- **Read tags** uses the plan's original PDF, which the app keeps (`Sheet.sourcePdfId`), so there is no "Choose the
  PDF" step; one item per word (`PlanTextExtractor.words`). Scans and photos have no text layer, so the app reads them
  with on-device text recognition (Vision) instead — the web points those to Match a symbol.
- **Draw a box**: a switch on the card. While it's on, one finger draws the box and the plan doesn't move (turn it off,
  or tap a symbol instead). A tap on a symbol works without it.
- Accept all: `EditorModel.addMarkers`, one undo step; each device takes the room printed where it lands.
- Debug builds: `--demo --tab plan --find-similar open|match|review|tags` opens the tool on the demo job (its doors
  have tags D1–D3). `.github/workflows/ios-sim-screens.yml` screenshots these on an iPad simulator.
