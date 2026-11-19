import XCTest
@testable import PinPlanCore

/// Mirrors tests/tasks.test.ts (same fixtures and expectations).
final class TaskTests: XCTestCase {
    let T0 = "2026-11-19T10:00:00.000Z"
    let T1 = "2026-11-19T11:00:00.000Z"
    let today = "2026-11-19"
    let categories = ["Electrical", "Low voltage", "Fire alarm", "HVAC", "Plumbing"]
    let people = ["Mike Jones", "Maria Lopez", "Ann", "Pat"]
    var n = 0
    func ids() -> String { n += 1; return "e\(n)" }

    func task(_ id: String = "t1", number: Int = 1, title: String = "Loose cover", status: TaskStatus = .open, _ edit: (inout PlanTask) -> Void = { _ in }) -> PlanTask {
        var t = PlanTask(id: id, projectId: "p1", number: number, title: title, status: status, createdAt: T0)
        edit(&t)
        return t
    }

    // MARK: quick entry

    func testQuickEntryPullsOutEverything() {
        XCTAssertEqual(TaskLogic.parseQuickEntry("Fix ceiling @Electrical @P1 @Mike #level2", categories: categories, people: people),
                       QuickEntry(title: "Fix ceiling", category: "Electrical", priority: 1, assignee: "Mike Jones", tags: ["level2"]))
    }

    func testQuickEntryCaseInsensitivePrefix() {
        let q = TaskLogic.parseQuickEntry("Patch hole @elec @p3 @MAR", categories: categories, people: people)
        XCTAssertEqual(q.title, "Patch hole")
        XCTAssertEqual(q.category, "Electrical")
        XCTAssertEqual(q.priority, 3)
        XCTAssertEqual(q.assignee, "Maria Lopez")
        XCTAssertEqual(TaskLogic.parseQuickEntry("Smoke head @alarm", categories: categories).category, "Fire alarm")
    }

    func testQuickEntryKeepsUnknownWord() {
        let q = TaskLogic.parseQuickEntry("Call @Bob about @Electrical box", categories: categories, people: people)
        XCTAssertEqual(q.title, "Call @Bob about box")
        XCTAssertEqual(q.category, "Electrical")
        XCTAssertNil(q.assignee)
    }

    func testQuickEntryTagsOnceFirstPriority() {
        XCTAssertEqual(TaskLogic.parseQuickEntry("Loose cover @P1 #lobby #Level2 #LOBBY @P2", categories: categories, people: people),
                       QuickEntry(title: "Loose cover", priority: 1, tags: ["lobby", "Level2"]))
    }

    func testQuickEntryExactThenCategories() {
        XCTAssertEqual(TaskLogic.parseQuickEntry("x @Pat", categories: categories, people: people).assignee, "Pat")
        XCTAssertEqual(TaskLogic.parseQuickEntry("x @hv", categories: categories, people: ["Hvasquez"]).category, "HVAC")
        XCTAssertEqual(TaskLogic.parseQuickEntry("  Fix  the door @ # "), QuickEntry(title: "Fix the door @ #", tags: []))
    }

    // MARK: changes

    func testChangeLogsEachAttribute() {
        let t = task { $0.assignee = "Ann"; $0.priority = 2 }
        let next = TaskLogic.applyTaskChange(t, by: "Ann", at: T1, newId: ids) {
            $0.status = .in_progress; $0.assignee = "Mike"; $0.priority = 2; $0.due = "2026-11-20"; $0.category = "Electrical"
        }
        XCTAssertEqual(next.activity!.map(\.kind), [.status, .assign, .field, .field])
        XCTAssertEqual(next.activity![0].from, "open")
        XCTAssertEqual(next.activity![0].to, "in_progress")
        XCTAssertEqual(next.activity![1].to, "Mike")
        XCTAssertEqual(next.activity![2].text, "due date")
        XCTAssertEqual(next.updatedAt, T1)
    }

    func testNoChangeReturnsSameTask() {
        let t = task { $0.priority = 1 }
        XCTAssertEqual(TaskLogic.applyTaskChange(t, by: "Ann", at: T1, newId: ids) { $0.priority = 1; $0.title = "Loose cover" }, t)
    }

