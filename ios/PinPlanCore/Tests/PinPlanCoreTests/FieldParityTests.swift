import XCTest
@testable import PinPlanCore

/// Mirrors tests/measure.test.ts, tests/markups.test.ts, tests/rfis.test.ts and tests/schedule.test.ts (same fixtures and
/// expectations) for the parts the iPad/iPhone field screens use.
final class FieldParityTests: XCTestCase {
    typealias M = FieldParity.Measure
    // 1000 × 500 px sheet at 10 px/ft = 100 ft × 50 ft.
    let sheet = M.Scale(width: 1000, height: 500, pxPerFt: 10)
    // Rectangle 100 px × 50 px (10 ft × 5 ft) starting at (100, 100).
    let rect = [0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.1, 0.3]

    // MARK: measurements

    func testMeasuresAKnownRectangle() throws {
        XCTAssertEqual(try XCTUnwrap(M.lengthFt([0.1, 0.2, 0.2, 0.2], sheet)), 10, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(M.lengthFt(rect, sheet)), 25, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(M.areaSqFt(rect, sheet)), 50, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(M.perimeterFt(rect, sheet)), 30, accuracy: 1e-9)
        let reversed = [0.1, 0.3, 0.2, 0.3, 0.2, 0.2, 0.1, 0.2]
        XCTAssertEqual(try XCTUnwrap(M.areaSqFt(reversed, sheet)), 50, accuracy: 1e-9)
    }

    func testNoScaleNoValue() {
        XCTAssertNil(M.lengthFt(rect, M.Scale(width: 1000, height: 500, pxPerFt: nil)))
        XCTAssertNil(M.areaSqFt(rect, M.Scale(width: 1000, height: 500, pxPerFt: 0)))
        XCTAssertNil(M.value(kind: .polyline, points: [0, 0, 0.1, 0], extraFt: nil, wastePct: nil, scale: M.Scale(width: 1000, height: 500, pxPerFt: nil)))
    }

    func testAllowances() throws {
        // 10 ft run + 10 ft extra, 10 % waste.
        let v = try XCTUnwrap(M.value(kind: .polyline, points: [0, 0, 0.1, 0], extraFt: 10, wastePct: 10, scale: sheet))
        XCTAssertEqual(v.value, 22, accuracy: 1e-9)
        XCTAssertEqual(v.raw, 10, accuracy: 1e-9)
        XCTAssertEqual(v.unit, "ft")
        // Junk allowances are ignored.
        XCTAssertEqual(try XCTUnwrap(M.value(kind: .polyline, points: [0, 0, 0.1, 0], extraFt: -5, wastePct: .nan, scale: sheet)).value, 10, accuracy: 1e-9)
        let a = try XCTUnwrap(M.value(kind: .area, points: rect, extraFt: 99, wastePct: 20, scale: sheet))
        XCTAssertEqual(a.unit, "sq ft")
        XCTAssertEqual(a.value, 60, accuracy: 1e-9)
        XCTAssertEqual(a.raw, 50, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(a.perimeterFt), 30, accuracy: 1e-9)
        XCTAssertFalse(a.selfIntersecting)
    }

    func testSelfIntersecting() throws {
        let bowtie = [0.1, 0.1, 0.3, 0.3, 0.3, 0.1, 0.1, 0.3]
        XCTAssertTrue(M.isSelfIntersecting(bowtie))
        XCTAssertFalse(M.isSelfIntersecting(rect))
        XCTAssertTrue(try XCTUnwrap(M.value(kind: .area, points: bowtie, extraFt: nil, wastePct: nil, scale: sheet)).selfIntersecting)
    }

    func testFormatting() {
        XCTAssertEqual(M.formatFeetInches(12.5), "12' 6\"")
        XCTAssertEqual(M.formatFeetInches(0), "0' 0\"")
        XCTAssertEqual(M.formatFeetInches(9.999), "10' 0\"")
        XCTAssertEqual(M.formatFeetInches(1234.25), "1,234' 3\"")
        XCTAssertEqual(M.formatFeetInches(nil), "—")
        XCTAssertEqual(M.formatSqFt(1234.4), "1,234 sq ft")
        XCTAssertEqual(M.formatSqFt(2.25), "2.3 sq ft")
        XCTAssertEqual(M.format(nil), "—")
    }

