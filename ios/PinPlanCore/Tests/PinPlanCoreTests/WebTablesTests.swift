import XCTest
@testable import PinPlanCore

/// The web-made tables this app pulls: each decodes from the server's row shape (through SyncMap) and leniently.
final class WebTablesTests: XCTestCase {
    func job() -> SyncState {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "Client", address: "1 Test St"))
        b.sheets = [Sheet(id: "s1", projectId: "p1", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img1", width: 1000, height: 800)]
        return SyncState(bundles: [b], catalog: [], products: [])
    }

    /// Merge a server row and return the bundle.
    func pull(_ t: SyncTable, _ row: [String: Any]) -> (SyncState.MergeResult, ProjectBundle) {
        var s = job()
        var l = SyncLedger()
        var r = row
        r["project_id"] = "p1"
        r["created_at"] = "2026-11-15 17:00:00+00"
        r["updated_at"] = "2026-11-15 17:00:00+00"
        r["synced_at"] = "2026-11-15 17:00:00+00"
        r["deleted"] = false
        let result = s.merge(t, remote: r, ledger: &l)
        return (result, s.bundles["p1"]!)
    }

    func testPlanMarkups() {
        let (r, b) = pull(.planMarkups, ["id": "k1", "sheet_id": "s1", "kind": "cloud", "points": [0.1, 0.1, 0.2, 0.2], "color": "#dc2626",
                                          "width": 0.002, "layer": "Redlines", "private": false, "author": "Sam", "author_id": NSNull(), "text": NSNull()])
        XCTAssertEqual(r, .applied)
        XCTAssertEqual(b.livePlanMarkups.first?.kind, .cloud)
        XCTAssertEqual(b.livePlanMarkups.first?.points.count, 4)
        XCTAssertEqual(b.livePlanMarkups.first?.author, "Sam")
        // A kind from a newer web app still loads.
        let (r2, b2) = pull(.planMarkups, ["id": "k2", "sheet_id": "s1", "kind": "polygon", "points": NSNull(), "layer": "Notes"])
        XCTAssertEqual(r2, .applied)
        XCTAssertEqual(b2.planMarkups.first?.kind, .pen)
        XCTAssertEqual(b2.planMarkups.first?.points, [])
    }

    func testScheduleItems() {
        let (r, b) = pull(.scheduleItems, ["id": "si1", "name": "Rough-in", "phase": "rough", "start_date": "2026-11-20", "end_date": "2026-11-24",
                                            "crew": ["Alex"], "hours_planned": 32, "progress": 25, "depends_on": [["id": "si0", "lagDays": 1], ["bad": true]],
                                            "sort_order": 2, "workdays_only": true])
        XCTAssertEqual(r, .applied)
        let i = b.liveScheduleItems.first
        XCTAssertEqual(i?.start, "2026-11-20")
        XCTAssertEqual(i?.end, "2026-11-24")
        XCTAssertEqual(i?.hoursPlanned, 32)
        XCTAssertEqual(i?.dependsOn, [ScheduleDep(id: "si0", lagDays: 1)])
        XCTAssertEqual(i?.workdaysOnly, true)
    }

    func testRfis() {
        let (r, b) = pull(.rfis, ["id": "q1", "number": 7, "subject": "Panel location", "question": "Garage or basement?", "status": "answered",
                                  "ball_in_court": "us", "cc": ["gc@example.com"], "answer": "Garage", "answered_at": "2026-11-16 10:00:00+00",
                                  "sender": ["company": "Example Electric Co"]])
        XCTAssertEqual(r, .applied)
        let q = b.liveRfis.first
        XCTAssertEqual(q?.label, "RFI-007")
        XCTAssertEqual(q?.status, .answered)
        XCTAssertEqual(q?.answeredAt, "2026-11-16T10:00:00.000Z")
        XCTAssertEqual(q?.sender?.company, "Example Electric Co")
        let (_, b2) = pull(.rfis, ["id": "q2", "number": 8.0, "subject": "x", "question": "y", "status": "escalated", "ball_in_court": "them"])
        XCTAssertEqual(b2.rfis.first?.status, .open)
        XCTAssertEqual(b2.rfis.first?.number, 8)
    }

    func testMeasurements() {
        let (r, b) = pull(.measurements, ["id": "ms1", "sheet_id": "s1", "kind": "area", "points": [0, 0, 1, 0, 1, 1], "label": "Drop ceiling",
                                          "extra_ft": NSNull(), "waste_pct": 10])
        XCTAssertEqual(r, .applied)
        XCTAssertEqual(b.liveMeasurements.first?.kind, .area)
        XCTAssertEqual(b.liveMeasurements.first?.wastePct, 10)
    }

    func testSheetLinksIgnoreUnknownTargets() {
        var s = job()
        var l = SyncLedger()
        for (id, target) in [("l1", ["kind": "sheet", "sheetId": "s1", "x": 0.5]), ("l2", ["kind": "model3d", "modelId": "m"]), ("l3", ["kind": "url", "url": "https://example.com"])] as [(String, [String: Any])] {
            let row: [String: Any] = ["id": id, "project_id": "p1", "sheet_id": "s1", "x": 0.1, "y": 0.1, "w": 0.05, "h": 0.05, "target": target,
                                      "auto": true, "updated_at": "2026-11-15 17:00:00+00", "created_at": "2026-11-15 17:00:00+00"]
            XCTAssertEqual(s.merge(.sheetLinks, remote: row, ledger: &l), .applied, id)
        }
        let b = s.bundles["p1"]!
        XCTAssertEqual(b.sheetLinks.count, 3, "an unknown target kind is kept (and written back unchanged)…")
        XCTAssertEqual(b.liveSheetLinks.map(\.id), ["l1", "l3"], "…but not shown")
        XCTAssertEqual(b.liveSheetLinks.first?.target.x, 0.5)
    }

    func testSalesDocsAndPayments() {
        let (r, b) = pull(.salesDocs, ["id": "d1", "kind": "invoice", "number": "INV-0007", "status": "partially_paid", "issue_date": "2026-11-01",
                                       "due_date": "2026-11-15", "client": ["name": "Jane", "email": NSNull()], "lines": [["id": "l", "description": "Camera", "qty": 2, "unitPrice": 100, "taxable": true], ["id": "h", "kind": "section", "description": "Outside"]],
                                       "taxes": [], "currency": "USD", "subtotal": 200, "discount_total": 0, "tax_total": 16, "total": 216,
                                       "amount_paid": 100, "balance_due": 116, "source": "estimate", "options": ["detail": "lines"], "sent_at": "2026-11-01 09:00:00+00"])
        XCTAssertEqual(r, .applied)
        let d = b.liveSalesDocs.first!
        XCTAssertEqual(d.kind, .invoice)
        XCTAssertEqual(d.status, .partiallyPaid)
        XCTAssertEqual(d.balanceDue, 116)
        XCTAssertEqual(d.itemCount, 1)
        XCTAssertEqual(d.client.name, "Jane")
        XCTAssertEqual(d.sentAt, "2026-11-01T09:00:00.000Z")
        XCTAssertEqual(SalesDocs.name(d), "INV-0007")
        let (r2, b2) = pull(.salesPayments, ["id": "pay1", "document_id": "d1", "amount": 100, "paid_on": "2026-11-05", "method": "check", "voided": false])
        XCTAssertEqual(r2, .applied)
        XCTAssertEqual(b2.liveSalesPayments.first?.date, "2026-11-05")
        XCTAssertEqual(b2.liveSalesPayments.first?.amount, 100)
        // Unknown kinds and statuses load and never count as invoiced.
        let (_, b3) = pull(.salesDocs, ["id": "d2", "kind": "receipt", "status": "archived", "total": 50])
        XCTAssertEqual(b3.salesDocs.first?.kind, .quote)
        XCTAssertEqual(b3.salesDocs.first?.status, .draft)
        XCTAssertEqual(SalesDocs.totals(b3.salesDocs).invoiced, 0)
    }

    func testDisplayStatusAndTotals() {
        let day = "2026-11-19"
        var inv = SalesDoc(id: "i1", projectId: "p", kind: .invoice, status: .sent, total: 108)
        inv.subtotal = 100; inv.dueDate = "2026-11-18"; inv.balanceDue = 108; inv.number = "INV-1"; inv.sentAt = "2026-11-01T09:00:00.000Z"
        XCTAssertEqual(SalesDocs.displayStatus(inv, day: day), .overdue)
        inv.dueDate = "2026-11-19"
        XCTAssertEqual(SalesDocs.displayStatus(inv, day: day), .sent)
        var q = SalesDoc(id: "q1", projectId: "p", kind: .quote, status: .viewed, total: 500)
        q.validUntil = "2026-11-01"
        XCTAssertEqual(SalesDocs.displayStatus(q, day: day), .expired)
        q.status = .accepted
        XCTAssertEqual(SalesDocs.displayStatus(q, day: day), .accepted)
        XCTAssertEqual(SalesDocs.displayStatus(SalesDoc(projectId: "p", kind: .invoice), day: day).label, "Draft")
        XCTAssertEqual(SalesDocs.name(SalesDoc(projectId: "p", kind: .invoice)), "Draft invoice")
        XCTAssertEqual(SalesDocs.name(SalesDoc(projectId: "p", kind: .creditNote, status: .sent)), "Credit note (number pending)")

        var paid = SalesDoc(id: "i2", projectId: "p", kind: .invoice, status: .paid, total: 54)
        paid.subtotal = 50; paid.balanceDue = 0
        var credit = SalesDoc(id: "c1", projectId: "p", kind: .creditNote, status: .sent, total: 10.8)
        credit.subtotal = 10
        let draft = SalesDoc(id: "i3", projectId: "p", kind: .invoice, status: .draft, total: 999)
        var void = SalesDoc(id: "i4", projectId: "p", kind: .invoice, status: .void, total: 999)
        void.subtotal = 999
        var deleted = paid
        deleted.id = "i5"; deleted.deleted = true
        let t = SalesDocs.totals([inv, paid, credit, draft, void, deleted, q])
        XCTAssertEqual(t.invoiced, 162, accuracy: 0.001)
        XCTAssertEqual(t.credited, 10.8, accuracy: 0.001)
        XCTAssertEqual(t.balanceDue, 108, accuracy: 0.001)
        XCTAssertEqual(t.paid, 43.2, accuracy: 0.001)
        XCTAssertEqual(t.quotedAccepted, 500)
        XCTAssertEqual(t.invoicedBeforeTax, 140, accuracy: 0.001)
        XCTAssertEqual(SalesDocs.money(1234.5, currency: "USD"), "$1,234.50")
    }

    func testBackupKeepsListsItDoesntKnow() throws {
        let json = """
        {"format":"pinplan-backup","version":1,"exportedAt":"2026-11-19T00:00:00Z","catalog":[],"projects":[{
          "project":{"id":"p1","clientName":"C","address":"1 Test St","status":"estimate","billduDocs":[],"createdAt":"x","updatedAt":"x"},
          "sheets":[],"markers":[],"runs":[],"closets":[],"estimateLines":[],"images":[],
          "changeOrders":[{"id":"co1","number":1,"lines":[{"qty":2}],"status":"draft"}],
          "rfis":[{"id":"q1","projectId":"p1","number":3,"subject":"S","question":"Q","status":"open","ballInCourt":"them","createdAt":"x","updatedAt":"x"}],
          "salesDocs":[{"id":"d1","projectId":"p1","kind":"invoice","status":"sent","total":10,"createdAt":"x","updatedAt":"x"}],
          "someFlag":true
        }]}
        """
        let f = try BackupFile.decode(Data(json.utf8))
        let b = f.projects[0].bundle
        XCTAssertEqual(b.rfis.first?.number, 3)
        XCTAssertEqual(b.salesDocs.first?.kind, .invoice)
        XCTAssertEqual(Array(b.otherArrays.keys), ["changeOrders"], "only unknown lists are kept")
        // Saved on this device and backed up again: the change orders go out exactly as they came.
        let saved = try JSONDecoder().decode(ProjectBundle.self, from: JSONEncoder().encode(b))
        XCTAssertEqual(saved.otherArrays, b.otherArrays)
        XCTAssertEqual(saved, b)
        let again = BackupFile(catalog: [], projects: [BackupFile.ProjectEntry(bundle: saved, images: [])])
        let out = try JSONSerialization.jsonObject(with: again.encoded()) as! [String: Any]
        let entry = (out["projects"] as! [[String: Any]])[0]
        let co = (entry["changeOrders"] as? [[String: Any]])?.first
        XCTAssertEqual(co?["id"] as? String, "co1")
        XCTAssertEqual((co?["lines"] as? [[String: Any]])?.first?["qty"] as? Double, 2)
        XCTAssertEqual((entry["rfis"] as? [[String: Any]])?.first?["id"] as? String, "q1")
        XCTAssertNil(entry["someFlag"], "only lists are kept")
        // A job with none of the web lists writes the same keys as before.
        let plain = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ProjectBundle(project: Project(id: "p", clientName: "", address: "")))) as! [String: Any]
        XCTAssertEqual(Set(plain.keys), ["project", "sheets", "markers", "runs", "closets", "estimateLines", "photos", "photoComments", "checklists", "jobLogs", "documents", "forms", "tasks"])
    }
}

