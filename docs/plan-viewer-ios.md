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
| `ios/PinPlan/Viewer/PlanOverlay.swift` | **The overlay extension point** (below). |
| `ios/PinPlan/Viewer/ViewerChrome.swift`, `SheetBrowserView.swift`, `PlanMinimap.swift`, `LayersPanel.swift` | Floating controls, View/Edit switch, sheet browser, minimap, layers & filters. |
| `ios/PinPlan/Viewer/EditorModel+Viewer.swift`, `ViewerSupport.swift` | Mode, remembered filters and recents, haptics, CG ↔ core conversions. |
| `ios/PinPlan/Editor/PlanCanvasView.swift` | Puts it together: zoom view + markup + overlays, taps, press-and-hold drag, precision aiming. |

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
| Press and hold a device (Edit) | Pick it up (haptic) and drag; let go without moving for quick actions |
| Swipe in from a side edge while the sheet is at that edge | Previous / next sheet |
| Scale line / measure | One finger aims with a loupe; two fingers pan and zoom |
| Apple Pencil (option in Tools on iPad) | Pencil places and draws, fingers only pan |

Keyboard (iPad): `E` View/Edit, `B` sheets, `[` `]` previous/next sheet, `⌘=` `⌘-` zoom, `F` fit, `L` labels,
`M` measure, `Esc`, `Delete`.

## Drawing on the plan: overlays

Register a `PlanOverlay` once (app start, or when your feature turns on). Its content is a SwiftUI view built from a
`PlanOverlayContext` and redrawn every frame while the plan moves.

```swift
PlanOverlayRegistry.shared.register(PlanOverlay(id: "tasks", zIndex: 20, allowsHitTesting: false) { ctx in
    AnyView(TaskPinsLayer(ctx: ctx))
} onTap: { tap in
    // tap.sheetPoint is sheet-relative; tap.location is in view points.
    guard let pin = TaskPins.hit(tap.location, ctx: tap.context) else { return false }
    open(pin)
    return true                 // consumed: the viewer won't select or place anything
})

struct TaskPinsLayer: View {
    let ctx: PlanOverlayContext
    var body: some View {
        Canvas { g, _ in
            for pin in ctx.model.bundle.tasks where pin.sheetId == ctx.sheet.id && ctx.isOnScreen(pin.x, pin.y) {
                let p = ctx.point(pin.x, pin.y)            // constant size on screen
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
before selection and placement; return `true` to consume).

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