    func testLabelPoint() throws {
        let mid = try XCTUnwrap(M.labelPoint(kind: .polyline, points: [0, 0, 0.2, 0], scale: sheet))
        XCTAssertEqual(mid.x * 1000, 100, accuracy: 1e-9)
        XCTAssertEqual(mid.y, 0, accuracy: 1e-9)
        let c = try XCTUnwrap(M.labelPoint(kind: .area, points: rect, scale: sheet))
        XCTAssertEqual(c.x * 1000, 150, accuracy: 1e-6)
        XCTAssertEqual(c.y * 500, 125, accuracy: 1e-6)
        XCTAssertNil(M.labelPoint(kind: .length, points: [], scale: sheet))
    }

    func testKinds() {
        XCTAssertEqual(M.Kind(raw: "area"), .area)
        XCTAssertEqual(M.Kind(raw: "something new"), .length)
        XCTAssertEqual(M.Kind.polyline.name, "Run")
    }

    // MARK: markups

    func testCloudPathClosedInsideBox() {
        let pts = FieldParity.Markup.cloudPath(100, 50, 400, 300, arcSize: 30)
        XCTAssertGreaterThan(pts.count, 40)
        XCTAssertEqual(pts[0], pts[pts.count - 2], accuracy: 1e-9)
        XCTAssertEqual(pts[1], pts[pts.count - 1], accuracy: 1e-9)
        for i in stride(from: 0, to: pts.count, by: 2) {
            XCTAssertGreaterThanOrEqual(pts[i], 100 - 1e-9)
            XCTAssertLessThanOrEqual(pts[i], 400 + 1e-9)
            XCTAssertGreaterThanOrEqual(pts[i + 1], 50 - 1e-9)
            XCTAssertLessThanOrEqual(pts[i + 1], 300 + 1e-9)
        }
        let ys = stride(from: 1, to: pts.count, by: 2).map { pts[$0] }
        XCTAssertEqual(ys.min()!, 50, accuracy: 0.5)
        XCTAssertEqual(FieldParity.Markup.cloudPath(0, 0, 10, 0, arcSize: 5), [0, 0, 10, 0, 10, 0, 0, 0, 0, 0])
    }

    func testArrowHead() {
        let h = FieldParity.Markup.arrowHead([0, 0, 100, 0], size: 10)
        XCTAssertEqual(Array(h[2...3]), [100, 0])
        XCTAssertEqual(h[0], 90, accuracy: 1e-9)
        XCTAssertEqual(h[4], 90, accuracy: 1e-9)
        XCTAssertEqual(abs(h[1] - h[5]), 10, accuracy: 1e-9)
        XCTAssertEqual(FieldParity.Markup.arrowHead([5, 5], size: 10), [])
        XCTAssertEqual(FieldParity.Markup.arrowHead([5, 5, 5, 5], size: 10), [])
    }

    func testPrivateMarkupsOnlyForTheirAuthor() {
        typealias K = FieldParity.Markup
        XCTAssertTrue(K.canSee(isPrivate: nil, authorId: "u1", userId: "u2"))
        XCTAssertTrue(K.canSee(isPrivate: true, authorId: "u1", userId: "u1"))
        XCTAssertFalse(K.canSee(isPrivate: true, authorId: "u1", userId: "u2"))
        XCTAssertFalse(K.canSee(isPrivate: true, authorId: "u1", userId: nil))
        // Drawn on a device while signed out: nobody owns it yet.
        XCTAssertTrue(K.canSee(isPrivate: true, authorId: nil, userId: "u2"))
        XCTAssertEqual(K.layerNames(["As-built", "as-built", " Electrical ", ""]), ["Redlines", "As-built", "Notes", "Electrical"])
        XCTAssertEqual(K.textLines("a\nb"), ["a", "b"])
        XCTAssertEqual(K.textLines(nil), [""])
    }

