# Plan viewer (iPad / iPhone)

How the iOS plan viewer works, and how to draw your own things on the plan (task pins, markups, measurements,
hyperlinks, revision compare…).

## Pieces

| File | What it does |
| --- | --- |
| `ios/PinPlanCore/Sources/PinPlanCore/PlanViewport.swift` | Pure geometry: `PlanViewport` (sheet ↔ view), zoom limits, `PlanViewState` (remembered view), `PlanTiles` (tile pyramid maths and level selection), `PlanMarkerMetrics`, `PlanDensity`. Foundation only, tested on Linux (`PlanViewerTests.swift`). |
| `ios/PinPlanCore/Sources/PinPlanCore/PlanFilter.swift` | `PlanFilter` (layers and filters), `PlanViewerMode` (View / Edit), `SheetNav` (order, prev/next, search, recents). |
| `ios/PinPlan/Viewer/PlanZoomView.swift` | `UIScrollView` zoom container (`PlanScrollView`) and all plan gestures (`PlanZoomCoordinator`). |
| `ios/PinPlan/Viewer/TiledSheetView.swift` | `CATiledLayer` view drawing the tile pyramid, and the vector PDF past the raster's resolution. |
| `ios/PinPlan/Viewer/PlanTileStore.swift` | Builds and caches tile pyramids, previews and thumbnails in `Caches/PlanTiles/`. |
| `ios/PinPlan/Viewer/PlanViewportController.swift` | The live `PlanViewport` (observable) plus commands: `fit`, `center(on:zoom:)`, `show(_:)`, `zoom(by:)`, `pan(toCenter:)`. |
| `ios/PinPlan/Viewer/PlanMarkupLayer.swift` | Devices and runs in one `Canvas` pass (symbols resolved once and stamped, culled to the screen), closets. |
| `ios/PinPlan/Viewer/PlanOverlay.swift` | **The overlay extension point** (below): `PlanOverlay`, `PlanOverlayRegistry`, `PlanOverlayHost` (drawing) and `PlanOverlayControlsHost` (buttons). |
| `ios/PinPlan/Viewer/ViewerChrome.swift`, `SheetBrowserView.swift`, `PlanMinimap.swift`, `LayersPanel.swift` | Floating controls, View/Edit switch, sheet browser, minimap, layers & filters. |
| `ios/PinPlan/Viewer/EditorModel+Viewer.swift`, `ViewerSupport.swift` | Mode, remembered filters and recents, haptics, CG ↔ core conversions. |
| `ios/PinPlan/Editor/PlanCanvasView.swift` | Puts it together: zoom view + markup + overlays, taps, press-and-hold drag, precision aiming. |

## Where the plan sits in the job

A job has seven sections, the same as on the web (docs/navigation.md): **Overview · Plan · Takeoff · Tasks · Photos ·
Money · Field** (Money is office only). iPad shows them as a segmented control in the navigation bar; iPhone's tab
bar is **Plan · Tasks · Photos · Money · More** (technicians: Plan · Tasks · Photos · Field · More), with a section
switch at the top of More for the rest (`ios/PinPlan/Views/ProjectView.swift`, `ProjectTab`;
`ProjectTabRoute.phoneTabs` in PinPlanCore). The Plan section is this viewer. There is no separate Sheets
tab any more: a job with no plans shows the import screen in Plan, and after that importing, renaming, reordering,
rotating and deleting plans live in **Add or manage** in the sheet browser (also Tools → "Add or manage plans…").
It opens `ManagePlansSheet` (`SheetsView` in a sheet) through `EditorModel.showManagePlans`. Wiring sheets (the old
Crew tab) are a page of Takeoff. `ProjectTab.resolve(_:)` maps the old and web tab ids (`sheets`, `crew`,
`estimate`, `info`, `job`) to the new section and page.

