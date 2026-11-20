import Foundation

// Tasks pinned on the plan (Fieldwire-style punch / issues) — a port of src/lib/tasks.ts. Same rules and the same
// test fixtures (TaskTests.swift mirrors tests/tasks.test.ts). Tasks never affect counts and never carry prices.

extension PlanTask: FieldRow {}

public enum TaskPlacement: String, Sendable { case pin, sheet, general }

public enum TaskDue: String, CaseIterable, Sendable { case overdue, today, week, none }

public enum TaskSort: String, CaseIterable, Sendable { case number, due, priority, status }

/// What the list / plan shows. Empty arrays and nil mean "any".
public struct TaskFilter: Equatable, Sendable {
    public var status: [TaskStatus] = []
    public var priority: [Int] = []
    /// Category names (case-insensitive).
    public var category: [String] = []
    /// People (case-insensitive); "" means unassigned.
    public var assignee: [String] = []
    /// One sheet; "" = general tasks (no sheet).
    public var sheetId: String?
    public var due: TaskDue?
    public var text: String = ""
    public var tags: [String] = []
    public init() {}
    public var isEmpty: Bool {
        status.isEmpty && priority.isEmpty && category.isEmpty && assignee.isEmpty && sheetId == nil && due == nil
            && text.trimmingCharacters(in: .whitespaces).isEmpty && tags.isEmpty
    }
}

public struct QuickEntry: Equatable, Sendable {
    public var title: String
    public var category: String?
    public var priority: Int?
    public var assignee: String?
    public var tags: [String]
}

public enum TaskLogic {
    public struct StatusInfo: Sendable { public let id: TaskStatus; public let label: String; public let short: String; public let color: String }
    public struct PriorityInfo: Sendable { public let id: Int; public let label: String; public let name: String; public let color: String }

    public static let statuses: [StatusInfo] = [
        StatusInfo(id: .open, label: "Open", short: "Open", color: "#dc2626"),
        StatusInfo(id: .in_progress, label: "In progress", short: "In progress", color: "#B7791F"),
        StatusInfo(id: .ready, label: "Ready for review", short: "Review", color: "#7c3aed"),
        StatusInfo(id: .done, label: "Completed", short: "Completed", color: "#16a34a"),
        StatusInfo(id: .verified, label: "Verified", short: "Verified", color: "#2563eb"),
    ]
    public static let priorities: [PriorityInfo] = [
        PriorityInfo(id: 1, label: "P1", name: "High", color: "#dc2626"),
        PriorityInfo(id: 2, label: "P2", name: "Medium", color: "#d97706"),
        PriorityInfo(id: 3, label: "P3", name: "Low", color: "#64748b"),
    ]
    public static let pinGrey = "#94a3b8"

    public static func info(_ s: TaskStatus) -> StatusInfo { statuses.first { $0.id == s } ?? statuses[0] }
    public static func priorityInfo(_ p: Int?) -> PriorityInfo? { priorities.first { $0.id == p } }
    public static func isClosed(_ s: TaskStatus) -> Bool { s == .done || s == .verified }

    public static func pinColor(_ t: PlanTask) -> String { t.deleted == true ? pinGrey : info(t.status).color }

    public static func placement(_ t: PlanTask) -> TaskPlacement {
        guard let s = t.sheetId, !s.isEmpty else { return .general }
        if let x = t.x, let y = t.y, x.isFinite, y.isFinite { return .pin }
        return .sheet
    }

    /// Highest number in the job (deleted ones included) + 1.
    public static func nextTaskNumber(_ tasks: [PlanTask]) -> Int { (tasks.map(\.number).max() ?? 0) + 1 }

    // MARK: quick entry