    func testCloseOutStamps() {
        let done = TaskLogic.applyTaskChange(task(), by: "Mike", at: T0, newId: ids) { $0.status = .done }
        XCTAssertEqual(done.closedAt, T0)
        XCTAssertNil(done.verifiedAt)
        let ver = TaskLogic.applyTaskChange(done, by: "Office", at: T1, newId: ids) { $0.status = .verified }
        XCTAssertEqual(ver.verifiedBy, "Office")
        XCTAssertEqual(ver.verifiedAt, T1)
        XCTAssertEqual(ver.closedAt, T0)
        let reopened = TaskLogic.applyTaskChange(ver, by: "Office", at: T1, newId: ids) { $0.status = .open }
        XCTAssertNil(reopened.closedAt)
        XCTAssertNil(reopened.verifiedBy)
        XCTAssertNil(reopened.verifiedAt)
        XCTAssertEqual(TaskLogic.applyTaskChange(task(), by: "Office", at: T1, newId: ids) { $0.status = .verified }.closedAt, T1)
    }

    func testChecklistPhotosAndMoves() {
        let t = task {
            $0.checklist = [ChecklistItem(id: "a", text: "Tighten screws"), ChecklistItem(id: "b", text: "Paint")]
            $0.checklist![0].requiresPhoto = nil; $0.checklist![1].requiresPhoto = nil
            $0.photoIds = ["p1"]; $0.sheetId = "s1"; $0.x = 0.1; $0.y = 0.2
        }
        let c = TaskLogic.applyTaskChange(t, by: "Ann", at: T1, newId: ids) {
            $0.checklist![0].done = true
            $0.checklist!.append(ChecklistItem(id: "c", text: "New"))
        }
        XCTAssertEqual(c.activity!.last!.kind, .checklist)
        XCTAssertEqual(c.activity!.last!.text, "Checked “Tighten screws”, Added 1 item")
        let p = TaskLogic.applyTaskChange(t, by: "Ann", at: T1, newId: ids) { $0.photoIds = ["p1", "p2", "p3"] }
        XCTAssertEqual(p.activity!.last!.text, "Added 2 photos")
        let m = TaskLogic.applyTaskChange(t, by: "Ann", at: T1, newId: ids) { $0.x = 0.3; $0.y = 0.4 }
        XCTAssertEqual(m.activity!.count, 1)
        XCTAssertEqual(m.activity![0].text, "moved the pin")
    }

    func testCommentsAndNewTask() {
        let t = TaskLogic.addComment(task(), "  Needs a ladder ", by: "Ann", at: T1, newId: ids)
        XCTAssertEqual(t.activity!.count, 1)
        XCTAssertEqual(t.activity![0].kind, .comment)
        XCTAssertEqual(t.activity![0].text, "Needs a ladder")
        XCTAssertEqual(TaskLogic.addComment(t, "   ", by: "Ann", at: T1), t)
        let nt = TaskLogic.newTask(projectId: "p1", number: 4, title: " Fix ", by: "Ann", at: T0, id: "x", newId: ids)
        XCTAssertEqual(nt.status, .open)
        XCTAssertEqual(nt.title, "Fix")
        XCTAssertEqual(nt.createdBy, "Ann")
        XCTAssertEqual(nt.activity!.map(\.kind), [.created])
    }

    // MARK: permissions

    func testTechStatusMatrix() {
        for from in TaskStatus.allCases {
            for to in TaskStatus.allCases {
                let expected = from == to || (from != .verified && to != .verified)
                XCTAssertEqual(TaskLogic.canSetStatus(.tech, from: from, to: to), expected, "\(from) → \(to)")
                for role: TeamRole? in [.owner, .admin, nil] { XCTAssertTrue(TaskLogic.canSetStatus(role, from: from, to: to)) }
            }
        }
    }

    func testTechDeletesOnlyOwn() {
        XCTAssertTrue(TaskLogic.canDelete(.tech, task: task { $0.createdBy = "Mike" }, me: "mike"))
        XCTAssertFalse(TaskLogic.canDelete(.tech, task: task { $0.createdBy = "Ann" }, me: "Mike"))
        XCTAssertFalse(TaskLogic.canDelete(.tech, task: task(), me: "Mike"))
        XCTAssertTrue(TaskLogic.canDelete(.admin, task: task { $0.createdBy = "Ann" }, me: "Mike"))
    }

