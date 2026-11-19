import XCTest
@testable import PinPlanCore

final class ChecklistTemplateTests: XCTestCase {
    private func job() -> Checklist {
        var a = ChecklistItem(text: "  Screen wall blocking  ", requiresPhoto: true)
        a.done = true; a.doneBy = "Mike"; a.doneAt = "2026-11-19T10:00:00Z"; a.assignee = "Jane"; a.due = "2026-11-20"; a.note = "left side"
        let b = ChecklistItem(text: "Projector power + HDMI")
        let blank = ChecklistItem(text: "   ")
        return Checklist(projectId: "p1", name: "Theater room", items: [a, b, blank])
    }

    func testSaveAsTemplateDropsJobState() {
        let t = FieldDocs.template(from: job(), name: "  Theater ", now: "2026-11-19T12:00:00Z")
        XCTAssertEqual(t.name, "Theater")
        XCTAssertEqual(t.items, [.init(text: "Screen wall blocking", requiresPhoto: true), .init(text: "Projector power + HDMI", requiresPhoto: false)])
        XCTAssertEqual(t.custom, true)
        XCTAssertEqual(t.createdAt, "2026-11-19T12:00:00Z")
        XCTAssertEqual(FieldDocs.template(from: job(), name: " ").name, "Theater room")
    }

    func testStartChecklistFromSavedTemplate() {
        let saved = FieldDocs.template(from: job(), name: "Theater")
        let all = FieldDocs.allTemplates(custom: [saved])
        XCTAssertEqual(all.count, FieldDocs.templates.count + 1)
        XCTAssertTrue(all[0].custom)
        let c = FieldDocs.checklist(from: all[0], projectId: "p2")
        XCTAssertEqual(c.projectId, "p2")
        XCTAssertEqual(c.name, "Theater")
        XCTAssertEqual(c.items.map(\.text), ["Screen wall blocking", "Projector power + HDMI"])
        XCTAssertEqual(c.items.map(\.requiresPhoto), [true, false])
        XCTAssertEqual(c.items.compactMap(\.done), [])
        XCTAssertEqual(c.items.compactMap(\.assignee), [])
    }

    func testSavedTemplatesListFirstAToZ() {
        let all = FieldDocs.allTemplates(custom: [ChecklistTemplate(id: "b", name: "Zone audio", items: []), ChecklistTemplate(id: "a", name: "Attic run", items: [])])
        XCTAssertEqual(all.prefix(2).map(\.name), ["Attic run", "Zone audio"])
        XCTAssertEqual(all.dropFirst(2).map(\.id), FieldDocs.templates.map(\.id))
        XCTAssertEqual(FieldDocs.allTemplates(custom: nil).map(\.id), FieldDocs.templates.map(\.id))
        XCTAssertFalse(FieldDocs.templates.contains { $0.custom })
    }

    func testNormalizeDropsBrokenEntries() {
        let raw = [
            ChecklistTemplate(id: "x", name: " Gate ", items: [.init(text: " Keypad "), .init(text: "")]),
            ChecklistTemplate(id: "x", name: "Duplicate", items: []),
            ChecklistTemplate(id: "", name: "No id", items: []),
            ChecklistTemplate(id: "y", name: "  ", items: []),
        ]
        let n = FieldDocs.normalizeTemplates(raw)
        XCTAssertEqual(n.map(\.id), ["x"])
        XCTAssertEqual(n[0].name, "Gate")
        XCTAssertEqual(n[0].items, [.init(text: "Keypad", requiresPhoto: false)])
    }

    func testUniqueNamesRenameAndRemove() {
        let list = [ChecklistTemplate(id: "a", name: "Trim-out", items: []), ChecklistTemplate(id: "b", name: "Trim-out (2)", items: [])]
        XCTAssertEqual(FieldDocs.uniqueTemplateName("trim-out", existing: list), "trim-out (3)")
        XCTAssertEqual(FieldDocs.uniqueTemplateName("Gate", existing: list), "Gate")
        XCTAssertEqual(FieldDocs.uniqueTemplateName("Trim-out", existing: list, exceptId: "a"), "Trim-out")
        XCTAssertEqual(FieldDocs.addTemplate(list, ChecklistTemplate(id: "c", name: "Trim-out", items: [])).map(\.name), ["Trim-out", "Trim-out (2)", "Trim-out (3)"])

        let renamed = FieldDocs.renameTemplate(list, id: "a", name: " Driveway gate ", now: "2026-11-19T13:00:00Z")
        XCTAssertEqual(renamed[0].name, "Driveway gate")
        XCTAssertEqual(renamed[0].updatedAt, "2026-11-19T13:00:00Z")
        XCTAssertEqual(FieldDocs.renameTemplate(list, id: "a", name: "trim-out (2)").first?.name, "trim-out (2) (2)")
        XCTAssertEqual(FieldDocs.renameTemplate(list, id: "a", name: "  "), list)
        XCTAssertEqual(FieldDocs.renameTemplate(list, id: "nope", name: "X"), list)
        XCTAssertEqual(FieldDocs.removeTemplate(list, id: "a").map(\.id), ["b"])
    }

    func testDecodesWebJSONAndToleratesBadFields() throws {
        let json = #"[{"id":"t1","name":"Gate","items":[{"text":"Keypad","requiresPhoto":true},{"text":"Loop detector"}],"custom":true,"createdAt":"2026-11-19T12:00:00Z"},{"id":"t2","name":"Bad","items":"oops","custom":"yes"}]"#
        let ts = try JSONDecoder().decode([ChecklistTemplate].self, from: Data(json.utf8))
        XCTAssertEqual(ts.count, 2)
        XCTAssertEqual(ts[0].items.map(\.text), ["Keypad", "Loop detector"])
        XCTAssertEqual(ts[0].items.map(\.requiresPhoto), [true, nil])
        XCTAssertEqual(FieldDocs.normalizeTemplates(ts).map(\.id), ["t1", "t2"])
        XCTAssertEqual(ts[1].items, [])
        XCTAssertNil(ts[1].custom)
        // Round trip keeps the web shape.
        let back = try JSONDecoder().decode([ChecklistTemplate].self, from: JSONEncoder().encode(ts))
        XCTAssertEqual(back, ts)
    }
}