    /// "Fix ceiling @Electrical @P1 @Mike #level2" → title, category, priority, assignee, tags. Unknown @words stay in the title.
    public static func parseQuickEntry(_ text: String, categories: [String] = [], people: [String] = []) -> QuickEntry {
        let cats = categories.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let ppl = people.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        var out = QuickEntry(title: "", tags: [])
        var keep: [String] = []
        let trailing = CharacterSet(charactersIn: ".,;:!?")
        for tok in text.split(whereSeparator: { $0.isWhitespace }).map(String.init) {
            if tok.count > 1, tok.hasPrefix("#") {
                let tag = String(tok.dropFirst()).trimmingCharacters(in: trailing)
                if !tag.isEmpty, !out.tags.contains(where: { $0.lowercased() == tag.lowercased() }) { out.tags.append(tag) }
                continue
            }
            if tok.count > 1, tok.hasPrefix("@") {
                let word = String(tok.dropFirst()).trimmingCharacters(in: trailing)
                let w = word.lowercased()
                if w.count == 2, w.hasPrefix("p"), let n = Int(w.dropFirst()), (1...3).contains(n) {
                    if out.priority == nil { out.priority = n }
                    continue
                }
                if let c = matchName(word, cats) {
                    if out.category == nil { out.category = c }
                    continue
                }
                if let p = matchName(word, ppl) {
                    if out.assignee == nil { out.assignee = p }
                    continue
                }
            }
            keep.append(tok)
        }
        out.title = keep.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return out
    }

    static func matchName(_ word: String, _ names: [String]) -> String? {
        let w = word.lowercased()
        guard !w.isEmpty else { return nil }
        func norm(_ s: String) -> String { s.trimmingCharacters(in: .whitespaces).lowercased() }
        if let exact = names.first(where: { norm($0) == w }) { return exact }
        let seps = CharacterSet(charactersIn: " /&-").union(.whitespaces)
        return names.first { n in
            norm(n).replacingOccurrences(of: " ", with: "").hasPrefix(w) || norm(n).components(separatedBy: seps).contains { $0.hasPrefix(w) && !$0.isEmpty }
        }
    }

    // MARK: changes and history

    static func show(_ v: String?) -> String { v ?? "" }

    /// Apply `change` and append one history line per changed attribute; Completed sets closedAt, Verified sets
    /// verifiedBy/At, reopening clears them. Returns the task unchanged when nothing differs.
    public static func applyTaskChange(_ task: PlanTask, by: String, at: String, newId makeId: () -> String = { newId(10) }, _ change: (inout PlanTask) -> Void) -> PlanTask {
        var next = task
        change(&next)
        // Only these are changed through here; history and stamps are ours.
        next.id = task.id; next.projectId = task.projectId; next.number = task.number; next.activity = task.activity
        next.createdAt = task.createdAt; next.updatedAt = task.updatedAt
        if next == task { return task }
        var events: [TaskEvent] = []
        func ev(_ kind: TaskEvent.Kind, text: String? = nil, from: String? = nil, to: String? = nil) {
            events.append(TaskEvent(id: makeId(), at: at, by: by, kind: kind, text: text, from: from, to: to))
        }
        if next.status != task.status { ev(.status, from: task.status.rawValue, to: next.status.rawValue) }
        if next.assignee != task.assignee { ev(.assign, from: show(task.assignee), to: show(next.assignee)) }
        if next.title != task.title { ev(.field, text: "title", from: task.title, to: next.title) }
        if next.description != task.description { ev(.field, text: "description", from: show(task.description), to: show(next.description)) }
        if next.due != task.due { ev(.field, text: "due date", from: show(task.due), to: show(next.due)) }
        if next.startDate != task.startDate { ev(.field, text: "start date", from: show(task.startDate), to: show(next.startDate)) }
        if next.priority != task.priority { ev(.field, text: "priority", from: priorityInfo(task.priority)?.label ?? "", to: priorityInfo(next.priority)?.label ?? "") }
        if next.category != task.category { ev(.field, text: "category", from: show(task.category), to: show(next.category)) }
        if next.room != task.room { ev(.field, text: "room", from: show(task.room), to: show(next.room)) }
        if (next.tags ?? []) != (task.tags ?? []) { ev(.field, text: "tags", from: (task.tags ?? []).joined(separator: ", "), to: (next.tags ?? []).joined(separator: ", ")) }
        if (next.checklist ?? []) != (task.checklist ?? []) { ev(.checklist, text: checklistChangeText(task.checklist ?? [], next.checklist ?? [])) }
        if (next.photoIds ?? []) != (task.photoIds ?? []) {
            let a = Set(task.photoIds ?? []), b = Set(next.photoIds ?? [])
            let added = b.subtracting(a).count, removed = a.subtracting(b).count
            let parts = [added > 0 ? "Added \(added) photo\(added == 1 ? "" : "s")" : "", removed > 0 ? "Removed \(removed) photo\(removed == 1 ? "" : "s")" : ""].filter { !$0.isEmpty }
            ev(.photo, text: parts.isEmpty ? "Reordered photos" : parts.joined(separator: ", "))
        }
        if next.x != task.x || next.y != task.y || next.sheetId != task.sheetId {
            ev(.field, text: task.x == nil && next.x != nil ? "placed on the plan" : next.x == nil ? "removed from the plan" : "moved the pin")
        }
        if next.status != task.status {
            if next.status == .done && task.closedAt == nil { next.closedAt = at }
            if next.status == .verified {
                next.verifiedBy = by
                next.verifiedAt = at
                next.closedAt = task.closedAt ?? at
            } else {
                if task.status == .verified { next.verifiedBy = nil; next.verifiedAt = nil }
                if !isClosed(next.status) { next.closedAt = nil }
            }
        }
        next.activity = (task.activity ?? []) + events
        next.updatedAt = at
        return next
    }

