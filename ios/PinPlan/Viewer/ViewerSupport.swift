import SwiftUI
import UIKit
import PinPlanCore

// Bridges between PinPlanCore's plan geometry (Double) and CoreGraphics (CGFloat), haptics and remembered viewer
// settings. Kept apart from the views so plan overlays can use them too.

extension PlanPoint {
    init(_ p: CGPoint) { self.init(x: Double(p.x), y: Double(p.y)) }
    var cg: CGPoint { CGPoint(x: CGFloat(x), y: CGFloat(y)) }
}

extension PlanSize {
    init(_ s: CGSize) { self.init(width: Double(s.width), height: Double(s.height)) }
    var cg: CGSize { CGSize(width: CGFloat(width), height: CGFloat(height)) }
}

extension PlanRect {
    init(_ r: CGRect) { self.init(x: Double(r.minX), y: Double(r.minY), width: Double(r.width), height: Double(r.height)) }
    var cg: CGRect { CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width), height: CGFloat(height)) }
}

extension PlanViewport {
    /// View point of a sheet-relative position.
    func point(_ x: Double, _ y: Double) -> CGPoint { toView(x: x, y: y).cg }
    /// Sheet-relative position (clamped to the sheet) under a view point.
    func relative(_ p: CGPoint) -> CGPoint { toSheetClamped(PlanPoint(p)).cg }
}

extension Sheet {
    var planSize: PlanSize { PlanSize(width: width, height: height) }
}

/// The few haptics the viewer uses, so they feel the same everywhere.
@MainActor
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let selection = UISelectionFeedbackGenerator()

    /// A device placed, an item dropped after a drag.
    static func tap() { light.impactOccurred() }
    /// Something deleted from the plan (a firmer knock than placing, so the two never feel alike).
    static func remove() { rigid.impactOccurred(intensity: 0.8) }
    /// A step undone or redone.
    static func undo() { soft.impactOccurred() }
    /// An item picked up for dragging.
    static func lift() { medium.impactOccurred() }
    /// Sheet changed, mode switched, something selected.
    static func select() { selection.selectionChanged() }
    /// Zoom reached its limit.
    static func limit() { soft.impactOccurred(intensity: 0.6) }
}

/// Viewer settings kept on this device (UserDefaults): the view of each sheet, recently viewed sheets, layer
/// filters per job and the View/Edit choice.
enum ViewerPrefs {
    private static var d: UserDefaults { UserDefaults.standard }

    static func viewState(sheetId: String) -> PlanViewState? {
        guard let data = d.data(forKey: "viewer.view.\(sheetId)") else { return nil }
        return try? JSONDecoder().decode(PlanViewState.self, from: data)
    }

    static func saveViewState(_ s: PlanViewState, sheetId: String) {
        if let data = try? JSONEncoder().encode(s) { d.set(data, forKey: "viewer.view.\(sheetId)") }
    }

    static func recentSheets(projectId: String) -> [String] { d.stringArray(forKey: "viewer.recent.\(projectId)") ?? [] }
    static func saveRecentSheets(_ ids: [String], projectId: String) { d.set(ids, forKey: "viewer.recent.\(projectId)") }

    static func filter(projectId: String) -> PlanFilter? {
        guard let data = d.data(forKey: "viewer.filter.\(projectId)") else { return nil }
        return try? JSONDecoder().decode(PlanFilter.self, from: data)
    }

    static func saveFilter(_ f: PlanFilter, projectId: String) {
        if let data = try? JSONEncoder().encode(f) { d.set(data, forKey: "viewer.filter.\(projectId)") }
    }

    static func mode() -> PlanViewerMode? { d.string(forKey: "viewer.mode").flatMap { PlanViewerMode(rawValue: $0) } }
    static func saveMode(_ m: PlanViewerMode) { d.set(m.rawValue, forKey: "viewer.mode") }

    /// Screenshot / automation flags (`--viewer-zoomed`, `--sheet-browser`, `--layers`, `--minimap`, `--view-mode`).
    /// Debug builds only: a release build ignores launch arguments.
    static func launchFlag(_ name: String) -> Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("--\(name)")
        #else
        return false
        #endif
    }
}

extension View {
    /// Reports this view's height as laid out (on appear and whenever it changes).
    func measureHeight(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        background(GeometryReader { g in
            Color.clear
                .onAppear { onChange(g.size.height) }
                .onChange(of: g.size.height) { _, h in onChange(h) }
        })
    }

    /// Reports this view's width as laid out (on appear and whenever it changes).
    func measureWidth(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        background(GeometryReader { g in
            Color.clear
                .onAppear { onChange(g.size.width) }
                .onChange(of: g.size.width) { _, w in onChange(w) }
        })
    }

    /// Wraps the view in a vertical scroll view capped at `maxHeight` when `on` (floating controls on short screens).
    @ViewBuilder
    func scrollable(if on: Bool, maxHeight: CGFloat) -> some View {
        if on {
            ScrollView(.vertical, showsIndicators: false) { self }
                .frame(maxHeight: maxHeight)
                .defaultScrollAnchor(.bottom)
                .fixedSize(horizontal: true, vertical: false)
        } else {
            self
        }
    }
}
