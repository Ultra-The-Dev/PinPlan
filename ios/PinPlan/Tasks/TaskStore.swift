import SwiftUI
import PinPlanCore

// Tasks pinned on the plan (Tasks/TaskPinsOverlay.swift): shared UI state (drop mode, selection, filters) and the edits, kept out of EditorModel.
// Pure rules live in PinPlanCore (Tasks.swift), shared with the web app.

/// A spot picked on the plan for a new task (sheetId nil = general task).
struct TaskDraft: Identifiable {
    let id = UUID()
    var sheetId: String?
    var x: Double?
    var y: Double?
    var room: String?
}

/// Opens a task's detail sheet.
struct TaskRef: Identifiable, Hashable { let id: String }

/// A pin being dragged on the plan (Edit mode): its live, sheet-relative spot.
struct TaskPinDrag: Equatable {
    let id: String
    var x: Double
    var y: Double
}

@MainActor
@Observable
final class TaskOverlayState {
    static let shared = TaskOverlayState()

    /// Waiting for a tap on the plan: a new task, a copy to place, or a task to (re)place.
    enum Drop: Equatable {
        case new
        case duplicate(PlanTask)
        case move(String)
    }

    var drop: Drop?
    var selectedId: String?
    var detail: TaskRef?
    var quick: TaskDraft?
    /// Which pins show on the plan (the Field › Tasks list has its own).
    var filter = TaskFilter()
    var showPins = true
    var greyOthers = false
    var dragging: TaskPinDrag?
}

enum TaskDates {
    static func today() -> String { FieldDocs.localDay(isoNow()) }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static func date(_ day: String?) -> Date? { day.flatMap { formatter.date(from: $0) } }
    static func day(_ date: Date) -> String { formatter.string(from: date) }
    /// "Nov 20".
    static func short(_ day: String) -> String {
        guard let d = date(day) else { return day }
        return d.formatted(.dateTime.month(.abbreviated).day())
    }
}

extension EditorModel {
    /// The name on my edits, comments and photos.
    var taskAuthor: String { FieldAuthor.name(app) }
    var taskRole: TeamRole? { app.cloud.role }

    func planTask(_ id: String) -> PlanTask? { bundle.tasks.first { $0.id == id && $0.deleted != true } }

    /// People to assign: me first, then the team and names seen on the job.
    var taskPeople: [String] {
        let me = taskAuthor
        var names = FieldAuthor.teamNames(app)
        for t in bundle.liveTasks {
            if let a = t.assignee, !a.isEmpty, !names.contains(where: { $0.caseInsensitiveCompare(a) == .orderedSame }) { names.append(a) }
        }
        let others = names.filter { $0.caseInsensitiveCompare(me) != .orderedSame }.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
        return [me] + others
    }

    /// Categories: the company's trades and their categories, then ones used on this job.
    var taskCategories: [String] {
        let trades = app.trades
        let names = trades.map { Trades.pack($0).short } + Trades.categories(for: trades).map(\.name)
        return TaskLogic.categoryOptions(names, tasks: bundle.tasks)
    }

    /// Change a task, logging what changed (status, assignee, checklist, photos, position…) in its history.
    func changeTask(_ id: String, _ change: (inout PlanTask) -> Void) {
        guard let t = bundle.tasks.first(where: { $0.id == id }) else { return }
        let next = TaskLogic.applyTaskChange(t, by: taskAuthor, at: isoNow(), change)
        guard next != t else { return }
        saveRow(next, in: \.tasks)
    }

    /// The same change on several tasks, as one undo step.
    func changeTasks(_ ids: Set<String>, _ change: (inout PlanTask) -> Void) {
        let now = isoNow(), by = taskAuthor
        let rows = bundle.tasks.filter { ids.contains($0.id) && $0.deleted != true }
        var changed: [PlanTask] = []
        for t in rows {
            let next = TaskLogic.applyTaskChange(t, by: by, at: now, change)
            if next != t { changed.append(next) }
        }
        saveRows(changed, in: \.tasks)
    }

    func commentOnTask(_ id: String, _ text: String) {
        guard let t = bundle.tasks.first(where: { $0.id == id }) else { return }
        let next = TaskLogic.addComment(t, text, by: taskAuthor, at: isoNow())
        if next != t { saveRow(next, in: \.tasks) }
    }

    /// Save a new task (numbered after the job's highest).
    @discardableResult
    func createTask(title: String, draft: TaskDraft, status: TaskStatus, priority: Int?, category: String?, assignee: String?, tags: [String], photoIds: [String]) -> PlanTask {
        let now = isoNow()
        var t = TaskLogic.newTask(projectId: bundle.project.id, number: TaskLogic.nextTaskNumber(bundle.tasks), title: title, by: taskAuthor, at: now)
        t.status = status
        t.priority = priority
        t.category = category
        t.assignee = assignee
        t.tags = tags
        t.sheetId = draft.sheetId
        t.x = draft.x
        t.y = draft.y
        t.room = draft.room
        t.photoIds = photoIds
        t.checklist = []
        if status == .done || status == .verified { t.closedAt = now }
        if status == .verified { t.verifiedBy = taskAuthor; t.verifiedAt = now }
        saveRow(t, in: \.tasks)
        say(String(localized: "Task #\(t.number) added"))
        return t
    }

    /// A copy of a task (same sheet, no spot) to place on the plan.
    @discardableResult
    func duplicateTask(_ src: PlanTask, sheetId: String?, x: Double?, y: Double?, room: String?) -> PlanTask {
        let now = isoNow()
        var copy = TaskLogic.duplicateTask(src, at: now, id: newId(), number: TaskLogic.nextTaskNumber(bundle.tasks), by: taskAuthor)
        copy.sheetId = sheetId
        copy.x = x
        copy.y = y
        copy.room = room ?? src.room
        copy.activity = [TaskEvent(at: now, by: taskAuthor, kind: .created, text: "copied from #\(src.number)")]
        saveRow(copy, in: \.tasks)
        say(String(localized: "Task #\(copy.number) added"))
        return copy
    }

    /// Room for a spot: the nearest device's room, else the room name printed on the plan there.
    func taskRoom(sheetId: String, x: Double, y: Double) -> String? {
        TaskLogic.nearestRoom(bundle.liveMarkers, sheetId: sheetId, x: x, y: y)
            ?? PlanReader.room(atX: x, y: y, details: planDetails[sheetId] ?? [])
    }
}

/// Colour helpers for task UI (always Color on both sides of a choice).
enum TaskColors {
    static func status(_ s: TaskStatus) -> Color { Color(hex: TaskLogic.info(s).color) }
    static func pin(_ t: PlanTask, grey: Bool) -> Color { grey ? Color(hex: TaskLogic.pinGrey) : Color(hex: TaskLogic.pinColor(t)) }
    static func priority(_ p: Int?) -> Color { Color(hex: TaskLogic.priorityInfo(p)?.color ?? "#64748b") }
}