The plan is for devices. Task pins are a layer, **off by default** (Layers → On the plan → *Task pins*;
`TaskOverlayState.showPins`); the task controls in the controls column show only while it is on, and there is no
"+ Task" on the plan: tasks are made in the Tasks section (`TaskListView`, "+ Task", where a sheet and a device can be
picked from a list). A device's card (`SelectionPeek` in View mode, the inspector in Edit mode) shows **N photos** and
**N tasks** chips when it has any (`DeviceLinkChips`): one tap opens the Photos section filtered to the device, or the
task (the Tasks section filtered to the device when there are several), through `JobNav.shared`.

## Floating controls layout

The plan gets the whole screen; everything else floats at the edges. Nothing sits under the navigation bar.

| Where | What |
| --- | --- |
| Top left | Sheet pill: previous / plan name ("Plan 2 of 4", opens the browser) / next |
| Top right | View / Edit switch (Edit adds an action-blue frame around the plan) |
| Under the top row (iPhone) | The action bar: Devices (Edit), undo / redo, Tools, read the plan, floor counts. On iPad these are in the navigation bar |
| Under that | Hints while placing or drawing, tips, the drawing bar |
| Bottom right — **controls slot** | The plan overlays' buttons (`controls`: tasks, install progress) and below them `ViewerControls` (layers, minimap, zoom on iPad / VoiceOver, whole sheet, full screen) |
| Bottom left | iPad: minimap and the zoom / scale chip. iPhone: minimap goes top left under the action bar |
| Bottom centre | Selection card (View), "Done placing", the quick device dock (Edit), toasts |
| Bottom left, above the dock | Install progress undo snackbar ("Fixture 3 → Installed · Undo"), kept clear of the controls slot |

The controls slot (`PlanEditorView.trailingControls`) measures itself against the room between the top chrome and
the bottom padding. When the overlays' buttons and the viewer controls fit in one column they stack (iPad, tall
phones). When they don't (most phones once a feature card is open, every phone in landscape) the overlays' buttons
move beside the viewer controls, and if even that column is too tall it scrolls (`scrollable(if:maxHeight:)`) — so
the controls never grow up into the top chrome or the navigation bar, at any size class. Switching between the two
uses `AnyLayout`, so the controls keep their state and any sheet they present.

## Why a UIScrollView

Pinch anchored under the fingers, momentum and deceleration, rubber-banding at the edges and at the zoom limits,
trackpad two-finger scroll, mouse wheel and trackpad pinch all come with `UIScrollView`, tuned exactly as in
Photos, Files and Fieldwire. Rebuilding them with SwiftUI `DragGesture`/`MagnifyGesture` means re-implementing and
re-tuning each one by hand (the previous canvas did, and had none of momentum, rubber-banding or trackpad
support). Only the sheet image is inside the scroll view; everything drawn on the plan is SwiftUI on top, positioned
from the published `PlanViewport`, so symbols and labels stay a constant size on screen.

## Rendering

* Content coordinates are **sheet pixels**; `zoomScale` (= `PlanViewport.zoom`) is points per sheet pixel.
* `PlanTileStore` builds a pyramid once per sheet image (`imageId` is the key: rotating a sheet saves a new image):
  level 0 is full resolution, each level halves it, 512 px JPEG tiles. Coarse levels first, full resolution decoded
  once and released. A ≤2048 px preview (≤1400 px on 2–3 GB devices) shows instantly under the tiles, and a 480 px
  thumbnail feeds the sheet browser and minimap.
* `TiledSheetView` (CATiledLayer) asks only for tiles on screen, on background threads; `PlanTiles.level(...)` picks
  the coarsest level with at least one image pixel per screen pixel. Past the raster's own resolution
  (`wantsVectorDetail`), sheets imported from a PDF are drawn straight from the vector page — crisp at any zoom.
* Decoded tiles live in an `NSCache` (64 MB, 24 MB on low-memory devices) emptied on memory warnings.
* Devices: one `Canvas`, one resolved symbol per (type, tentative, selected), culled with
  `PlanViewport.cullRect(margin:)`; labels are skipped when more than `PlanMarkerMetrics.maxLabels` are on screen.

## Gestures

