import XCTest
@testable import PinPlanCore

/// Same cases as tests/jobSummary.test.ts.
final class JobSummaryTests: XCTestCase {
    let today = "2026-11-19"

    func bundle(status: ProjectStatus = .estimate) -> ProjectBundle {
        var p = Project(id: "p", clientName: "", address: "")
        p.status = status
        var b = ProjectBundle(project: p)
        b.sheets = [Sheet(id: "s", projectId: "p", name: "1", pageNumber: 1, order: 0, imageId: "i", width: 10, height: 10)]
        var gone = Marker(id: "gone", projectId: "p", sheetId: "s", deviceTypeId: "cam", x: 0, y: 0, label: "x")
        gone.deleted = true
        b.markers = [Marker(id: "m1", projectId: "p", sheetId: "s", deviceTypeId: "cam", x: 0, y: 0, label: "a"),
                     Marker(id: "m2", projectId: "p", sheetId: "s", deviceTypeId: "cam", x: 0, y: 0, label: "b", tentative: true), gone]
        b.runs = [Run(id: "r1", projectId: "p", sheetId: "s", kind: .led, points: [0, 0, 1, 1]), Run(id: "w1", projectId: "p", sheetId: "s", kind: .wire, points: [0, 0, 1, 1])]
        return b
    }

    func item(_ id: String, done: Bool = false, photo: Bool = false, due: String? = nil, assignee: String? = nil) -> ChecklistItem {
        var i = ChecklistItem(id: id, text: id, requiresPhoto: photo)
        i.done = done; i.due = due; i.assignee = assignee
        return i
    }

    func testCounts() {
        var b = bundle()
        var old = Photo(projectId: "p", imageId: "c", width: 4, height: 3, takenAt: "2026-11-19T10:00:00.000Z"); old.deleted = true
        b.photos = [Photo(projectId: "p", imageId: "a", width: 4, height: 3, takenAt: "2026-11-17T10:00:00.000Z"),
                    Photo(projectId: "p", imageId: "b", width: 4, height: 3, takenAt: "2026-11-18T10:00:00.000Z"), old]
        var oldLog = JobLog(projectId: "p", date: "2026-11-18"); oldLog.deleted = true
        b.jobLogs = [JobLog(projectId: "p", date: "2026-11-15"), JobLog(projectId: "p", date: "2026-11-16"), oldLog]
        let s = JobSummary.make(b, today: today)
        XCTAssertEqual([s.sheets, s.devices, s.tentative, s.ledRuns], [1, 2, 1, 1])
        XCTAssertEqual(s.photos, 2)
        XCTAssertEqual(s.lastPhotoAt, "2026-11-18T10:00:00.000Z")
        XCTAssertEqual(s.logs, 2)
        XCTAssertEqual(s.lastLogDate, "2026-11-16")
    }

    func testChecklistsAndTasks() {
        var b = bundle()
        let c1 = Checklist(id: "c1", projectId: "p", name: "c1", items: [item("1", done: true, photo: true), item("2", done: true, photo: true), item("3", due: "2026-11-18")])
        let c2 = Checklist(id: "c2", projectId: "p", name: "c2", items: [item("4", due: today, assignee: "Alex"), item("5"), item("6", done: true, due: "2026-11-01")])
        var c3 = Checklist(id: "c3", projectId: "p", name: "c3", items: [item("7", due: "2026-11-01")]); c3.deleted = true
        b.checklists = [c1, c2, c3]
        var p = Photo(projectId: "p", imageId: "x", width: 4, height: 3); p.checklistId = "c1"; p.checklistItemId = "1"
        b.photos = [p]
        let s = JobSummary.make(b, today: today)
        XCTAssertEqual([s.checklists, s.itemsDone, s.itemsTotal, s.checklistPct, s.missingPhotos], [2, 2, 6, 33, 1])
        XCTAssertEqual([s.openTasks, s.overdueTasks, s.dueToday], [2, 1, 1])
        XCTAssertEqual(s.next, JobSummary.NextStep(kind: .overdueTasks, text: "1 overdue task", tab: "field"))
    }

    func testLatestProposalSkipsRevoked() {
        let s = JobSummary.make(bundle(), proposals: [
            .init(isReview: true, status: "viewed", createdAt: "2026-11-10T00:00:00Z"),
            .init(isReview: false, status: "declined", createdAt: "2026-11-12T00:00:00Z"),
            .init(isReview: false, status: "revoked", createdAt: "2026-11-14T00:00:00Z"),
        ], today: today)
        XCTAssertEqual(s.review?.status, "viewed")
        XCTAssertEqual(s.proposal?.status, "declined")
        XCTAssertEqual(s.next.kind, .reviseProposal)
    }