    // MARK: RFIs

    func testRfiCodesAndNumbers() {
        XCTAssertEqual(FieldParity.RFI.code(7), "RFI-007")
        XCTAssertEqual(FieldParity.RFI.code(1234), "RFI-1234")
        XCTAssertEqual(FieldParity.RFI.code(-2), "RFI-000")
        XCTAssertEqual(FieldParity.RFI.nextNumber([]), 1)
        XCTAssertEqual(FieldParity.RFI.nextNumber([3, 9, 2]), 10)
    }

    func testBallInCourtAndOverdue() {
        typealias R = FieldParity.RFI
        XCTAssertEqual(R.ballLabel(status: "open", ballInCourt: "them"), "With them")
        XCTAssertEqual(R.ballLabel(status: "answered", ballInCourt: "us"), "With us")
        XCTAssertNil(R.ballLabel(status: "closed", ballInCourt: "us"))
        XCTAssertNil(R.ballLabel(status: "void", ballInCourt: "them"))
        XCTAssertTrue(R.isOverdue(status: "open", due: "2026-11-18", today: "2026-11-19"))
        XCTAssertFalse(R.isOverdue(status: "open", due: "2026-11-19", today: "2026-11-19"))
        XCTAssertFalse(R.isOverdue(status: "answered", due: "2026-11-01", today: "2026-11-19"))
        XCTAssertFalse(R.isOverdue(status: "open", due: "2026-11-01", deleted: true, today: "2026-11-19"))
        XCTAssertFalse(R.isOverdue(status: "open", due: nil, today: "2026-11-19"))
        XCTAssertEqual(R.statusLabel("answered"), "Answered")
    }

    func testTechnicianRaisesDraftsOnly() {
        typealias R = FieldParity.RFI
        XCTAssertTrue(R.can(.tech, "create"))
        XCTAssertTrue(R.can(.tech, "addPhoto"))
        XCTAssertFalse(R.can(.tech, "send"))
        XCTAssertFalse(R.can(.tech, "close"))
        XCTAssertTrue(R.can(.admin, "send"))
        XCTAssertTrue(R.can(nil, "send"))
        XCTAssertTrue(R.canEdit(.tech, status: "draft"))
        XCTAssertFalse(R.canEdit(.tech, status: "open"))
        XCTAssertTrue(R.canEdit(.owner, status: "answered"))
        XCTAssertFalse(R.canEdit(.owner, status: "void"))
        XCTAssertFalse(R.draftIsSavable(subject: "  ", question: "\n"))
        XCTAssertTrue(R.draftIsSavable(subject: "", question: "Where does the FACP go?"))
        XCTAssertEqual(R.subject("", question: "Where does the FACP go?\nMore detail"), "Where does the FACP go?")
        XCTAssertEqual(R.subject(" Panel spot ", question: "x"), "Panel spot")
        XCTAssertEqual(R.subject("", question: String(repeating: "a", count: 100)).count, 80)
    }

    // MARK: schedule

    func testDaysAndWeeks() {
        typealias S = FieldParity.Schedule
        XCTAssertEqual(S.dayNum("1970-01-02"), 1)
        XCTAssertNil(S.dayNum("2026-1-2"))
        XCTAssertEqual(S.dayStr(S.dayNum("2026-11-23")!), "2026-11-23")
        XCTAssertEqual(S.weekday(S.dayNum("2026-11-23")!), 1) // Monday
        XCTAssertEqual(S.weekStart("2026-11-25"), "2026-11-23")
        XCTAssertEqual(S.weekStart("2026-11-29"), "2026-11-23") // Sunday belongs to the week before
        XCTAssertEqual(S.weekStart("2026-11-23"), "2026-11-23")
        let w3 = S.window(today: "2026-11-25", weeks: 3)
        XCTAssertEqual(w3.from, "2026-11-23")
        XCTAssertEqual(w3.to, "2026-12-13")
        let w1 = S.window(today: "2026-11-25", weeks: 1)
        XCTAssertEqual(w1.to, "2026-11-29")
        XCTAssertTrue(S.touches(start: "2026-11-16", end: "2026-11-23", from: w3.from, to: w3.to))
        XCTAssertFalse(S.touches(start: "2026-11-16", end: "2026-11-22", from: w3.from, to: w3.to))
        XCTAssertTrue(S.touches(start: "2026-12-13", end: "2026-12-14", from: w3.from, to: w3.to))
        XCTAssertEqual(S.workdaysBetween("2026-11-23", "2026-11-29"), 5)
        XCTAssertEqual(S.workdaysBetween("2026-11-23", "2026-11-29", workdaysOnly: false), 7)
        XCTAssertEqual(S.workdaysBetween("2026-11-29", "2026-11-23"), 0)
    }

