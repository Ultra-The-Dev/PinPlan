# Plan viewer (web)

The plan tab (`src/components/editor/PlanEditor.tsx` + `PlanCanvas.tsx`) is a pan/zoom viewer for large plan sheets with
devices, runs and closets drawn on top. This page explains how it's built and how other features draw on the plan.

## Pieces

| File | What it does |
| --- | --- |
| `src/lib/viewport.ts` | Pure geometry: transform, sheet ↔ screen conversions, fit / limits / clamping, zoom about a point, pinch, animation interpolation, momentum, per-sheet view memory, marker size factor, image pyramid levels and visible tiles. Tested in `tests/viewport.test.ts`. |
| `src/lib/planViewport.ts` | `PlanViewport`: the live transform, outside React. Pushes it straight to the Konva stage, animates (`animateTo`, `zoomBy`, `fit`, `focus`), flings, and notifies subscribers once per frame. |
| `src/lib/planGestures.ts` | `PlanGestures`: one pointer-event state machine (mouse, pen, touch): tap, double-tap, long-press, pan + momentum, pinch, two-finger tap, dragging a device / closet / run point, edge swipes, wheel and trackpad. |
| `src/lib/planHit.ts` | Hit testing in plain math (no Konva hit canvas). |
| `src/lib/planFilter.ts` | Layers & filters (display only). |
| `src/lib/viewerStore.ts` | Viewer preferences per user on this device: view/edit mode, minimap, layers & filters, each sheet's zoom/position, recently viewed sheets. |
| `src/lib/tiles/*` | Image pyramid: `tile.worker.ts` builds a ≤2048 px preview, a thumbnail and 512 px tiles for every finer level (OffscreenCanvas, in a worker), caches them in IndexedDB (`pinplan-tiles`, separate from app data); `tileClient.ts` serves them (LRU of ImageBitmaps) plus `usePyramid` / `useSheetThumb`. Browsers without OffscreenCanvas draw the whole image as before. |
| `src/components/editor/canvas/*` | Konva drawing: `SheetImage` (preview + visible tiles), `MarkersShape` (every device in one shape, from cached sprites, culled to the screen), `PlanShapes` (runs, closets). |
| `src/components/editor/viewer/*` | Chrome: sheet pill, sheet browser, toolbar, mode toggle, zoom controls, minimap, layers panel. |

Coordinates: markers/runs/closets store **relative** positions (0–1). The Konva stage works in **sheet image pixels**
(`rel × sheet.width/height`); the stage transform maps them to **screen** pixels in the plan view:
`screen = sheetPx × scale + (x, y)`.

All Konva layers have `listening={false}`: Konva never draws a hit canvas, and taps/drags go through `PlanGestures`.
Don't attach Konva event handlers to plan content; use an overlay's `onTap` (below).

## Drawing on the plan: overlays

Features that draw on the plan (task pins, markups, measurements, sheet links, revision compare…) are **overlays**,
separate components that don't need changes in `PlanCanvas`/`PlanEditor`.

```ts
import { registerPlanOverlay, useViewTransform, type PlanOverlay } from "@/lib/planOverlays";

const pins: PlanOverlay = {
  id: "task-pins",
  order: 210, // devices/runs are 100; overlays default to 200
  enabled: (ctx) => featureOn && ctx.sheet.id !== "…",
  // Konva: sheet-pixel coordinates, the stage transform already applied. Rendered in its own <Layer listening={false}>.
  konva: (ctx) => <TaskPins sheet={ctx.sheet} viewport={ctx.viewport} />,
  // HTML: screen pixels, in a full-size box over the plan (pointer-events: none on the box).
  html: (ctx) => <PinLabels viewport={ctx.viewport} />,
  // Taps/clicks on the plan, before the editor's own tools. Return true when handled.
  onTap: (e, ctx) => {
    if (!placingPin) return false;
    addPin(ctx.sheet.id, e.rel.x, e.rel.y);
    return true;
  },
};

// Once, at module load of the feature (or in an effect, keeping the returned unregister function):
registerPlanOverlay(pins);
```

Or pass overlays to one view only: `<PlanCanvas overlays={[pins]} … />` (a prop overlay replaces a registered one with
the same id).