    static func checklistChangeText(_ before: [ChecklistItem], _ after: [ChecklistItem]) -> String {
        let old = Dictionary(before.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let checked = after.filter { $0.done == true && old[$0.id] != nil && old[$0.id]!.done != true }
        let unchecked = after.filter { $0.done != true && old[$0.id]?.done == true }
        let added = after.filter { old[$0.id] == nil }.count
        let removed = before.filter { b in !after.contains { $0.id == b.id } }.count
        var parts: [String] = []
        if checked.count == 1 { parts.append("Checked “\(checked[0].text)”") } else if !checked.isEmpty { parts.append("Checked \(checked.count) items") }
        if unchecked.count == 1 { parts.append("Unchecked “\(unchecked[0].text)”") } else if !unchecked.isEmpty { parts.append("Unchecked \(unchecked.count) items") }
        if added > 0 { parts.append("Added \(added) item\(added == 1 ? "" : "s")") }
        if removed > 0 { parts.append("Removed \(removed) item\(removed == 1 ? "" : "s")") }
        return parts.isEmpty ? "Edited the checklist" : parts.joined(separator: ", ")
    }

    /// Add a comment to the history; blank comments are ignored.
    public static func addComment(_ task: PlanTask, _ text: String, by: String, at: String, newId makeId: () -> String = { newId(10) }) -> PlanTask {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return task }
        var next = task
        next.activity = (task.activity ?? []) + [TaskEvent(id: makeId(), at: at, by: by, kind: .comment, text: t)]
        next.updatedAt = at
        return next
    }

    /// A new task with its "created" history line.
    public static func newTask(projectId: String, number: Int, title: String, by: String, at: String, id: String = newId(), newId makeId: () -> String = { newId(10) }) -> PlanTask {
        var t = PlanTask(id: id, projectId: projectId, number: number, title: title.trimmingCharacters(in: .whitespaces), createdAt: at)
        t.createdBy = by
        t.activity = [TaskEvent(id: makeId(), at: at, by: by, kind: .created)]
        return t
    }

    // MARK: permissions

    /// Techs move between open / in progress / ready / completed; only the office (owner, admin, or no team) verifies or reopens a verified task.
    public static func canSetStatus(_ role: TeamRole?, from: TaskStatus, to: TaskStatus) -> Bool {
        if from == to { return true }
        guard role == .tech else { return true }
        return from != .verified && to != .verified
    }

