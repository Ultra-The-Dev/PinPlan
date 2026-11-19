import XCTest
@testable import PinPlanCore

/// Same cases as the web app's tests/forms.test.ts.
final class FormsTests: XCTestCase {
    let now = "2026-11-19T15:00:00.000Z"
    var tm: FormTemplate { Forms.builtins.first { $0.id == "tm_tag" }! }
    var cable: FormTemplate { Forms.builtins.first { $0.id == "lv_cable_test" }! }
    var panel: FormTemplate { Forms.builtins.first { $0.id == "panel_inspection" }! }

    let simple = FormTemplate(id: "t", name: "Simple", category: "other", fields: [
        FormField(id: "h", type: .heading, label: "Section"),
        FormField(id: "name", type: .text, label: "Name", required: true),
        FormField(id: "volts", type: .number, label: "Volts", min: 100, max: 130),
        FormField(id: "ok", type: .yesno, label: "OK", required: true),
        FormField(id: "pick", type: .select, label: "Pick", options: ["A", "B"]),
        FormField(id: "agree", type: .checkbox, label: "Agree", required: true),
        FormField(id: "sig", type: .signature, label: "Sign", required: true),
        FormField(id: "rows", type: .table, label: "Rows", required: true, columns: [
            FormField(id: "a", type: .text, label: "A", required: true), FormField(id: "n", type: .number, label: "N", min: 0),
        ]),
        FormField(id: "total", type: .calc, label: "Total", calc: FormCalc(op: "sum", of: "rows.n")),
    ])

    func form(_ t: FormTemplate, _ values: [String: JSONValue] = [:]) -> JobForm {
        var f = Forms.newForm(t, projectId: "p1", by: "Mike", now: now)
        for (k, v) in values { f.values[k] = v }
        return f
    }
    func row(_ pairs: [String: JSONValue]) -> JSONValue { .object(pairs) }
    func sig(_ id: String) -> FormSignature { FormSignature(fieldId: id, name: "J", imageId: "i", signedAt: now) }

