import SwiftUI
import UIKit
import PinPlanCore

/// The live transform of the plan on screen, and commands to move it. One per editor; the canvas of whichever
/// sheet is showing drives it. Overlays read `viewport` (it changes every frame while panning or zooming, so read
/// it only in small views that need it).
@MainActor
@Observable
final class PlanViewportController {
    /// Current transform (sheet ↔ view). `isReady` is false until the canvas has a size.
    private(set) var viewport: PlanViewport = .zero
    /// Zoom range for the sheet on screen (points per sheet pixel).
    private(set) var limits: ClosedRange<Double> = 0.05...4
    /// A finger (or trackpad) is moving the plan, or it is still gliding.
    private(set) var isInteracting = false
    /// Sheet the viewport belongs to (set with the first published viewport of a newly shown sheet).
    private(set) var sheetId: String?
    /// Last `FocusRequest.n` applied, so coming back to a sheet doesn't replay an old "find device".
    var appliedFocus = 0

    @ObservationIgnored weak var scrollView: PlanScrollView?

    init() {}

    // MARK: fed by the scroll view

    func attach(_ sv: PlanScrollView) {
        scrollView = sv
    }

    func publish(_ v: PlanViewport, limits l: ClosedRange<Double>, sheetId id: String) {
        if id != sheetId { sheetId = id }
        if v != viewport { viewport = v }
        if l != limits { limits = l }
    }

    /// The viewport if it belongs to `sheetId` (not ready otherwise, e.g. for a frame while sheets switch).
    func sheetViewport(for sheetId: String) -> PlanViewport { self.sheetId == sheetId ? viewport : .zero }

    func setInteracting(_ on: Bool) { if on != isInteracting { isInteracting = on } }

    // MARK: commands

    var isAtFit: Bool { viewport.zoom <= limits.lowerBound * 1.02 }
    var isAtMax: Bool { viewport.zoom >= limits.upperBound * 0.98 }
    /// Zoom relative to the whole-sheet fit (1 = whole sheet).
    var zoomOverFit: Double { limits.lowerBound > 0 ? viewport.zoom / limits.lowerBound : 1 }

    /// Whole sheet.
    func fit(animated: Bool = true) {
        guard let sv = scrollView else { return }
        sv.setZoomScale(sv.minimumZoomScale, animated: animated)
    }

    /// Centre a sheet-relative point, at `zoom` (points per sheet pixel) or the current zoom.
    func center(on rel: PlanPoint, zoom: Double? = nil, animated: Bool = true) {
        guard let sv = scrollView, viewport.isReady else { return }
        let z = min(limits.upperBound, max(limits.lowerBound, zoom ?? viewport.zoom))
        sv.zoom(to: viewport.contentRect(centeredOn: rel, zoom: z).cg, animated: animated)
    }

    /// Show a sheet-relative rect as large as fits.
    func show(_ rect: PlanRect, animated: Bool = true) {
        guard viewport.isReady else { return }
        let v = viewport.showing(rect, limits: limits)
        center(on: rect.center, zoom: v.zoom, animated: animated)
    }

    /// Zoom in or out around the middle of the view (buttons, keyboard).
    func zoom(by factor: Double, animated: Bool = true) {
        guard viewport.isReady else { return }
        let mid = viewport.toSheet(PlanPoint(x: viewport.viewSize.width / 2, y: viewport.viewSize.height / 2))
        center(on: mid, zoom: viewport.zoom * factor, animated: animated)
    }

    /// Move (without zooming) so `rel` is in the middle; used while dragging the minimap.
    func pan(toCenter rel: PlanPoint) {
        guard let sv = scrollView, viewport.isReady else { return }
        let z = CGFloat(viewport.zoom)
        let want = CGPoint(x: CGFloat(rel.x * viewport.sheetSize.width) * z - sv.bounds.width / 2,
                           y: CGFloat(rel.y * viewport.sheetSize.height) * z - sv.bounds.height / 2)
        sv.setContentOffset(sv.clampedOffset(want), animated: false)
    }

    /// Bring back a remembered view of this sheet.
    func restore(_ state: PlanViewState, animated: Bool = false) {
        guard viewport.isReady, !state.isFit else { return }
        let v = state.apply(to: viewport, limits: limits)
        center(on: PlanPoint(x: state.centerX, y: state.centerY), zoom: v.zoom, animated: animated)
    }
}
