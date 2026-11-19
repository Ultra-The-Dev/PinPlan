import Foundation
import PinPlanCore

/// Field-docs edits (photos, comments, checklists, logs, documents) — undoable, saved and synced like plan edits.
extension EditorModel {
    func saveRows<T: FieldRow>(_ rows: [T], in list: WritableKeyPath<ProjectBundle, [T]>) {
        guard !rows.isEmpty else { return }
        edit { b in for r in rows { b.save(r, in: list) } }
    }
    func saveRow<T: FieldRow>(_ row: T, in list: WritableKeyPath<ProjectBundle, [T]>) { saveRows([row], in: list) }

    func updateRows<T: FieldRow>(_ ids: Set<String>, in list: WritableKeyPath<ProjectBundle, [T]>, _ change: @escaping (inout T) -> Void) {
        guard !ids.isEmpty else { return }
        edit { $0.update(ids, in: list, change) }
    }

    func removeRows<T: FieldRow>(_ ids: Set<String>, in list: WritableKeyPath<ProjectBundle, [T]>) {
        guard !ids.isEmpty else { return }
        edit { $0.remove(ids, in: list) }
        say("Deleted — tap Undo to bring it back")
    }

    func photo(_ id: String) -> Photo? { bundle.photos.first { $0.id == id && $0.deleted != true } }

    /// "C3 Indoor camera" for a photo linked to a device.
    func deviceName(_ markerId: String?) -> String? {
        guard let m = bundle.markers.first(where: { $0.id == markerId && $0.deleted != true }) else { return nil }
        return [m.label, app.type(m.deviceTypeId)?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}