    // MARK: filters

    var list: [PlanTask] {
        [
            task("a", number: 1) { $0.priority = 1; $0.category = "Electrical"; $0.assignee = "Mike"; $0.due = "2026-11-18"; $0.sheetId = "s1"; $0.x = 0.1; $0.y = 0.1; $0.tags = ["lobby"] },
            task("b", number: 2, status: .done) { $0.priority = 2; $0.category = "HVAC"; $0.assignee = "Ann"; $0.due = "2026-11-17"; $0.sheetId = "s1" },
            task("c", number: 3, title: "Smoke detector", status: .in_progress) { $0.assignee = "mike"; $0.due = "2026-11-19"; $0.description = "Kitchen ceiling" },
            task("d", number: 4, status: .ready) { $0.category = "electrical"; $0.due = "2026-11-25"; $0.sheetId = "s2"; $0.room = "Lobby" },
            task("e", number: 5) { $0.due = "2026-12-30" },
            task("f", number: 6) { $0.deleted = true },
        ]
    }
    func ids(_ f: TaskFilter) -> [String] { TaskLogic.filterTasks(list, f, today: today).map(\.id) }
    func filter(_ edit: (inout TaskFilter) -> Void) -> TaskFilter { var f = TaskFilter(); edit(&f); return f }

    func testEmptyFilterKeepsLive() {
        XCTAssertEqual(ids(TaskFilter()), ["a", "b", "c", "d", "e"])
        XCTAssertTrue(TaskFilter().isEmpty)
    }

    func testFilterCombinations() {
        XCTAssertEqual(ids(filter { $0.status = [.open, .ready] }), ["a", "d", "e"])
        XCTAssertEqual(ids(filter { $0.category = ["ELECTRICAL"] }), ["a", "d"])
        XCTAssertEqual(ids(filter { $0.assignee = ["Mike"] }), ["a", "c"])
        XCTAssertEqual(ids(filter { $0.assignee = ["Mike"]; $0.status = [.open] }), ["a"])
        XCTAssertEqual(ids(filter { $0.priority = [1, 2] }), ["a", "b"])
        XCTAssertEqual(ids(filter { $0.sheetId = "s1" }), ["a", "b"])
        XCTAssertEqual(ids(filter { $0.sheetId = "" }), ["c", "e"])
        XCTAssertEqual(ids(filter { $0.assignee = [""] }), ["d", "e"])
    }

    func testDueBuckets() {
        XCTAssertEqual(ids(filter { $0.due = .overdue }), ["a"])
        XCTAssertEqual(ids(filter { $0.due = .today }), ["c"])
        XCTAssertEqual(ids(filter { $0.due = .week }), ["c", "d"])
        XCTAssertEqual(ids(filter { $0.due = TaskDue.none }), [])
    }

    func testSearch() {
        XCTAssertEqual(ids(filter { $0.text = "smoke kitchen" }), ["c"])
        XCTAssertEqual(ids(filter { $0.text = "#4" }), ["d"])
        XCTAssertEqual(ids(filter { $0.text = "lobby" }), ["a", "d"])
        XCTAssertEqual(ids(filter { $0.tags = ["LOBBY"] }), ["a"])
    }

    func testSorting() {
        let live = list.filter { $0.deleted != true }
        XCTAssertEqual(TaskLogic.sortTasks(live, by: .due).map(\.id), ["b", "a", "c", "d", "e"])
        XCTAssertEqual(TaskLogic.sortTasks(live, by: .priority).map(\.id), ["a", "b", "c", "d", "e"])
        XCTAssertEqual(TaskLogic.sortTasks(live, by: .status).map(\.id), ["a", "e", "c", "d", "b"])
        var y = task("y", number: 7); y.createdAt = T1
        let x = task("x", number: 7)
        XCTAssertEqual(TaskLogic.sortTasks([y, x], by: .number).map(\.id), ["x", "y"])
    }

    // MARK: duplicate, numbering, lists