    func testCrewAndStatus() {
        typealias S = FieldParity.Schedule
        XCTAssertTrue(S.onCrew(["Mike Jones", "Ann"], me: " mike jones "))
        XCTAssertFalse(S.onCrew(["Mike Jones"], me: ""))
        XCTAssertFalse(S.onCrew(nil, me: "Ann"))
        XCTAssertEqual(S.status(start: "2026-11-23", end: "2026-11-27", progress: 100, workdaysOnly: nil, today: "2026-12-01"), .done)
        XCTAssertEqual(S.status(start: "2026-11-23", end: "2026-11-27", progress: 50, workdaysOnly: nil, today: "2026-12-01"), .late)
        XCTAssertEqual(S.status(start: "2026-11-23", end: "2026-11-27", progress: 0, workdaysOnly: nil, today: "2026-11-20"), .upcoming)
        // Day 4 of 5 (80 % elapsed) with 20 % done: behind.
        XCTAssertEqual(S.status(start: "2026-11-23", end: "2026-11-27", progress: 20, workdaysOnly: nil, today: "2026-11-26"), .behind)
        XCTAssertEqual(S.status(start: "2026-11-23", end: "2026-11-27", progress: 60, workdaysOnly: nil, today: "2026-11-26"), .active)
    }

    // MARK: Today

    func testTodayTasksLogAndChecklists() {
        func task(_ id: String, _ due: String?, assignee: String? = "Ann", status: TaskStatus = .open) -> PlanTask {
            var t = PlanTask(id: id, projectId: "p", number: Int(id.dropFirst()) ?? 0, title: id, status: status, createdAt: "2026-11-01T00:00:00Z")
            t.due = due; t.assignee = assignee
            return t
        }
        let tasks = [task("t1", "2026-11-25"), task("t2", "2026-11-19"), task("t3", "2026-11-10"), task("t4", "2026-11-10", assignee: "Pat"),
                     task("t5", "2026-11-10", status: .done), task("t6", nil)]
        XCTAssertEqual(FieldParity.Today.dueTasks(tasks, me: "ann", today: "2026-11-19").map(\.task.id), ["t3", "t2"])

        var mine = JobLog(projectId: "p", date: "2026-11-19", author: "Ann")
        mine.createdAt = "2026-11-19T08:00:00Z"
        var theirs = JobLog(projectId: "p", date: "2026-11-19", author: "Pat")
        theirs.createdAt = "2026-11-19T09:00:00Z"
        let old = JobLog(projectId: "p", date: "2026-11-18", author: "Ann")
        XCTAssertEqual(FieldParity.Today.todaysLog([old, theirs, mine], me: "ANN", today: "2026-11-19")?.id, mine.id)
        XCTAssertEqual(FieldParity.Today.todaysLog([old, theirs], me: "Ann", today: "2026-11-19")?.id, theirs.id)
        XCTAssertNil(FieldParity.Today.todaysLog([old], me: "Ann", today: "2026-11-19"))

        var done = ChecklistItem(text: "a"); done.done = true
        let finished = Checklist(projectId: "p", name: "Done", items: [done])
        let open = Checklist(projectId: "p", name: "Trim", items: [done, ChecklistItem(text: "b")])
        let empty = Checklist(projectId: "p", name: "Empty", items: [])
        XCTAssertEqual(FieldParity.Today.openChecklists([finished, open, empty], photos: []).map(\.name), ["Trim"])
    }
}