final class PanelScheduleTextTests: XCTestCase {
    func testNumbersAndTotals() {
        XCTAssertEqual(PanelSchedule.number(20), "20")
        XCTAssertEqual(PanelSchedule.number(1.5), "1.5")
        XCTAssertEqual(PanelSchedule.number(nil), "")
        let p = PanelSchedule.Panel(closetId: "c", name: "Panel A", kind: .panel, floor: "1st Fl", circuits: [], totalVA: 3600, amps240: 15)
        XCTAssertEqual(PanelSchedule.totalLine(p), "0 devices · 3600 VA · 15 A at 240 V")
    }
}

final class BillingEditTests: XCTestCase {
    func testLapsedTeamsCantEditLocally() {
        let now = TeamLogic.parseDate("2026-11-19T12:00:00Z")!
        XCTAssertTrue(BillingLogic.canEdit(nil, now: now), "solo or unknown never locks")
        XCTAssertTrue(BillingLogic.canEdit(TeamBilling(status: .active, now: now), now: now))
        XCTAssertTrue(BillingLogic.canEdit(TeamBilling(status: .pastDue, now: now), now: now))
        XCTAssertTrue(BillingLogic.canEdit(TeamBilling(status: .trialing, trialEndsAt: "2026-11-20T00:00:00Z", now: now), now: now))
        let ended = TeamBilling(status: .trialing, trialEndsAt: "2026-11-18T00:00:00Z", now: now)
        XCTAssertFalse(BillingLogic.canEdit(ended, now: now))
        XCTAssertFalse(BillingLogic.canEdit(TeamBilling(status: .canceled, now: now), now: now))
        XCTAssertNil(BillingLogic.editBlockedMessage(TeamBilling(status: .active, now: now), role: .owner, now: now))
        let owner = BillingLogic.editBlockedMessage(ended, role: .owner, now: now) ?? ""
        XCTAssertTrue(owner.hasPrefix("Your free trial has ended, so jobs are read-only"))
        XCTAssertTrue(owner.contains("on the web"))
        XCTAssertFalse(owner.lowercased().contains("subscribe"), "no selling in the app")
        let tech = BillingLogic.editBlockedMessage(TeamBilling(status: .unpaid, now: now), role: .tech, now: now) ?? ""
        XCTAssertTrue(tech.hasPrefix("Your Northpin subscription is inactive"))
        XCTAssertTrue(tech.hasSuffix(BillingLogic.askOfficeText))
    }
}