    func testDuplicateResets() {
        let src = task(status: .verified) {
            $0.priority = 1; $0.category = "Electrical"; $0.assignee = "Mike"; $0.tags = ["lobby"]; $0.description = "d"
            var item = ChecklistItem(id: "a", text: "Screws", requiresPhoto: true); item.done = true; item.doneBy = "Mike"
            $0.checklist = [item]; $0.photoIds = ["p1"]; $0.activity = [TaskEvent(id: "e", at: self.T0, by: "Ann", kind: .created)]
            $0.sheetId = "s1"; $0.x = 0.5; $0.y = 0.5; $0.room = "Lobby"; $0.closedAt = self.T0; $0.verifiedBy = "Office"
        }
        var k = 0
        let copy = TaskLogic.duplicateTask(src, at: T1, id: "t2", number: 9, by: "Ann", newItemId: { k += 1; return "n\(k)" })
        XCTAssertEqual(copy.id, "t2")
        XCTAssertEqual(copy.number, 9)
        XCTAssertEqual(copy.status, .open)
        XCTAssertEqual(copy.priority, 1)
        XCTAssertEqual(copy.category, "Electrical")
        XCTAssertEqual(copy.assignee, "Mike")
        XCTAssertEqual(copy.tags, ["lobby"])
        XCTAssertEqual(copy.description, "d")
        XCTAssertEqual(copy.checklist?.count, 1)
        XCTAssertEqual(copy.checklist?[0].id, "n1")
        XCTAssertEqual(copy.checklist?[0].done, false)
        XCTAssertEqual(copy.checklist?[0].requiresPhoto, true)
        XCTAssertNil(copy.checklist?[0].doneBy)
        XCTAssertNil(copy.sheetId); XCTAssertNil(copy.x); XCTAssertNil(copy.room); XCTAssertNil(copy.closedAt); XCTAssertNil(copy.verifiedBy)
        XCTAssertEqual(copy.photoIds, [])
        XCTAssertEqual(copy.activity, [])
        XCTAssertEqual(copy.createdBy, "Ann")
        XCTAssertEqual(copy.createdAt, T1)
    }

    func testNumbering() {
        XCTAssertEqual(TaskLogic.nextTaskNumber([]), 1)
        XCTAssertEqual(TaskLogic.nextTaskNumber([task(number: 3), task(number: 12), task(number: 7)]), 13)
        XCTAssertEqual(TaskLogic.nextTaskNumber([task(number: 5) { $0.deleted = true }]), 6)
    }

    func testPinColorAndPlacement() {
        for s in TaskLogic.statuses { XCTAssertEqual(TaskLogic.pinColor(task(status: s.id)), s.color) }
        XCTAssertEqual(TaskLogic.pinColor(task(status: .open)), "#dc2626")
        XCTAssertEqual(TaskLogic.pinColor(task(status: .done)), "#16a34a")
        XCTAssertEqual(TaskLogic.placement(task { $0.sheetId = "s"; $0.x = 0; $0.y = 0.2 }), .pin)
        XCTAssertEqual(TaskLogic.placement(task { $0.sheetId = "s" }), .sheet)
        XCTAssertEqual(TaskLogic.placement(task()), .general)
    }

    func testMyTasks() {
        let l = [
            task("a", number: 1) { $0.assignee = "Mike"; $0.due = "2026-11-25" },
            task("b", number: 2) { $0.assignee = "mike"; $0.due = "2026-11-18" },
            task("c", number: 3, status: .done) { $0.assignee = "Mike" },
            task("d", number: 4) { $0.assignee = "Ann" },
            task("e", number: 5) { $0.assignee = "Mike" },
            task("f", number: 6),
        ]
        let mine = TaskLogic.openPlanTasksFor("MIKE", l, today: today)
        XCTAssertEqual(mine.map(\.task.id), ["b", "a", "e"])
        XCTAssertEqual(mine.map(\.bucket), [.overdue, .week, .none])
        XCTAssertEqual(TaskLogic.openPlanTasksFor(nil, l, today: today).map(\.task.id), ["b", "a", "d", "e"])
    }