    /// Techs delete only tasks they made; the office deletes any task.
    public static func canDelete(_ role: TeamRole?, task: PlanTask, me: String) -> Bool {
        guard role == .tech else { return true }
        guard let by = task.createdBy, !by.isEmpty else { return false }
        return by.trimmingCharacters(in: .whitespaces).lowercased() == me.trimmingCharacters(in: .whitespaces).lowercased()
    }

    // MARK: filters, sorting, lists

    static func lc(_ s: String?) -> String { (s ?? "").trimmingCharacters(in: .whitespaces).lowercased() }

    public static func isOverdue(_ t: PlanTask, today: String) -> Bool { !isClosed(t.status) && FieldDocs.taskBucket(t.due, today: today) == .overdue }

    public static func matches(_ t: PlanTask, _ f: TaskFilter, today: String) -> Bool {
        if t.deleted == true { return false }
        if !f.status.isEmpty && !f.status.contains(t.status) { return false }
        if !f.priority.isEmpty && !f.priority.contains(t.priority ?? 0) { return false }
        if !f.category.isEmpty && !f.category.contains(where: { lc($0) == lc(t.category) }) { return false }
        if !f.assignee.isEmpty && !f.assignee.contains(where: { lc($0) == lc(t.assignee) }) { return false }
        if let s = f.sheetId {
            if s.isEmpty ? !(t.sheetId ?? "").isEmpty : t.sheetId != s { return false }
        }
        if !f.tags.isEmpty && !f.tags.contains(where: { g in (t.tags ?? []).contains { lc($0) == lc(g) } }) { return false }
        if let d = f.due {
            let b = FieldDocs.taskBucket(t.due, today: today)
            switch d {
            case .none: if b != .none { return false }
            case .overdue: if b != .overdue || isClosed(t.status) { return false }
            case .today: if b != .today { return false }
            case .week: if b != .today && b != .week { return false }
            }
        }
        let q = lc(f.text)
        if !q.isEmpty {
            let digits = q.hasPrefix("#") ? String(q.dropFirst()) : q
            if let n = Int(digits), digits.allSatisfy(\.isNumber) { return t.number == n }
            let hay = ([t.title, t.description ?? "", t.room ?? "", t.category ?? "", t.assignee ?? ""] + (t.tags ?? [])).map { lc($0) }.joined(separator: " ")
            if !q.split(separator: " ").allSatisfy({ hay.contains($0) }) { return false }
        }
        return true
    }

    public static func filterTasks(_ tasks: [PlanTask], _ f: TaskFilter, today: String) -> [PlanTask] { tasks.filter { matches($0, f, today: today) } }

    public static func sortTasks(_ tasks: [PlanTask], by: TaskSort) -> [PlanTask] {
        func byNum(_ a: PlanTask, _ b: PlanTask) -> Bool { a.number != b.number ? a.number < b.number : a.createdAt < b.createdAt }
        func rank(_ s: TaskStatus) -> Int { TaskStatus.allCases.firstIndex(of: s) ?? 0 }
        switch by {
        case .number: return tasks.sorted(by: byNum)
        case .due: return tasks.sorted { a, b in
            let da = a.due ?? "9999", db = b.due ?? "9999"
            return da != db ? da < db : byNum(a, b)
        }
        case .priority: return tasks.sorted { a, b in
            let pa = a.priority ?? 9, pb = b.priority ?? 9
            return pa != pb ? pa < pb : byNum(a, b)
        }
        case .status: return tasks.sorted { a, b in
            rank(a.status) != rank(b.status) ? rank(a.status) < rank(b.status) : byNum(a, b)
        }
        }
    }

    /// A copy to drop somewhere else: title, description, category, priority, assignee, tags and checklist (ticks reset).
    /// No history, photos or position.
    public static func duplicateTask(_ task: PlanTask, at: String, id: String, number: Int, by: String? = nil, newItemId: () -> String = { newId(8) }) -> PlanTask {
        var t = PlanTask(id: id, projectId: task.projectId, number: number, title: task.title, createdAt: at)
        t.description = task.description
        t.priority = task.priority
        t.category = task.category
        t.assignee = task.assignee
        t.tags = task.tags ?? []
        t.checklist = (task.checklist ?? []).map { i in
            var c = ChecklistItem(id: newItemId(), text: i.text, requiresPhoto: i.requiresPhoto == true)
            if i.requiresPhoto != true { c.requiresPhoto = nil }
            c.done = false
            return c
        }
        t.photoIds = []
        t.activity = []
        t.createdBy = by ?? task.createdBy
        return t
    }