final class JobSummaryTechTests: XCTestCase {
    let today = "2026-11-19"

    func bundle(_ status: ProjectStatus) -> ProjectBundle {
        var p = Project(id: "p", clientName: "", address: "")
        p.status = status
        var b = ProjectBundle(project: p)
        b.sheets = [Sheet(id: "s", projectId: "p", name: "1", pageNumber: 1, order: 0, imageId: "i", width: 10, height: 10)]
        b.markers = [Marker(id: "m1", projectId: "p", sheetId: "s", deviceTypeId: "cam", x: 0, y: 0, label: "a")]
        return b
    }

    /// Same cases as "jobSummary for technicians (no prices)" in tests/jobSummary.test.ts.
    func testTechniciansNeverGetPricingSteps() {
        let declined = [JobSummary.ProposalInfo(isReview: false, status: "declined", createdAt: "2026-11-18T00:00:00Z")]
        let est = JobSummary.make(bundle(.estimate), estimate: (total: 0, unpriced: 3), proposals: declined, today: today, prices: false)
        XCTAssertEqual(est.next.kind, .officePricing)
        XCTAssertEqual(est.next.tab, "plan")
        var withTask = bundle(.estimate)
        var task = PlanTask(projectId: "p", number: 1, title: "Rough-in")
        task.due = today
        withTask.tasks = [task]
        let due = JobSummary.make(withTask, today: today, prices: false)
        XCTAssertEqual(due.next.kind, .tasksToday)
        XCTAssertEqual(due.next.tab, "tasks")
        XCTAssertEqual(JobSummary.make(bundle(.installed), today: today, prices: false).next.kind, .done)
        XCTAssertEqual(JobSummary.make(bundle(.approved), today: today, prices: false).next.kind, .startChecklist)
        // The office still gets the pricing steps.
        XCTAssertEqual(JobSummary.make(bundle(.estimate), estimate: (total: 0, unpriced: 3), today: today).next.kind, .priceEstimate)
        XCTAssertEqual(JobSummary.make(bundle(.installed), today: today).next.kind, .invoice)
    }
}
