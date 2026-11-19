import Foundation
import PinPlanCore

/// Plan viewer state on the editor: View/Edit mode, remembered filters, recently viewed and sheet navigation.
extension EditorModel {
    /// Restores this job's layer filters and the View/Edit choice (technicians always open in View).
    func loadViewerPrefs() {
        if let f = ViewerPrefs.filter(projectId: bundle.project.id) { filter = f }
        let role = app.cloud.role
        if role == .tech {
            viewerMode = .view
        } else {
            viewerMode = ViewerPrefs.mode() ?? PlanViewerMode.defaultMode(for: role)
        }
        if ViewerPrefs.launchFlag("view-mode") { viewerMode = .view }
        if let id = activeSheetId { noteSheetViewed(id) }
    }

    func saveFilter() { ViewerPrefs.saveFilter(filter, projectId: bundle.project.id) }

    func setViewerMode(_ m: PlanViewerMode) {
        guard m != viewerMode else { return }
        if m == .view {
            use(.select)
            multiMode = false
            multi = []
        }
        viewerMode = m
        ViewerPrefs.saveMode(m)
    }

    // MARK: sheets

    var orderedSheets: [Sheet] { SheetNav.ordered(sheets) }

    func neighborSheet(_ delta: Int) -> Sheet? { SheetNav.neighbor(of: activeSheet?.id, in: sheets, delta: delta) }

    /// Next (+1) / previous (−1) sheet. False at either end.
    @discardableResult
    func goToSheet(delta: Int) -> Bool {
        guard let s = neighborSheet(delta) else { return false }
        setActiveSheet(s.id)
        return true
    }

    var recentSheetIds: [String] { ViewerPrefs.recentSheets(projectId: bundle.project.id) }

    func noteSheetViewed(_ id: String) {
        let ids = SheetNav.touch(id, recents: recentSheetIds)
        ViewerPrefs.saveRecentSheets(ids, projectId: bundle.project.id)
    }

    // MARK: what's on a sheet

    /// Catalog by id, for per-frame drawing (app.type is a linear search).
    var typesById: [String: DeviceType] {
        Dictionary(app.catalog.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    /// Devices on a sheet that pass the layer filters.
    func visibleMarkers(on sheetId: String, types: [String: DeviceType]) -> [Marker] {
        bundle.liveMarkers.filter { $0.sheetId == sheetId && filter.shows($0, category: types[$0.deviceTypeId]?.category) }
    }

    func visibleClosets(on sheetId: String) -> [Closet] {
        guard filter.showClosets else { return [] }
        return bundle.liveClosets.filter { $0.sheetId == sheetId && isVisible(kind: $0.kind) }
    }

    func visibleRuns(on sheetId: String) -> [Run] {
        bundle.liveRuns.filter { $0.sheetId == sheetId && filter.shows($0) && $0.points.count >= 4 }
    }
}
