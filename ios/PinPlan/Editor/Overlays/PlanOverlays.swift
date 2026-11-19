import SwiftUI
import PinPlanCore

// Plan overlays: features that draw on the plan (tasks, …) register a provider here instead of editing
// PlanCanvasView. Same contract as the web app's src/components/editor/overlays/registry.ts.

/// What an overlay layer is drawn in: the sheet, the plan image's size on screen (draw at x * width, y * height)
/// and the current zoom (constant-size pins ignore it).
struct PlanOverlayContext {
    let sheet: Sheet
    let imageSize: CGSize
    let zoom: CGFloat
}

protocol PlanOverlayProvider {
    var id: String { get }
    /// Drawn above the devices, in the same pan / zoom as the plan.
    @MainActor func layer(_ ctx: PlanOverlayContext, model: EditorModel) -> AnyView
    /// Buttons shown in the editor's floating overlay strip.
    @MainActor func toolbar(model: EditorModel) -> AnyView?
    /// A tap on the sheet at a relative (0–1) point; return true when the overlay used it.
    @MainActor func handleTap(relative: CGPoint, model: EditorModel) -> Bool
}

enum PlanOverlayRegistry {
    @MainActor static var providers: [PlanOverlayProvider] = []

    /// Add a provider once (by id); called from PinPlanApp at launch.
    @MainActor static func register(_ p: PlanOverlayProvider) {
        providers.removeAll { $0.id == p.id }
        providers.append(p)
    }
}
