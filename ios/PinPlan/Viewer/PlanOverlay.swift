import SwiftUI
import PinPlanCore

// Extension point for features that draw ON the plan (task pins, markups, measurements, hyperlinks, revision
// compare…). An overlay is a SwiftUI view built from a `PlanOverlayContext` — the current transform plus the sheet,
// editor and mode — and is redrawn every frame while the plan moves, so it stays glued to the sheet.
// See docs/plan-viewer-ios.md.
//
//     PlanOverlayRegistry.shared.register(PlanOverlay(id: "tasks", zIndex: 20) { ctx in
//         AnyView(TaskPinsLayer(ctx: ctx))
//     } onTap: { tap in
//         guard let pin = hitTaskPin(tap) else { return false }
//         open(pin); return true      // consumed: the plan won't select or place anything
//     })

/// Everything an overlay needs to draw on the plan.
@MainActor
struct PlanOverlayContext {
    /// Sheet ↔ view transform (PinPlanCore, pure math). Changes every frame while panning/zooming.
    let viewport: PlanViewport
    let sheet: Sheet
    let model: EditorModel
    let mode: PlanViewerMode
    /// Commands: centre on a point, show a rect, fit… (e.g. "go to task pin").
    let controller: PlanViewportController

    /// View point of a sheet-relative position.
    func point(_ x: Double, _ y: Double) -> CGPoint { viewport.point(x, y) }
    /// Sheet-relative position (clamped) of a view point.
    func relative(_ p: CGPoint) -> CGPoint { viewport.relative(p) }
    /// Points on screen for a length in feet on this sheet (nil until the sheet has a scale).
    func points(feet: Double) -> CGFloat? { viewport.points(feet: feet, pxPerFt: sheet.pxPerFt).map { CGFloat($0) } }
    /// Whether a sheet-relative point is on screen; cull with it.
    func isOnScreen(_ x: Double, _ y: Double, margin: Double = 40) -> Bool { viewport.isOnScreen(PlanPoint(x: x, y: y), margin: margin) }
}

/// What an overlay's floating controls get. No viewport on purpose: controls don't redraw while the plan moves.
@MainActor
struct PlanControlsContext {
    let sheet: Sheet
    let model: EditorModel
    let mode: PlanViewerMode
    /// Commands: centre on a point, show a rect, fit…
    let controller: PlanViewportController
}

/// A tap on the plan, offered to overlays before the viewer handles it.
struct PlanTap {
    /// View coordinates (points).
    let location: CGPoint
    /// Sheet-relative (not clamped; outside 0…1 is off the sheet).
    let sheetPoint: PlanPoint
    let fromPencil: Bool
    let context: PlanOverlayContext
}

struct PlanOverlay: Identifiable {
    let id: String
    /// Draw order among overlays (higher on top). Overlays draw above devices and runs, below the viewer's
    /// own floating controls.
    var zIndex: Double = 0
    /// Whether the overlay's views receive touches (buttons on pins…). Leave false for pure drawings so the
    /// plan underneath keeps panning and zooming.
    var allowsHitTesting = false
    /// Shown in View mode, Edit mode or both.
    var modes: Set<PlanViewerMode> = [.view, .edit]
    let content: @MainActor (PlanOverlayContext) -> AnyView
    /// Taps on the plan, before selection/placement. Return true to consume it.
    var onTap: (@MainActor (PlanTap) -> Bool)? = nil
    /// Buttons for the feature, shown in the viewer's floating controls column (trailing edge, in `modes`).
    /// Present sheets from here too: this view stays put while the plan moves.
    var controls: (@MainActor (PlanControlsContext) -> AnyView)? = nil

    init(id: String, zIndex: Double = 0, allowsHitTesting: Bool = false, modes: Set<PlanViewerMode> = [.view, .edit],
         content: @escaping @MainActor (PlanOverlayContext) -> AnyView, onTap: (@MainActor (PlanTap) -> Bool)? = nil,
         controls: (@MainActor (PlanControlsContext) -> AnyView)? = nil) {
        self.id = id; self.zIndex = zIndex; self.allowsHitTesting = allowsHitTesting; self.modes = modes
        self.content = content; self.onTap = onTap; self.controls = controls
    }
}

/// App-wide list of plan overlays. Register once (app start, or when a feature turns on); re-registering an id
/// replaces it.
@MainActor
@Observable
final class PlanOverlayRegistry {
    static let shared = PlanOverlayRegistry()
    private(set) var overlays: [PlanOverlay] = []

    func register(_ o: PlanOverlay) {
        overlays.removeAll { $0.id == o.id }
        overlays.append(o)
        overlays.sort { $0.zIndex < $1.zIndex }
    }

    func unregister(id: String) { overlays.removeAll { $0.id == id } }

    /// Offers a tap to overlays, topmost first. True if one consumed it.
    func handleTap(_ tap: PlanTap) -> Bool {
        for o in overlays.reversed() where o.modes.contains(tap.context.mode) {
            if let h = o.onTap, h(tap) { return true }
        }
        return false
    }
}

/// Draws the registered overlays (plus any passed in directly) with the live transform.
struct PlanOverlayHost: View {
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController
    var extra: [PlanOverlay] = []

    var body: some View {
        let v = controller.sheetViewport(for: sheet.id)
        let mode = model.viewerMode
        let all = (PlanOverlayRegistry.shared.overlays + extra).filter { $0.modes.contains(mode) }.sorted { $0.zIndex < $1.zIndex }
        if v.isReady && !all.isEmpty {
            let ctx = PlanOverlayContext(viewport: v, sheet: sheet, model: model, mode: mode, controller: controller)
            ZStack(alignment: .topLeading) {
                ForEach(all) { o in
                    o.content(ctx)
                        .allowsHitTesting(o.allowsHitTesting)
                }
            }
        }
    }
}

/// The overlays' floating controls, one column on the plan's trailing edge (PlanEditorView). Ordered by zIndex,
/// top to bottom.
struct PlanOverlayControlsHost: View {
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController

    var body: some View {
        let mode = model.viewerMode
        let all = PlanOverlayRegistry.shared.overlays.filter { $0.controls != nil && $0.modes.contains(mode) }
        if !all.isEmpty {
            let ctx = PlanControlsContext(sheet: sheet, model: model, mode: mode, controller: controller)
            VStack(alignment: .trailing, spacing: 8) {
                ForEach(all) { o in o.controls?(ctx) }
            }
        }
    }
}
