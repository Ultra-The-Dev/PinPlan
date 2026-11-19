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

Optional extras: `onDoubleTap(e, ctx)` (return true to stop the editor's double-tap zoom, e.g. to finish a drawing),
`onLongPress(e, ctx)` (long-press on touch / pen, right-click with a mouse; return true when handled) and
`capturing(ctx)` (true while the overlay owns plan input: devices, closets and run points can't be dragged then). See
`src/components/measure/registerOverlay.ts` (saved measurements, docs/saved-measurements.md).

### Drags: drawing and moving things

An overlay can take over one-pointer drags (draw a markup, move a task pin) instead of the plan panning:

```ts
onDragStart: (e, ctx) => {           // the press moved past the tap slop; e is where it began
  if (!drawing) return false;        // false: the plan pans (or a device moves) as usual
  start(e.rel);
  return true;                       // this drag is ours until it ends
},
onDragMove: (e, ctx) => extend(e.rel),
onDragEnd: (e, ctx, cancelled) => (cancelled ? discard() : save()),
capturing: () => drawing,            // also: a pause before moving doesn't become a long-press
```

- Overlays are asked top-down (highest `order` first), before the editor's device / closet / run-point drag; the first
  that returns true owns the drag. Taps never reach `onDragStart` (they stay taps).
- Same event shape as `onTap` (`rel`, `sheetPx`, `screen`, `pointerType`, `shiftKey`, `hit`); moves report the current
  point.
- A second finger cancels the drag (`onDragEnd(…, cancelled = true)`) and pinch-zooms, so pinching still works while
  drawing; so does pointer cancel. Space + drag and middle-button drag always pan.
- With `capturing` true and an `onDragStart`, a still press doesn't turn into a long-press (stay ready to draw).
- Respect `ctx.editing`: e.g. task pins move only in Edit mode; in View a drag on a pin pans.

The gesture side is `claimDrag` / `claimedDragMove` / `claimedDragEnd` / `holdLongPress` / `onContextMenu` in
`PlanGestures` (tests: `tests/planGestures.test.ts`). Examples: `src/components/markups/markupInput.ts`,
`src/components/tasks/taskInput.ts`.

### Hit testing your own things

Overlay Konva layers don't listen, so hit-test in `onTap` / `onDragStart` yourself, in screen px for a finger-sized
reach: `ctx.viewport.relToScreen(pos)` vs `e.screen` (task pins use ~22 px on touch), or divide a screen tolerance by
`ctx.viewport.transform.scale` to compare in sheet px.

### Controls: the plan rails and the status slot

Overlay controls never position themselves over the plan; they go in one of three shared places
(`src/components/editor/overlays/PlanRail.tsx`), so nothing overlaps at any width:

| Place | Where | Who (order) |
| --- | --- | --- |
| Right rail — `<RailSlot order={n}>` | top right, under View / Edit, one button wide | tasks 10, markups 20, revisions 30 |
| Left rail — `<RailSlot side="left" order={n}>` | top left, under the sheet pill; at most `calc(100% - 4rem)` wide on phones | Back to sheet 10, Measure 20, Progress 30, Link tool 40 |
| Status slot — `<StatusSlot order={n}>` | bottom centre, above the bottom controls (above the toolbar row on phones) | editor hint / drawing bar 10, measure bars 20, link tool bar 30, progress snackbar 40 / photo prompt 41, phone bottom sheets 80–90 |

- Slots sort by `order` (CSS order, so mount order doesn't matter). `shrink` lets a tall right-rail column shrink and
  scroll. Hosts and slots are `pointer-events: none` with `data-plan-ui`; give your controls `pointer-events-auto`.
- Right rail: one button per feature; open panels toward the plan (`right-full`). Cards that belong to the plan (the
  selected measurement, measurement totals) sit beside it on sm+ (`right-16`).
- Phones (plan view < 640 px): open strips and options become **bottom sheets** — put the sheet in a `StatusSlot` with
  `data-plan-sheet` on its outer element; the slot then docks to the bottom edge and keeps its bars above the sheet
  (Measure strip, Progress options, the selected measurement, the totals).
- The numbers (gutters, rail tops, the left rail's reserve, how high the bottom controls reach) are `PLAN_CHROME` in
  `src/lib/planOverlays.ts`; the rails' CSS comes from `railStyle()`, and `tests/planLayout.test.ts` checks on the same
  numbers that Back / Measure / Progress don't intersect each other, the right rail, the top bar or the bottom controls
  at 390, 768 and 1280 px. PlanEditor tells the rails when the toolbar has its own bottom row (`setPlanToolbarRow`).
- Full-screen sheets and fixed cards go to `document.body` with a portal.

### One tool owns plan taps

Measure, Markups, Walk, the Link tool, dropping a task and the editor's own tools (place, wire, LED, calibrate…) each
take over taps on the plan; only one is on at a time. A feature registers how it stops with
`registerPlanInput(id, release)` (all of them: `src/components/editor/overlays/planInputs.ts`) and calls
`claimPlanInput(id)` when it starts (`useMeasureUi.setActive(true)`, `useMarkups.setOpen(true)` / `setTool`, the Walk
button, the Link tool button, `TaskToolbar` drops, `useEditor.setTool` with anything but Select). Claiming releases every
other owner; Walk therefore also puts the editor back on Select. Releases only close their own feature.
`resetPlanUi()` releases everything and clears half-finished state (a measurement being drawn, selections, the device
sheet, a pending proof photo) when the plan closes or the job changes — not on the first mount, so "Place on plan" from
the Tasks tab still arrives armed. Tested in `tests/planOverlays.test.ts`.

### Show on plan

Layers & filters starts with "Show on plan" switches for what features draw: Measurements, Links (and links found
automatically), Markups, Task pins and Progress colours. Features don't add their own eye buttons over the plan.

### Selection and draft colours

`src/lib/canvasColors.ts`: anything selected on the plan (devices, runs, closets, markups, measurements) gets a dark ink
outline (`SELECT_INK` #0F2340) inside a light-blue halo (`SELECT_HALO` #33A9FF); points and lines still being drawn are
`DRAFT` #33A9FF, dashed. Handles are white with an ink ring. Device letters and trade colours don't change.

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
- Keys: `+`/`−`, `0` fit sheet, `W` fit width, `1` 100%, arrows pan (shift = more), `[`/`]` sheets, `E` view/edit,
  `F` fit, `L` labels, `M` Measure (the saved-measurements tool; there is no second, throwaway measure), `V`/Esc
  select, `Shift T` drop a task, `?` the shortcut sheet. ⌘+/⌘−/⌘0 zoom the plan only while focus is in the editor
  (pressing the plan focuses it); elsewhere they zoom the page as usual. Zoom limits: half of fit to 4 screen px per
  image px. Animations are instant with `prefers-reduced-motion`.
- Keyboard safety (`planKeyBlocked`, `repeatBlocked` in `src/lib/planOverlays.ts`, used by the editor, Measure,
  Markups and the Link tool): no plan shortcut acts while a modal (`aria-modal="true"`) is open, or when the key
  happens in a text field or inside a dialog; Space / Enter on a focused button are the button's; holding E or Delete
  doesn't repeat. Markups' tool letters ignore Shift (Shift T is the task drop). The `?` sheet has a switch to turn
  single-key shortcuts off on this device (⌘ / Ctrl keys, Esc, arrows and Delete still work).

## View only vs edit

Technicians open the plan in **View**, everyone else in their last mode (Edit by default). View hides the device menu
and editing tools, blocks dragging and deleting, and allows measuring. Edit frames the plan in orange.

Setting a sheet's scale is for the office: technicians don't get the Scale button, and Measure on a sheet without a
scale tells them "Ask the office to set this sheet's scale". When the office starts it from Measure in View, a short
confirmation explains it switches to Edit; once the scale is set (or the tool is closed) the plan goes back to View with
Measure open. Saved measurements change or delete only in Edit or with Measure open, and like markups a technician
changes only their own (`canEditMeasurement` in `src/components/measure/measureUi.ts`).

On phones, Home runs and Counts sit under **More** in the toolbar. The sheet browser has **Manage sheets** (office),
which opens the job's Sheets screen as a drawer over the plan.

## Performance notes

- No React render per frame: the transform goes straight to Konva; React only re-renders when the view settles.
- Devices: one Konva shape, sprites cached per look, only on-screen devices drawn; no hit canvas.
- Sheet: the preview is drawn only where a sharp tile is missing; tiles are picked for the zoom × device pixel ratio
  and requested with a 256 px margin; the stage pixel ratio is capped at 2.
- `window.__pinplanViewer` exposes `{ viewport, gestures, sheetStats, markerStats, editor }` for tests and support.
- End-to-end check and benchmark: `scripts/e2e-plan-viewer.cjs` (see its header).
