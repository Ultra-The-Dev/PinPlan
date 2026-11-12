import SwiftUI
import Observation
import PinPlanCore

enum Tool: Equatable {
    case select
    case place(String)          // device type id
    case led(String)            // LED device type id
    case stair
    case wire
    case closet(ClosetKind)
    case calibrate
    case measure

    var isDrawing: Bool {
        switch self {
        case .led, .stair, .wire, .calibrate, .measure: return true
        default: return false
        }
    }
}

enum Selection: Equatable, Hashable {
    case marker(String), run(String), closet(String)
}

/// Pending dialog after a drawing tool finishes.
enum PendingInput: Identifiable, Equatable {
    case calibrate([Double])
    case led([Double], typeId: String)
    case stair([Double])
    var id: String {
        switch self {
        case .calibrate: return "calibrate"
        case .led: return "led"
        case .stair: return "stair"
        }
    }
}

struct FocusRequest: Equatable {
    var sheetId: String
    var x: Double
    var y: Double
    var n: Int
}

/// State of one open project: the bundle, undo/redo, tools and selection.
@MainActor
@Observable
final class EditorModel {
    private(set) var bundle: ProjectBundle
    let app: AppModel

    var activeSheetId: String?
    private(set) var tool: Tool = .select
    var selection: Selection?
    var hiddenLayers: Set<Layer> = []
    var room = ""
    var showLabels = false
    /// Points of the run being drawn (relative coords).
    var draft: [Double] = []
    var draftMarkerId: String?
    var pending: PendingInput?
    /// Request to centre the plan on a point; n increments per request.
    var focus: FocusRequest?
    var fitRequest = 0
    /// A point to call out on the plan (pulsing ring), e.g. a dimension tapped in the plan reader.
    var highlight: FocusRequest?
    /// Pre-filled real length for the next scale calibration (from a printed dimension).
    var calibrationHint: String?
    /// Plan reader results, per sheet.
    var planDetails: [String: [PlanDetail]] = [:]
    var planExplanations: [String: APIClient.Explanation] = [:]
    var planQA: [String: [QAItem]] = [:]

    struct QAItem: Identifiable {
        let id = UUID()
        let question: String
        var answer: APIClient.Answer?
        var error: String?
    }
    /// Most recently used device types (for the quick dock), most recent first.
    var recentTypes: [String] = ["cam-indoor", "wap", "speaker", "tv"]
    var toast: String?

    private var past: [ProjectBundle] = []
    private var future: [ProjectBundle] = []

    init(bundle: ProjectBundle, app: AppModel) {
        self.bundle = bundle
        self.app = app
        activeSheetId = bundle.liveSheets.first?.id
    }

    /// Switch tools (discarding any half-drawn run).
    func use(_ t: Tool) {
        if case .place(let id) = t { recentTypes.removeAll { $0 == id }; recentTypes.insert(id, at: 0); recentTypes = Array(recentTypes.prefix(8)) }
        guard t != tool else { return }
        tool = t
        draft = []
        draftMarkerId = nil
        if t != .select { selection = nil }
    }

    func setActiveSheet(_ id: String) {
        activeSheetId = id
        selection = nil
        draft = []
    }

    var canUndo: Bool { !past.isEmpty }
    var canRedo: Bool { !future.isEmpty }
    var pricing: PricingSettings { app.pricing.applying(bundle.project.pricing) }
    var sheets: [Sheet] { bundle.liveSheets }
    var activeSheet: Sheet? { sheets.first { $0.id == activeSheetId } ?? sheets.first }
    var takeoff: Takeoff { TakeoffCalculator.compute(bundle) }

    /// Apply a change as one undoable step, then save.
    func edit(_ change: (inout ProjectBundle) -> Void) {
        // Mutate a copy so the closure may freely read the model (e.g. `pricing`) without overlapping access to `bundle`.
        let before = bundle
        var next = bundle
        change(&next)
        guard next != before else { return }
        bundle = next
        past.append(before)
        if past.count > 100 { past.removeFirst() }
        future.removeAll()
        persist()
    }

    /// Apply a change without an undo step (e.g. estimate edits, status).
    func editSilently(_ change: (inout ProjectBundle) -> Void) {
        var next = bundle
        change(&next)
        bundle = next
        persist()
    }

    func undo() {
        guard let prev = past.popLast() else { return }
        future.append(bundle)
        bundle = prev
        selection = nil
        persist()
    }

    func redo() {
        guard let next = future.popLast() else { return }
        past.append(bundle)
        bundle = next
        persist()
    }

    private func persist() {
        app.store.save(bundle)
        app.didSave(bundle)
        if activeSheetId == nil || !sheets.contains(where: { $0.id == activeSheetId }) { activeSheetId = sheets.first?.id }
    }