    func testBuiltinsMatchTheWebFixture() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../tests/fixtures/formBuiltins.json").standardized
        let web = try JSONDecoder().decode([FormTemplate].self, from: Data(contentsOf: url))
        XCTAssertEqual(Forms.builtins.count, 7)
        XCTAssertEqual(Forms.builtins, web)
        for t in Forms.builtins {
            XCTAssertEqual(Forms.validateTemplate(t), [], t.name)
            XCTAssertEqual(t.builtin, true)
        }
    }

    func testNumbersAcceptADecimalComma() {
        XCTAssertEqual(Forms.parseNumber("12,5"), 12.5)
        XCTAssertEqual(Forms.parseNumber("1,234.5"), 1234.5)
        XCTAssertEqual(Forms.parseNumber("1,234,567"), 1234567)
        XCTAssertEqual(Forms.parseNumber("-.5"), -0.5)
        XCTAssertNil(Forms.parseNumber("12a"))
        XCTAssertNil(Forms.parseNumber(""))
        XCTAssertEqual(Forms.formatNumber(4), "4")
        XCTAssertEqual(Forms.formatNumber(2.5), "2.5")
    }

    func testValidateRequiredAndTables() {
        XCTAssertEqual(Forms.validate(form(simple)).map(\.fieldId), ["name", "ok", "agree", "sig", "rows"])
        var f = form(simple, ["name": .string("x"), "ok": .string("na"), "agree": .bool(true), "volts": .string("99,5"), "pick": .string("C"),
                              "rows": .array([row(["_id": .string("1"), "a": .string("ok"), "n": .number(2)]), row(["_id": .string("2")]), row(["_id": .string("3"), "n": .string("-1")])])])
        f.signatures = [sig("sig")]
        XCTAssertEqual(Forms.validate(f), [
            Forms.Issue(fieldId: "volts", message: "Must be at least 100"),
            Forms.Issue(fieldId: "pick", message: "Pick one of the options"),
            Forms.Issue(fieldId: "rows", message: "Row 3: A — required", row: 2, columnId: "a"),
            Forms.Issue(fieldId: "rows", message: "Row 3: N — must be at least 0", row: 2, columnId: "n"),
        ])
        f.values["volts"] = .number(131)
        XCTAssertEqual(Forms.validate(f).first, Forms.Issue(fieldId: "volts", message: "Must be 130 or less"))
    }

    func testTMTagNeedsBothSignatures() {
        var f = form(tm, ["date": .string("2026-11-19"), "description": .string("Moved 2 cameras"), "labor": .array([row(["_id": .string("a"), "name": .string("Mike"), "hours": .number(2)])])])
        XCTAssertEqual(Forms.validate(f).map(\.fieldId), ["sig_customer", "sig_ours"])
        f.signatures = [sig("sig_customer"), sig("sig_ours")]
        XCTAssertEqual(Forms.validate(f), [])
    }

    func testCalcs() {
        let f = form(tm, ["labor": .array([row(["name": .string("Mike"), "hours": .number(2.5)]), row(["name": .string("Ana"), "hours": .string("1,5")]), row(["hours": .string("")])]),
                          "materials": .array([row(["item": .string("Cat6"), "qty": .number(3)])])])
        let c = Forms.computeCalcs(f.template, f.values)
        XCTAssertEqual(c["total_hours"] ?? nil, 4)
        XCTAssertEqual(c["total_materials"] ?? nil, 3)
        let t = form(cable, ["cables": .array([row(["label": .string("D1"), "length": .number(100), "pass": .string("yes")]), row(["label": .string("D2"), "length": .number(50), "pass": .string("no")]), row(["pass": .string("no")])])])
        let tc = Forms.computeCalcs(t.template, t.values)
        XCTAssertEqual(tc["failures"] ?? nil, 2)
        XCTAssertEqual(tc["total_length"] ?? nil, 150)
        XCTAssertEqual(Forms.computeCalc(simple, ["rows": .array([])], FormCalc(op: "avg", of: "rows.n")), nil)
        XCTAssertEqual(Forms.computeCalc(simple, ["rows": .array([row(["n": .number(1)]), row(["n": .number(4)])])], FormCalc(op: "max", of: "rows.n")), 4)
    }

    func testProgress() {
        var f = form(simple, ["name": .string("x"), "ok": .string("no"), "rows": .array([row(["a": .string("1")])])])
        // simple here has no multiselect, so 7 answerable fields
        XCTAssertEqual(Forms.progress(f), Forms.Progress(answered: 3, total: 7, required: 5, requiredDone: 3, pct: 43))
        f.signatures = [sig("sig")]
        XCTAssertEqual(Forms.progress(f).requiredDone, 4)
    }

    func testFailedItemsAndPunchList() {
        let f = form(panel, ["cover": .string("yes"), "directory": .string("no"), "clearance": .string("no")])
        XCTAssertEqual(Forms.failedItems(f).map(\.text), ["Circuit directory filled in — No", "Working clearance kept clear — No"])
        let c = form(cable, ["cables": .array([row(["label": .string("D7"), "pass": .string("no")]), row(["pass": .string("no")])])])
        XCTAssertEqual(Forms.failedItems(c).map(\.text), ["Cables: D7 — Pass: No", "Cables: Row 2 — Pass: No"])
        let first = Forms.punchItems(from: f, checklists: [])
        XCTAssertTrue(first.created)
        XCTAssertEqual(first.checklist.name, "Punch list")
        XCTAssertEqual(first.added.count, 2)
        let again = Forms.punchItems(from: f, checklists: [first.checklist])
        XCTAssertEqual(again.added.count, 0)
        XCTAssertFalse(again.created)
    }

    func testPermissionsAndReopen() {
        let draft = form(simple)
        let done = Forms.submit(draft, by: "Mike", now: now)
        for r: TeamRole? in [nil, .owner, .admin, .tech] {
            XCTAssertTrue(Forms.canEdit(r, draft))
            XCTAssertFalse(Forms.canEdit(r, done))
        }
        XCTAssertEqual([nil, .owner, .admin, .tech].map { Forms.canReopen($0, done) }, [true, true, true, false])
        XCTAssertFalse(Forms.canReopen(.admin, draft))
        XCTAssertEqual([nil, .owner, .admin, .tech].map { Forms.canDelete($0, done) }, [true, true, true, false])
        XCTAssertTrue(Forms.canDelete(.tech, draft))
        XCTAssertFalse(Forms.canEditTemplates(.tech))
        let r = Forms.reopen(done, by: "Office", now: "2026-11-20T10:00:00.000Z", reason: "wrong hours")
        XCTAssertEqual(r.status, "draft")
        XCTAssertNil(r.submittedAt)
        XCTAssertEqual(Forms.history(r), [Forms.HistoryNote(at: "2026-11-20T10:00:00.000Z", by: "Office", text: "Reopened (submitted 2026-11-19 by Mike): wrong hours")])
    }

    func testValidateTemplateRejectsDuplicatesAndBadCalcs() {
        var dup = simple
        dup.fields.append(FormField(id: "name", type: .text, label: "Again"))
        XCTAssertTrue(Forms.validateTemplate(dup).contains("Two fields share the id “name”"))
        var bad = simple
        bad.fields.append(FormField(id: "c2", type: .calc, label: "Bad", calc: FormCalc(op: "sum", of: "rows.zzz")))
        XCTAssertEqual(Forms.validateTemplate(bad), ["Calculation “Bad” refers to “rows.zzz”, which isn't on the form"])
        let wide = FormTemplate(id: "w", name: "W", category: "other", fields: [FormField(id: "t", type: .table, label: "Wide", columns: (0..<9).map { FormField(id: "c\($0)", type: .text, label: "C\($0)") })])
        XCTAssertEqual(Forms.validateTemplate(wide), ["Table “Wide” has more than 8 columns"])
        XCTAssertEqual(Forms.validateTemplate(simple), [])
    }

    func testDecodingToleratesUnknownAndMissingFields() throws {
        let json = #"{"id":"f1","projectId":"p","template":{"id":"t","name":"X","fields":[{"id":"a","type":"hologram","label":"A","extra":1}],"future":true},"values":{"a":"x","n":2,"t":[{"_id":"r","ok":"no"}],"b":true},"somethingNew":[1,2]}"#
        let f = try JSONDecoder().decode(JobForm.self, from: Data(json.utf8))
        XCTAssertEqual(f.status, "draft")
        XCTAssertEqual(f.template.version, 1)
        XCTAssertEqual(f.template.category, "other")
        XCTAssertNil(f.template.fields[0].kind)
        XCTAssertEqual(f.template.fields[0].type, "hologram")
        XCTAssertEqual(f.values["n"], .number(2))
        XCTAssertEqual(f.values["b"], .bool(true))
        XCTAssertEqual(Forms.tableRows(f.values["t"]).first?["ok"], .string("no"))
        // Round trip keeps the unknown type.
        let back = try JSONDecoder().decode(JobForm.self, from: JSONEncoder().encode(f))
        XCTAssertEqual(back, f)
    }

    func testSyncMapping() throws {
        var f = Forms.submit(form(tm, ["labor": .array([row(["name": .string("Mike"), "hours": .number(2)])])]), by: "Mike", now: now)
        f.sheetId = "s1"; f.x = 0.25; f.y = 0.75
        f.signatures = [FormSignature(fieldId: "sig_ours", name: "Mike", imageId: "img", signedAt: now)]
        var b = ProjectBundle(project: Project(id: "p1", clientName: "c", address: "a"))
        b.forms = [f]
        let rows = SyncState(bundles: [b], catalog: [], products: []).rows().filter { $0.table == .forms }
        XCTAssertEqual(rows.count, 1)
        let remote = SyncMap.toRemote(.forms, rows[0].json)
        XCTAssertEqual(remote["template_id"] as? String, "tm_tag")
        XCTAssertEqual(remote["status"] as? String, "submitted")
        XCTAssertEqual(remote["sheet_id"] as? String, "s1")
        XCTAssertNotNil(remote["values"] as? [String: Any])
        XCTAssertTrue(remote["marker_id"] is NSNull)
        var state = SyncState(bundles: [ProjectBundle(project: b.project)], catalog: [], products: [])
        var ledger = SyncLedger()
        var r = remote
        r["submitted_at"] = "2026-11-19 15:00:00+00"
        XCTAssertEqual(state.merge(.forms, remote: r, ledger: &ledger), .applied)
        let got = state.bundles["p1"]!.forms[0]
        XCTAssertEqual(got.submittedAt, now)
        XCTAssertEqual(got.values, f.values)
        XCTAssertEqual(got.template, f.template)
        XCTAssertEqual(got.signatures, f.signatures)
        XCTAssertTrue(SyncMap.pushOrder.contains(.forms))
    }
}