    func testPlansAndDevicesFirst() {
        var b = bundle(); b.sheets = []
        XCTAssertEqual(JobSummary.make(b, today: today).next.kind, .addPlans)
        b = bundle(); b.markers = []; b.runs = [Run(projectId: "p", sheetId: "s", kind: .wire, points: [])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.kind, .placeDevices)
        b.runs = [Run(projectId: "p", sheetId: "s", kind: .stair, points: [])]
        XCTAssertNotEqual(JobSummary.make(b, today: today).next.kind, .placeDevices)
    }

    func testEstimateSteps() {
        let b = bundle()
        let unpriced: (total: Double, unpriced: Int) = (0, 3)
        XCTAssertEqual(JobSummary.make(b, estimate: unpriced, today: today).next.text, "Finish pricing (3 lines without a price)")
        XCTAssertEqual(JobSummary.make(b, estimate: unpriced, proposals: [], today: today).next, .init(kind: .sendReview, text: "Send plan for review", tab: "takeoff"))
        XCTAssertEqual(JobSummary.make(b, estimate: unpriced, proposals: [.init(isReview: true, status: "sent", createdAt: "x")], today: today).next.kind, .priceEstimate)
        XCTAssertEqual(JobSummary.make(b, estimate: (1200, 0), today: today).next.kind, .sendProposal)
        XCTAssertEqual(JobSummary.make(b, estimate: (1200, 0), proposals: [.init(isReview: false, status: "viewed", createdAt: "x")], today: today).next.text, "Client viewed the quote — follow up")
        XCTAssertEqual(JobSummary.make(b, proposals: [.init(isReview: false, status: "accepted", createdAt: "x")], today: today).next.kind, .markApproved)
        var billed = b
        billed.project.billduDocs = [BillduDocRef(id: 1, type: "estimate", serial: nil, amount: 1200, percent: nil, label: nil, createdAt: "x")]
        XCTAssertEqual(JobSummary.make(billed, estimate: (1200, 0), today: today).next.kind, .awaitClient)
    }

    /// Next-step wording matches src/lib/jobSummary.ts (glossary: Quote, not proposal/estimate).
    func testQuoteWordingMatchesWeb() {
        let b = bundle()
        func text(_ status: String) -> String {
            JobSummary.make(b, estimate: (1200, 0), proposals: [.init(isReview: false, status: status, createdAt: "x")], today: today).next.text
        }
        XCTAssertEqual(JobSummary.make(b, estimate: (1200, 0), today: today).next.text, "Send the quote to the client")
        XCTAssertEqual(JobSummary.make(b, estimate: (0, 0), proposals: [.init(isReview: true, status: "sent", createdAt: "x")], today: today).next.text, "Finish pricing")
        XCTAssertEqual(text("viewed"), "Client viewed the quote — follow up")
        XCTAssertEqual(text("declined"), "Quote declined — revise and resend")
        XCTAssertEqual(text("accepted"), "Client approved the quote — mark the job approved")
        XCTAssertEqual(text("sent"), "Waiting on the client’s answer")
        var billed = b
        billed.project.billduDocs = [BillduDocRef(id: 1, type: "estimate", serial: nil, amount: 1200, percent: nil, label: nil, createdAt: "x")]
        XCTAssertEqual(JobSummary.make(billed, estimate: (1200, 0), today: today).next.text, "Quote sent — mark the job approved when the client signs")
    }

    func testApprovedSteps() {
        var b = bundle(status: .approved)
        XCTAssertEqual(JobSummary.make(b, today: today).next.kind, .startChecklist)
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", due: today)])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "1 task due today")
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", done: true, photo: true)])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "1 checklist item needs a photo")
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", done: true), item("2")])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "Finish checklists (1 of 2 done)")
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", done: true)])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.kind, .markInstalled)
    }

    func testInstalledSteps() {
        var b = bundle(status: .installed)
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", assignee: "Sam")])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "Close out 1 open task")
        b.checklists = []
        XCTAssertEqual(JobSummary.make(b, today: today).next.kind, .invoice)
        b.project.billduDocs = [BillduDocRef(id: 2, type: "invoice", serial: nil, amount: 10, percent: nil, label: nil, createdAt: "x")]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "All wrapped up")
        b.checklists = [Checklist(projectId: "p", name: "c", items: [item("1", due: "2026-11-01"), item("2", due: "2026-11-02"), item("3", due: "2026-11-03")])]
        XCTAssertEqual(JobSummary.make(b, today: today).next.text, "3 overdue tasks")
    }
}