| Gesture | Does |
| --- | --- |
| Pinch / trackpad pinch | Zoom around the pinch centre (rubber-bands past the limits) |
| Drag / two-finger trackpad scroll / wheel | Pan with momentum |
| Double-tap | Zoom in 2.5× at that point; at the closest zoom, back to the whole sheet (off while placing so taps are instant) |
| Two-finger tap | Zoom out |
| Tap | View mode: show the device/closet/run card. Edit mode: select, or place/draw with the current tool |
| Press and hold a device (Edit) | Pick it up (haptic) and drag; let go without moving for quick actions. The hold reaches a little further than a tap (`PlanMarkerMetrics.liftRadius`), so a finger covering the symbol still grabs it |
| Swipe in from a side edge while the sheet is at that edge | Previous / next sheet |
| Scale line / measure | One finger aims with a loupe; two fingers pan and zoom |
| Apple Pencil (option in Tools on iPad) | Pencil places and draws, fingers only pan |
| Apple Pencil double-tap / squeeze (Edit) | Back to select from the current tool, or from select to the last tool (follows the Pencil setting; squeeze only when set to switch tools) |
| Apple Pencil hover / pointer while placing | A faint preview of the device where it would land |
| Shake (iPhone), three-finger swipe left / right | Undo / redo in Edit mode (`EditorUndoManager` forwards the system's undo to the editor's history once the plan has been touched) |

Haptics: light on place and drop, firm on delete, soft on undo / redo, selection tick on select and sheet change.

Keyboard (iPad, or iPhone with a keyboard): `⌘Z` / `⇧⌘Z` undo / redo (also in full screen), `E` View/Edit, `B` sheet
browser, `[` `]` previous/next sheet, `⌘=` `⌘-` zoom, `F` fit, `L` labels, `M` measure, `Esc`, `Delete`, arrows move
the selected device or closet 2 pt (`⇧` 12 pt, `PlanNudge`).

Narrow regular-width windows (iPad mini portrait, Split View, Stage Manager): when the device palette and a right-hand
panel would leave the plan less than 400 pt, the right-hand panel takes the palette's place while it is open.

## Drawing on the plan: overlays

Register a `PlanOverlay` once (app start — `PinPlanApp.init`, inside `MainActor.assumeIsolated` — or when your
feature turns on). Its content is a SwiftUI view built from a
`PlanOverlayContext` and redrawn every frame while the plan moves.

```swift
PlanOverlayRegistry.shared.register(PlanOverlay(id: "tasks", zIndex: 30, content: { ctx in
    AnyView(TaskPinsLayer(ctx: ctx))
}, onTap: { tap in
    // tap.sheetPoint is sheet-relative; tap.location is in view points.
    guard let pin = TaskOverlays.hit(tap.location, ctx: tap.context) else { return false }
    open(pin)
    return true                 // consumed: the viewer won't select or place anything
}, controls: { ctx in
    AnyView(TaskPlanControls(ctx: ctx))   // optional: buttons in the floating controls column
}))

struct TaskPinsLayer: View {
    let ctx: PlanOverlayContext
    var body: some View {
        Canvas { g, _ in
            for pin in ctx.model.bundle.liveTasks where pin.sheetId == ctx.sheet.id && ctx.isOnScreen(pin.x ?? 0, pin.y ?? 0) {
                let p = ctx.point(pin.x ?? 0, pin.y ?? 0)  // constant size on screen
                g.fill(Path(ellipseIn: CGRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18)), with: .color(.blue))
            }
        }
    }
}
```

`PlanOverlayContext`:

| Member | |
| --- | --- |
| `viewport: PlanViewport` | Current transform. `toView(_:)`, `toSheet(_:)`, `toSheetClamped(_:)`, `toView(_ rect:)`, `visibleSheetRect`, `cullRect(margin:)`, `isOnScreen(_:margin:)`, `points(feet:pxPerFt:)`, `zoom` (points per sheet pixel), `fitZoom`. |
| `point(x, y)` / `relative(cgPoint)` | CGPoint conveniences for the two conversions. |
| `points(feet:)` | Feet on this sheet → points on screen (nil until the sheet has a scale). |
| `isOnScreen(x, y, margin:)` | Cull with it. |
| `sheet`, `model`, `mode` | The sheet (`pxPerFt`, size), the editor (`bundle`, `edit {}` for undoable changes), View/Edit. |
| `controller` | `center(on:zoom:)`, `show(_ rect:)`, `fit()`, `zoom(by:)` — e.g. "go to pin". |