    func say(_ text: String) {
        toast = text
        let current = text
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.5))
            if self.toast == current { self.toast = nil }
        }
    }

    // MARK: visibility

    func isVisible(_ m: Marker) -> Bool {
        guard let t = app.type(m.deviceTypeId) else { return true }
        return !hiddenLayers.contains(Layer(rawValue: t.category.rawValue) ?? .security)
    }
    func isVisible(_ r: Run) -> Bool { !hiddenLayers.contains(r.kind == .wire ? .wiring : .lighting) }
    var closetsVisible: Bool { !hiddenLayers.contains(.infrastructure) }

    // MARK: taps on the plan

    func tap(x: Double, y: Double, hitMarker: String?, hitCloset: String?) {
        guard let sheet = activeSheet, (0...1).contains(x), (0...1).contains(y) else { return }
        switch tool {
        case .select:
            selection = nil
        case .place(let typeId):
            guard let t = app.type(typeId) else { return }
            edit { $0.addMarker(type: t, sheetId: sheet.id, x: x, y: y, room: room) }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .closet(let kind):
            var newId = ""
            edit { newId = $0.addCloset(kind: kind, sheetId: sheet.id, x: x, y: y).id }
            use(.select)
            selection = .closet(newId)
        case .led:
            draft += [x, y]
        case .wire:
            if draft.isEmpty, let mid = hitMarker, let m = bundle.liveMarkers.first(where: { $0.id == mid }) {
                draft = [m.x, m.y]; draftMarkerId = m.id
            } else if !draft.isEmpty, let cid = hitCloset, let c = bundle.liveClosets.first(where: { $0.id == cid }) {
                draft += [c.x, c.y]
                finishWire(closetId: c.id)
            } else {
                draft += [x, y]
            }
        case .stair, .calibrate:
            draft += [x, y]
            if draft.count >= 4 {
                pending = (tool == .stair) ? .stair(draft) : .calibrate(draft)
                draft = []
            }
        case .measure:
            draft = draft.count >= 4 ? [x, y] : draft + [x, y]
            if draft.count == 4 {
                if let ft = Geometry.polylineFt(draft, sheet: sheet) { say("Distance \(Geometry.formatFeetInches(ft)) (\(ft.clean) ft)") }
                else { say("Set the sheet scale to measure") }
            }
        }
    }

    /// Finish button / double tap for LED and wire runs.
    func finishDraft() {
        guard draft.count >= 4 else { say("Tap at least two points"); return }
        switch tool {
        case .led(let typeId): pending = .led(draft, typeId: typeId); draft = []
        case .wire: finishWire(closetId: nil)
        default: break
        }
    }

    private func finishWire(closetId: String?) {
        guard let sheet = activeSheet else { return }
        let marker = bundle.liveMarkers.first { $0.id == draftMarkerId }
        let pts = draft
        edit { b in
            let r = b.addRun(Run(projectId: b.project.id, sheetId: sheet.id, kind: .wire, points: pts, wireType: marker?.wireType ?? "Cat6",
                                 markerId: marker?.id, closetId: closetId, tentative: marker?.tentative))
            if let m = marker, let closetId, m.closetId != closetId {
                b.updateMarker(m.id, pricing: pricing) { $0.closetId = closetId }
            }
            _ = r
        }
        draft = []
        draftMarkerId = nil
        say("Wire run added")
    }

    // MARK: actions

    func focusOn(_ s: Selection) {
        var target: (String, Double, Double)?
        switch s {
        case .marker(let id): if let m = bundle.liveMarkers.first(where: { $0.id == id }) { target = (m.sheetId, m.x, m.y) }
        case .closet(let id): if let c = bundle.liveClosets.first(where: { $0.id == id }) { target = (c.sheetId, c.x, c.y) }
        case .run(let id): if let r = bundle.liveRuns.first(where: { $0.id == id }), r.points.count >= 2 { target = (r.sheetId, r.points[0], r.points[1]) }
        }
        guard let target else { return }
        use(.select)
        activeSheetId = target.0
        selection = s
        focus = FocusRequest(sheetId: target.0, x: target.1, y: target.2, n: (focus?.n ?? 0) + 1)
    }

    /// Jump to a point on a sheet and pulse a ring there.
    func focusOnPoint(sheetId: String, x: Double, y: Double) {
        use(.select)
        selection = nil
        activeSheetId = sheetId
        let n = (focus?.n ?? 0) + 1
        focus = FocusRequest(sheetId: sheetId, x: x, y: y, n: n)
        highlight = FocusRequest(sheetId: sheetId, x: x, y: y, n: n)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(4))
            if self.highlight?.n == n { self.highlight = nil }
        }
    }

    /// Start a scale line with the real length taken from a printed dimension.
    func calibrate(from dimension: String) {
        calibrationHint = dimension
        use(.calibrate)
        say("Draw a line over the \(dimension) dimension")
    }

    func deleteSelection() {
        guard let s = selection else { return }
        edit { b in
            switch s {
            case .marker(let id): b.deleteMarker(id)
            case .run(let id): b.deleteRun(id)
            case .closet(let id): b.deleteCloset(id)
            }
        }
        selection = nil
    }

    func autoHomeRuns(sheetOnly: Bool) {
        var n = 0
        let cat = app.catalog
        let sid = sheetOnly ? activeSheet?.id : nil
        edit { n = $0.autoHomeRuns(catalog: cat, pricing: pricing, sheetId: sid) }
        say(n > 0 ? "Drew \(n) home runs" : (bundle.liveClosets.isEmpty ? "Place an equipment closet first" : "No wired devices here"))
    }

    func nextZone(on sheetId: String) -> String {
        let zs = bundle.liveRuns.filter { $0.sheetId == sheetId && $0.kind != .wire }.compactMap { Int($0.zone ?? "") }
        return String((zs.max() ?? 0) + 1)
    }
}