`ctx` (`PlanOverlayContext`) has `sheet`, `viewport` (a `PlanViewport`), `editing` (false in view-only mode — don't
change anything on a stray tap then) and `tool`.

`PlanTapEvent`: `rel` (0–1), `sheetPx`, `screen` (px in the plan view), `pointerType`, `shiftKey`, and `hit` (what the
editor would hit there: `{ kind: "marker" | "closet" | "run" | "handle", id }` or null).

### The viewport API (`ctx.viewport`)

- `transform` → `{ scale, x, y }`; `viewSize` → `{ w, h }`; `sheetDims` → `{ width, height }`; `limits` → `{ min, max, fit }`;
  `sizeFactor` (on-screen size multiplier for markers at this zoom); `moving` (gesture/animation in progress).
- Conversions with the current transform: `relToScreen`, `screenToRel`, `sheetPxToScreen`, `screenToSheetPx`.
  The same functions, pure and taking a transform, are in `src/lib/viewport.ts`.
- Navigation: `zoomBy(factor, point?)`, `animateTo(transform)`, `fit("sheet" | "width")`, `actualSize()`,
  `focus(rel, minZoom?)`, `centerRel(rel, animate?)`, `panBy(dx, dy)`.
- `subscribe(listener)` / `getSnapshot()`; in React use `useViewTransform(viewport)` (re-renders at most once per frame
  while the view moves).

### Staying a constant size on screen

Konva overlay content scales with the plan. For pins/labels that should keep their screen size, either:

- give the node `name="cs"` (`CONSTANT_SIZE` from `planViewport.ts`): the viewport keeps its scale at
  `sizeFactor / zoom` on every zoom. After your overlay creates new `cs` nodes outside a `PlanCanvas` render, call
  `viewport.updateConstantSize()` in a layout effect; or
- draw it yourself in a `<Shape sceneFunc>` in screen space, like `MarkersShape` does (fastest for many items), and
  use `strokeScaleEnabled={false}` for lines that keep their width.

HTML overlays position elements with `viewport.relToScreen(…)` from `useViewTransform`. Keep them few (they re-render
every frame while moving). Interactive HTML (buttons) needs `pointer-events: auto` and a `data-plan-ui` attribute so
the plan's gestures ignore it.

## Gestures and keys

- Wheel / mouse: notched wheel = smooth zoom to the cursor; trackpad pinch (ctrl+wheel) = continuous zoom; two-finger
  trackpad scroll = pan; drag on empty plan = pan with momentum; double-click = zoom in; space + drag = pan from
  anywhere; middle button drag = pan.
- Touch: one finger pans (with momentum), two fingers pinch + pan, double-tap zooms in, two-finger tap zooms out,
  swipe in from the left/right edge = previous/next sheet. A device moves only after a **long-press** (edit mode); a
  quick drag across it pans the plan. Mouse/pen drags devices after a 4–6 px threshold.
- Keys: `+`/`−` (also ⌘+/⌘−), `0` fit sheet, `W` fit width, `1` 100%, arrows pan (shift = more), `[`/`]` sheets,
  `E` view/edit, `F` fit, `L` labels, `M` measure, `V`/Esc select. Zoom limits: half of fit to 4 screen px per image px.
  Animations are instant with `prefers-reduced-motion`.

## View only vs edit

Technicians open the plan in **View**, everyone else in their last mode (Edit by default). View hides the device menu
and editing tools, blocks dragging and deleting, and allows measuring. Edit frames the plan in orange.

## Performance notes

- No React render per frame: the transform goes straight to Konva; React only re-renders when the view settles.
- Devices: one Konva shape, sprites cached per look, only on-screen devices drawn; no hit canvas.
- Sheet: the preview is drawn only where a sharp tile is missing; tiles are picked for the zoom × device pixel ratio
  and requested with a 256 px margin; the stage pixel ratio is capped at 2.
- `window.__pinplanViewer` exposes `{ viewport, gestures, sheetStats, markerStats, editor }` for tests and support.
- End-to-end check and benchmark: `scripts/e2e-plan-viewer.cjs` (see its header).