    func testRoomCategoriesAndLines() {
        let markers = [
            Marker(projectId: "p", sheetId: "s1", deviceTypeId: "d", x: 0.5, y: 0.5, label: "", room: "Lobby"),
            Marker(projectId: "p", sheetId: "s1", deviceTypeId: "d", x: 0.52, y: 0.5, label: "", room: "Hall"),
            Marker(projectId: "p", sheetId: "s2", deviceTypeId: "d", x: 0.1, y: 0.1, label: "", room: "Other"),
        ]
        XCTAssertEqual(TaskLogic.nearestRoom(markers, sheetId: "s1", x: 0.53, y: 0.5), "Hall")
        XCTAssertNil(TaskLogic.nearestRoom(markers, sheetId: "s1", x: 0.9, y: 0.9))
        XCTAssertEqual(TaskLogic.categoryOptions(["Electrical", "Lighting"], tasks: [task { $0.category = "electrical" }, task { $0.category = "Drywall" }]), ["Electrical", "Lighting", "Drywall"])
        XCTAssertEqual(TaskLogic.checklistLines("- one\n2. two\n\n[ ] three\n• four "), ["one", "two", "three", "four"])
    }

    // MARK: sync + decoding

    func testSyncRoundTrip() throws {
        var t = task {
            $0.description = "d"; $0.priority = 1; $0.category = "Electrical"; $0.assignee = "Mike"; $0.watchers = ["Ann"]
            $0.due = "2026-11-20"; $0.startDate = "2026-11-18"; $0.sheetId = "s1"; $0.x = 0.25; $0.y = 0.75; $0.markerId = "m1"
            $0.room = "Lobby"; $0.tags = ["lobby"]; $0.photoIds = ["p1"]; $0.createdBy = "Ann"; $0.closedAt = self.T1
            $0.verifiedBy = "Office"; $0.verifiedAt = self.T1
        }
        t.activity = [TaskEvent(id: "e", at: T0, by: "Ann", kind: .created)]
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(t)) as! [String: Any]
        let remote = SyncMap.toRemote(.tasks, json)
        XCTAssertEqual(SyncMap.specs[.tasks]?.remote, "tasks")
        XCTAssertEqual(remote["start_date"] as? String, "2026-11-18")
        XCTAssertEqual(remote["project_id"] as? String, "p1")
        XCTAssertEqual(remote["deleted"] as? Bool, false)
        var pg = remote
        pg["closed_at"] = "2026-11-19 11:00:00+00"
        let local = SyncMap.toLocal(.tasks, pg)
        let back = try JSONDecoder().decode(PlanTask.self, from: JSONSerialization.data(withJSONObject: local))
        XCTAssertEqual(back, t)
        XCTAssertTrue(SyncMap.pushOrder.contains(.tasks))
    }

    func testLenientDecoding() throws {
        let raw = #"{"id":"t","number":3,"title":"x","status":"someday","priority":2,"activity":[{"id":"e","at":"a","by":"b","kind":"reaction"}],"future":true}"#
        let t = try JSONDecoder().decode(PlanTask.self, from: Data(raw.utf8))
        XCTAssertEqual(t.status, .open)
        XCTAssertEqual(t.number, 3)
        XCTAssertEqual(t.activity?.first?.kind, .field)
        // Jobs saved before tasks existed load with none.
        let b = ProjectBundle(project: Project(id: "p", clientName: "c", address: "a"))
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(b)) as! [String: Any]
        json.removeValue(forKey: "tasks")
        XCTAssertEqual(try JSONDecoder().decode(ProjectBundle.self, from: JSONSerialization.data(withJSONObject: json)).tasks, [])
    }

    func testSyncStateMergesTasks() {
        var s = SyncState(bundles: [ProjectBundle(project: Project(id: "p1", clientName: "c", address: "a"))], catalog: [], products: [])
        var ledger = SyncLedger()
        let r = s.merge(.tasks, remote: ["id": "t9", "project_id": "p1", "number": 9, "title": "Remote", "status": "ready", "updated_at": T1, "created_at": T0], ledger: &ledger)
        XCTAssertEqual(r, .applied)
        XCTAssertEqual(s.bundles["p1"]?.tasks.first?.status, .ready)
        XCTAssertTrue(s.rows().contains { $0.table == .tasks && $0.id == "t9" })
    }

    func testBackupCarriesTasks() throws {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "c", address: "a"))
        b.tasks = [task()]
        let entry = BackupFile.ProjectEntry(bundle: b, images: [])
        let back = try JSONDecoder().decode(BackupFile.ProjectEntry.self, from: JSONEncoder().encode(entry))
        XCTAssertEqual(back.bundle.tasks, b.tasks)
    }
}
