import Foundation
import PinPlanCore

/// Plan (sheet) actions shared by the plan's sheet pill, the sheet browser and the plans screen: rename, move and
/// delete. Each is one undo step (`EditorModel.edit`). Deleting keeps the soft delete the app has always used: the
/// sheet gets `deleted = true` and syncs; its devices stay stored but leave the takeoff with it, and Undo brings it back.
@MainActor
enum SheetActions {
    static func rename(_ model: EditorModel, _ id: String, to name: String) {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        guard !n.isEmpty else { return }
        model.edit { b in if let i = b.sheets.firstIndex(where: { $0.id == id }) { b.sheets[i].name = n } }
    }

    static func move(_ model: EditorModel, _ id: String, by d: Int) {
        let list = model.sheets
        guard let i = list.firstIndex(where: { $0.id == id }), list.indices.contains(i + d) else { return }
        let other = list[i + d]
        model.edit { b in
            if let a = b.sheets.firstIndex(where: { $0.id == id }), let c = b.sheets.firstIndex(where: { $0.id == other.id }) {
                let tmp = b.sheets[a].order
                b.sheets[a].order = b.sheets[c].order
                b.sheets[c].order = tmp
            }
        }
    }

    /// Delete plans as one undo step; the plan view moves to a neighbouring plan.
    static func delete(_ model: EditorModel, ids: Set<String>) {
        guard !ids.isEmpty else { return }
        let list = model.sheets
        let activeGone = model.activeSheetId.map(ids.contains) ?? false
        let next = activeGone ? list.firstIndex { $0.id == model.activeSheetId }.flatMap { i in
            (list[(i + 1)...].first { !ids.contains($0.id) }) ?? list[..<i].last { !ids.contains($0.id) }
        } : nil
        let changed = model.edit { b in
            for i in b.sheets.indices where ids.contains(b.sheets[i].id) { b.sheets[i].deleted = true }
        }
        guard changed else { return }
        if let next { model.setActiveSheet(next.id) }
        model.say(ids.count == 1 ? String(localized: "Plan deleted — Undo brings it back") : String(localized: "\(ids.count) plans deleted — Undo brings them back"))
    }
}