`PlanOverlay` options: `zIndex` (draw order; overlays sit above devices and runs, below the floating controls),
`allowsHitTesting` (leave `false` for pure drawings so the plan keeps panning; set `true` for buttons on pins —
only the views you draw take touches), `modes` (`[.view, .edit]` by default), `onTap` (called topmost first,
before selection and placement; return `true` to consume), `controls` (below).

### Buttons for your feature: `controls`

`controls: (PlanControlsContext) -> AnyView` adds your buttons to the viewer's floating controls slot (bottom right:
above the zoom / layers controls when there is room, beside them on short screens — see "Floating controls layout";
in the overlay's `modes`, ordered by `zIndex`). `PlanControlsContext`
has `sheet`, `model`, `mode` and `controller` but no viewport, so the buttons don't redraw while the plan moves.
Present your sheets from this view (it stays put). Keep it small: one labelled primary button and a few icons in a
material pill, like `ViewerControls`; an expanded card is at most 260 pt wide on iPhone so it fits beside the
viewer controls on the narrowest phone. Never pin your own buttons to the top of the plan from `content`: the top
belongs to the sheet pill and the iPhone action bar.

### Example: task pins (`ios/PinPlan/Tasks/TaskPinsOverlay.swift`)

* `tasks` overlay (View and Edit): pins drawn in one `Canvas`; `onTap` first places an armed drop ("+ Task", or
  place / duplicate from a task), else opens the pin under the finger. In Edit mode with a placing or drawing tool,
  pin taps go to the tool. Its `controls` are "+ Task", show/hide pins, filters and the sheet's task list.
* `tasks-drag` overlay (Edit only, `allowsHitTesting: true`): one touch target on the selected pin with a
  `DragGesture` in `PlanCanvasView.space` — the same pattern as the run point handles — so only that pin captures
  touches and everything else still pans.

Install progress (`ios/PinPlan/Progress/ProgressOverlay.swift`) is the other example: rings in a `Canvas`, walk-mode
taps through `onTap`, and its `controls` in the slot: a "Progress" button that opens a card with the counter
("3/40 tested"), "Walk the job" and, while walking, what a tap marks (next step, roughed, installed, tested, issue,
verified, details). Its undo snackbar is a separate `install-progress-snack` overlay (`allowsHitTesting: true`)
drawn bottom left, clear of the slot. (Before, the Progress / Walk card was drawn at the top left of the plan, where
on iPhone it covered the action bar under the navigation bar.)

Rules of thumb: store positions sheet-relative (0–1) like markers; draw with `ctx.point`, never cache view
coordinates; cull to the screen; draw many items in one `Canvas` rather than one view each; keep work in the
content closure small — it runs every frame during a pinch. Pure maths (hit tests, snapping, measurements) belongs
in PinPlanCore next to `PlanViewport`, with tests.

To pan/zoom from your own UI outside an overlay, use the editor's `PlanViewportController` (owned by
`PlanEditorView`).

## Remembered on the device

`ViewerPrefs` (UserDefaults): each sheet's view (`viewer.view.<sheetId>`, as `PlanViewState`: centre + zoom over
fit, so it survives rotation and panels), recently viewed sheets per job, layer filters per job, View/Edit
(technicians always open in View), minimap on/off and the Pencil option.

## Screenshot hooks

`--viewer-zoomed` (opens the busiest sheet zoomed into its densest cluster), `--sheet-browser`, `--layers`,
`--minimap`, `--view-mode`. Captured by `.github/workflows/ios-screenshots.yml` on iPhone and iPad.
`--tab <id>` opens a job section; the old ids still work through `ProjectTab.resolve` (`sheets` opens Plan with
"Add or manage", `crew` opens Takeoff → Wiring sheets, `estimate` opens Money, `photos` opens Photos,
`job` opens Overview). Launch arguments are read in Debug builds only.