    /// Pasted lines ("- item", "1. item", "[ ] item"), one checklist item each.
    public static func checklistLines(_ text: String) -> [String] {
        text.components(separatedBy: .newlines).map { line -> String in
            var l = line.trimmingCharacters(in: .whitespaces)
            if let r = l.range(of: #"^(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s*"#, options: .regularExpression) { l.removeSubrange(r) }
            return l.trimmingCharacters(in: .whitespaces)
        }.filter { !$0.isEmpty }
    }

    public struct OpenPlanTask: Identifiable, Hashable, Sendable {
        public var task: PlanTask
        public var bucket: FieldDocs.TaskBucket
        public var id: String { task.id }
    }

    /// Open plan tasks for My Tasks: one person's (case-insensitive), or everyone's assigned ones; by due date then number.
    public static func openPlanTasksFor(_ person: String?, _ tasks: [PlanTask], today: String) -> [OpenPlanTask] {
        let who = lc(person)
        return tasks
            .filter { $0.deleted != true && !isClosed($0.status) && (who.isEmpty ? !lc($0.assignee).isEmpty : lc($0.assignee) == who) }
            .map { OpenPlanTask(task: $0, bucket: FieldDocs.taskBucket($0.due, today: today)) }
            .sorted { a, b in
                let da = a.task.due ?? "9999", db = b.task.due ?? "9999"
                if da != db { return da < db }
                if a.task.number != b.task.number { return a.task.number < b.task.number }
                return a.task.createdAt < b.task.createdAt
            }
    }

    /// The room of the nearest device on the sheet (within `maxDist`, relative units).
    public static func nearestRoom(_ markers: [Marker], sheetId: String, x: Double, y: Double, maxDist: Double = 0.08) -> String? {
        var best: (d: Double, room: String)?
        for m in markers where m.deleted != true && m.sheetId == sheetId {
            let room = m.room.trimmingCharacters(in: .whitespaces)
            if room.isEmpty { continue }
            let d = ((m.x - x) * (m.x - x) + (m.y - y) * (m.y - y)).squareRoot()
            if d <= maxDist && (best == nil || d < best!.d) { best = (d, room) }
        }
        return best?.room
    }

    /// Category names: the trades' names and categories, then ones used on the job's tasks.
    public static func categoryOptions(_ fromTrades: [String], tasks: [PlanTask]) -> [String] {
        var seen = Set<String>(), out: [String] = []
        for c in fromTrades + tasks.filter({ $0.deleted != true }).map({ $0.category ?? "" }) {
            let v = c.trimmingCharacters(in: .whitespaces)
            if !v.isEmpty && seen.insert(v.lowercased()).inserted { out.append(v) }
        }
        return out
    }

    /// A history line in words: "changed status Open → Completed".
    public static func eventText(_ e: TaskEvent) -> String {
        switch e.kind {
        case .created: return e.text ?? "created the task"
        case .comment: return e.text ?? ""
        case .status:
            return "changed status \(info(TaskStatus(rawValue: e.from ?? "") ?? .open).label) → \(info(TaskStatus(rawValue: e.to ?? "") ?? .open).label)"
        case .assign: return (e.to ?? "").isEmpty ? "unassigned \(e.from ?? "")".trimmingCharacters(in: .whitespaces) : "assigned \(e.to!)"
        case .field:
            if e.from == nil && e.to == nil { return e.text ?? "edited" }
            return (e.to ?? "").isEmpty ? "cleared \(e.text ?? "")" : "set \(e.text ?? "") to \(e.to!)"
        case .photo, .checklist: return e.text ?? ""
        }
    }
}
