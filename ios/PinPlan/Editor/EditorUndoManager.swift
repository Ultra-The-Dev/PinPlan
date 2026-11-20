import Foundation

/// The system's own undo gestures for the plan editor: shake to undo (iPhone), the three-finger swipe and pinch
/// (undo / redo, and the three-finger tap bar), and Undo / Redo in the iPad's ⌘ menu. UIKit asks the first
/// responder's UndoManager whether it can undo and then calls `undo()`; the editor keeps its own history
/// (`EditorModel.undo/redo`, one step per edit), so this manager only forwards to it while the plan is in Edit mode.
/// The plan's scroll view returns it as its `undoManager` and becomes first responder when the plan is touched in
/// Edit mode (PlanZoomView). Nothing is ever registered on it.
final class EditorUndoManager: UndoManager {
    weak var model: EditorModel?

    @MainActor private func editing(_ m: EditorModel) -> Bool { m.viewerMode == .edit && !m.readOnly }

    override var canUndo: Bool {
        MainActor.assumeIsolated { model.map { editing($0) && $0.canUndo } ?? false }
    }

    override var canRedo: Bool {
        MainActor.assumeIsolated { model.map { editing($0) && $0.canRedo } ?? false }
    }

    override func undo() {
        MainActor.assumeIsolated {
            guard let m = model, editing(m) else { return }
            m.undo()
        }
    }

    override func redo() {
        MainActor.assumeIsolated {
            guard let m = model, editing(m) else { return }
            m.redo()
        }
    }
}
