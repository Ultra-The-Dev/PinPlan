import XCTest
@testable import PinPlanCore

final class CompanySetupTests: XCTestCase {
    let t0 = "2026-11-20T10:00:00.000Z"
    let t1 = "2026-11-21T10:00:00.000Z"
    let t2 = "2026-11-22T10:00:00.000Z"

    func fresh() -> CompanyPrefsValues { CompanyPrefsValues.fresh }

    /// The database's merge (merge_preferences): a newer section replaces the older one, others stay.
    func merge(_ old: [String: Any], _ new: [String: [String: Any]]) -> [String: Any] {
        var out = old
        for (k, v) in new {
            guard let s = CompanyPrefs.section(v), let at = CompanySync.parseTime(s.updatedAt) else { continue }
            let prev = CompanyPrefs.section(out[k]).flatMap { CompanySync.parseTime($0.updatedAt) }
            if prev == nil || at > prev! { out[k] = v }
        }
        return out
    }

    // MARK: business details

    func testDetailsRowRoundTrip() {
        var b = BusinessSettings()
        b.name = " Acme Low Voltage "; b.phone = "555-0100"; b.email = "office@example.com"; b.estimateTerms = "Net 30"; b.logo = "/brand/x.png"
        let c = CompanyDetails(business: b)
        XCTAssertEqual(c.name, "Acme Low Voltage")
        let row = c.row(ownerId: "o1", updatedAt: t0)
        XCTAssertEqual(row["business_name"] as? String, "Acme Low Voltage")
        XCTAssertTrue(row["logo_image_id"] is NSNull)
        XCTAssertEqual(CompanyDetails(row: row), c)
        let applied = c.applied(to: BusinessSettings())
        XCTAssertEqual(applied.name, "Acme Low Voltage")
        XCTAssertEqual(applied.estimateTerms, "Net 30")
        XCTAssertEqual(applied.logo, "/brand/x.png")
    }

    func testDetailsActionMatchesTheWebRules() {
        let mine = CompanyDetails(name: "Mine")
        let theirs = CompanyDetails(name: "Company")
        // A new device signs in: the company's details come down.
        XCTAssertEqual(CompanySync.detailsAction(local: CompanyDetails(), localSavedAt: t2, mark: nil, remote: theirs, remoteUpdatedAt: t0, canWrite: true), .pull)
        // First sync with something already here: the company's copy wins.
        XCTAssertEqual(CompanySync.detailsAction(local: mine, localSavedAt: t2, mark: nil, remote: theirs, remoteUpdatedAt: t0, canWrite: true), .pull)
        // No company copy yet: the first device with a name sends it; a blank one doesn't.
        XCTAssertEqual(CompanySync.detailsAction(local: mine, localSavedAt: t0, mark: nil, remote: nil, remoteUpdatedAt: nil, canWrite: true), .push)
        XCTAssertEqual(CompanySync.detailsAction(local: CompanyDetails(), localSavedAt: t0, mark: nil, remote: nil, remoteUpdatedAt: nil, canWrite: true), .none)
        // Technicians only read.
        XCTAssertEqual(CompanySync.detailsAction(local: mine, localSavedAt: t2, mark: nil, remote: nil, remoteUpdatedAt: nil, canWrite: false), .none)
        // Changed here since the last sync, and newer: send it; older: take the company's.
        let mark = CompanyDetailsMark(userId: "u", updatedAt: t0, values: theirs)
        XCTAssertEqual(CompanySync.detailsAction(local: mine, localSavedAt: t2, mark: mark, remote: CompanyDetails(name: "Other"), remoteUpdatedAt: t1, canWrite: true), .push)
        XCTAssertEqual(CompanySync.detailsAction(local: mine, localSavedAt: t0, mark: mark, remote: CompanyDetails(name: "Other"), remoteUpdatedAt: t1, canWrite: true), .pull)
    }

    func testABigLogoIsKeptAsAFingerprintInTheRecord() {
        let logo = "data:image/png;base64," + String(repeating: "A", count: 5000)
        let c = CompanyDetails(name: "Acme", logo: logo)
        XCTAssertLessThan(c.forMark.logo.count, 100)
        XCTAssertEqual(CompanyDetails(name: "Acme", logo: "/brand/x.png").forMark.logo, "/brand/x.png")
        let mark = CompanyDetailsMark(userId: "u", updatedAt: t0, values: c.forMark)
        // Unchanged here: the company's newer copy comes down.
        XCTAssertEqual(CompanySync.detailsAction(local: c, localSavedAt: t2, mark: mark, remote: CompanyDetails(name: "Acme 2"), remoteUpdatedAt: t1, canWrite: true), .pull)
        // A new logo here is a change.
        var changed = c
        changed.logo = logo + "B"
        XCTAssertEqual(CompanySync.detailsAction(local: changed, localSavedAt: t2, mark: mark, remote: c, remoteUpdatedAt: t1, canWrite: true), .push)
    }

    func testParsesDatabaseTimes() {
        XCTAssertNotNil(CompanySync.parseTime("2026-11-20T10:00:00.000Z"))
        XCTAssertNotNil(CompanySync.parseTime("2026-11-20T10:00:00+00:00"))
        XCTAssertNotNil(CompanySync.parseTime("2026-11-20T10:00:00.123456+00:00"))
        XCTAssertNil(CompanySync.parseTime("soon"))
        XCTAssertLessThan(CompanySync.parseTime("2026-11-20T10:00:00.123456+00:00")!, CompanySync.parseTime("2026-11-20T10:00:01Z")!)
    }

    // MARK: preference sections

    func testFreshDeviceNeverSeedsTheCompany() {
        let plan = CompanyPrefs.plan(local: fresh(), localSavedAt: t2, mark: nil, userId: "u", shared: nil, office: [:], canWrite: true, trades: true)
        XCTAssertTrue(plan.pushShared.isEmpty)
        XCTAssertTrue(plan.pushOffice.isEmpty)
    }

    func testPricesGoToTheOfficeCopyOnly() {
        var v = fresh()
        v.pricing.markupPct = 25
        v.pricing.floorHeightFt = 12
        v.checklistTemplates = [ChecklistTemplate(id: "t1", name: "Rough-in", items: [.init(text: "Check")])]
        let plan = CompanyPrefs.plan(local: v, localSavedAt: t0, mark: nil, userId: "u", shared: nil, office: [:], canWrite: true, trades: false)
        XCTAssertEqual(Set(plan.pushOffice.keys), ["pricing"])
        XCTAssertEqual(Set(plan.pushShared.keys), ["takeoff", "checklistTemplates"])
        let shared = String(data: try! JSONSerialization.data(withJSONObject: plan.pushShared), encoding: .utf8)!
        XCTAssertFalse(shared.contains("markupPct"))
        XCTAssertFalse(shared.contains("wirePrices"))
        XCTAssertEqual(plan.pushOffice["pricing"]?["updatedAt"] as? String, t0)
    }

    func testTechnicianReadsButNeverSends() {
        var v = fresh()
        v.pricing.markupPct = 99
        let shared: [String: Any] = ["takeoff": ["value": ["wireSlackPct": 5, "wireDropFt": 20, "floorHeightFt": 11], "updatedAt": t1]]
        let plan = CompanyPrefs.plan(local: v, localSavedAt: t2, mark: nil, userId: "u", shared: shared, office: nil, canWrite: false, trades: false)
        XCTAssertTrue(plan.pushShared.isEmpty && plan.pushOffice.isEmpty)
        XCTAssertEqual(plan.values.pricing.wireDropFt, 20)
        XCTAssertEqual(plan.values.pricing.markupPct, 99)
        XCTAssertEqual(plan.pulled, [.takeoff])
    }

    func testChecksWhatComesFromTheCloud() {
        let shared: [String: Any] = [
            "installPhotoRequired": ["value": ["tested", "bogus"], "updatedAt": t1],
            "checklistTemplates": ["value": [["id": "x"], ["id": "t2", "name": "Final", "items": [["text": "Label"]]]], "updatedAt": t1],
            "branding": ["value": ["tagline": "We wire it", "brandColor": 5], "updatedAt": t1],
            "junk": 5,
        ]
        let office: [String: Any] = [
            "pricing": ["value": ["markupPct": "lots", "taxPct": 8, "laborMode": "weird", "wirePrices": ["Cat6": 0.5, "Bad": -1]], "updatedAt": t1],
            "billduDocType": ["value": "invoice", "updatedAt": t1],
        ]
        let plan = CompanyPrefs.plan(local: fresh(), localSavedAt: t0, mark: nil, userId: "u", shared: shared, office: office, canWrite: true, trades: false)
        XCTAssertEqual(plan.values.installPhotoRequired, [.tested])
        XCTAssertEqual(plan.values.checklistTemplates.map(\.id), ["t2"])
        XCTAssertEqual(plan.values.business.tagline, "We wire it")
        XCTAssertEqual(plan.values.business.brandColor, "")
        XCTAssertEqual(plan.values.pricing.markupPct, 0)
        XCTAssertEqual(plan.values.pricing.taxPct, 8)
        XCTAssertEqual(plan.values.pricing.laborMode, .combined)
        XCTAssertEqual(plan.values.pricing.wirePrices, ["Cat6": 0.5])
        XCTAssertEqual(plan.values.billduDocType, "invoice")
    }

    func testANewDeviceGetsTheWholeSetupBack() {
        var office = fresh()
        office.pricing.markupPct = 25
        office.pricing.wirePrices["Cat6"] = 0.42
        office.billduDocType = "order"
        office.installPhotoRequired = [.installed, .tested]
        office.formTemplates = []
        office.checklistTemplates = [ChecklistTemplate(id: "t1", name: "Rough-in", items: [.init(text: "Check")])]
        office.trades = ["electrical"]
        var shared: [String: Any] = [:]
        var officeRow: [String: Any] = [:]
        let up = CompanyPrefs.plan(local: office, localSavedAt: t0, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: true)
        shared = merge(shared, up.pushShared)
        officeRow = merge(officeRow, up.pushOffice)

        let phone = CompanyPrefs.plan(local: fresh(), localSavedAt: t2, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: true)
        XCTAssertEqual(phone.values.pricing.markupPct, 25)
        XCTAssertEqual(phone.values.pricing.wirePrices["Cat6"], 0.42)
        XCTAssertEqual(phone.values.billduDocType, "order")
        XCTAssertEqual(phone.values.installPhotoRequired, [.installed, .tested])
        XCTAssertEqual(phone.values.checklistTemplates.map(\.name), ["Rough-in"])
        XCTAssertEqual(phone.values.trades, ["electrical"])
        XCTAssertTrue(phone.pushShared.isEmpty && phone.pushOffice.isEmpty)
        // And then nothing more to do.
        let again = CompanyPrefs.plan(local: phone.values, localSavedAt: t2, mark: phone.mark, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: true)
        XCTAssertTrue(again.pulled.isEmpty && again.pushShared.isEmpty && again.pushOffice.isEmpty)
    }

    func testRolloutOrderKeepsTheOfficesRealPrices() {
        var shared: [String: Any] = [:]
        var officeRow: [String: Any] = [:]
        let freshPlan = CompanyPrefs.plan(local: fresh(), localSavedAt: t2, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        XCTAssertTrue(freshPlan.pushOffice.isEmpty)
        var real = fresh()
        real.pricing.markupPct = 30
        let up = CompanyPrefs.plan(local: real, localSavedAt: t0, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        shared = merge(shared, up.pushShared)
        officeRow = merge(officeRow, up.pushOffice)
        let later = CompanyPrefs.plan(local: freshPlan.values, localSavedAt: t2, mark: freshPlan.mark, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        XCTAssertEqual(later.values.pricing.markupPct, 30)
    }

    func testEditsToDifferentPartsBothSurvive() {
        var shared: [String: Any] = [:]
        var officeRow: [String: Any] = [:]
        var a = fresh()
        a.pricing.markupPct = 10
        let a1 = CompanyPrefs.plan(local: a, localSavedAt: t0, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        shared = merge(shared, a1.pushShared); officeRow = merge(officeRow, a1.pushOffice)
        let b1 = CompanyPrefs.plan(local: fresh(), localSavedAt: t0, mark: nil, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        // A changes prices; B (later) adds a template.
        var a2v = a1.values
        a2v.pricing.markupPct = 20
        var b2v = b1.values
        b2v.checklistTemplates = [ChecklistTemplate(id: "t9", name: "Trim", items: [])]
        let a2 = CompanyPrefs.plan(local: a2v, localSavedAt: t1, mark: a1.mark, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        shared = merge(shared, a2.pushShared); officeRow = merge(officeRow, a2.pushOffice)
        let b2 = CompanyPrefs.plan(local: b2v, localSavedAt: t2, mark: b1.mark, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        shared = merge(shared, b2.pushShared); officeRow = merge(officeRow, b2.pushOffice)
        let a3 = CompanyPrefs.plan(local: a2.values, localSavedAt: t1, mark: a2.mark, userId: "u", shared: shared, office: officeRow, canWrite: true, trades: false)
        XCTAssertEqual(b2.values.pricing.markupPct, 20)
        XCTAssertEqual(a3.values.checklistTemplates.map(\.id), ["t9"])
    }

    func testOtherAccountsMarkIsIgnored() {
        var v = fresh()
        v.pricing.markupPct = 25
        let mark = CompanyPrefsMark(userId: "someone-else", sections: ["pricing": .init(updatedAt: t0, hash: "x")])
        let office: [String: Any] = ["pricing": ["value": ["markupPct": 10], "updatedAt": t0]]
        let plan = CompanyPrefs.plan(local: v, localSavedAt: t2, mark: mark, userId: "u", shared: nil, office: office, canWrite: true, trades: false)
        XCTAssertEqual(plan.pulled, [.pricing])
        XCTAssertEqual(plan.values.pricing.markupPct, 10)
        XCTAssertEqual(plan.mark.userId, "u")
    }

    func testSectionsMatchTheWebApp() {
        // The web app's names (src/lib/companyPreferences.ts SECTIONS); the database takes any, so a typo would
        // silently stop the two apps sharing a part.
        XCTAssertEqual(PrefKey.allCases.map(\.rawValue).sorted(),
                       ["billduDocType", "branding", "checklistTemplates", "formTemplates", "installPhotoRequired", "pricing", "takeoff", "trades"])
        XCTAssertEqual(PrefKey.allCases.filter(\.office).map(\.rawValue).sorted(), ["billduDocType", "pricing"])
    }

    // MARK: audit: clock skew, trade-pack prices

    func testAClockThatRanAheadDoesNotUndoALaterEdit() {
        // Another device's clock was a day ahead: its prices went up dated t2. This device took them, then the
        // office changes the markup here at this device's (correct) time t1.
        var officeRow: [String: Any] = ["pricing": ["value": ["markupPct": 10], "updatedAt": t2]]
        let first = CompanyPrefs.plan(local: fresh(), localSavedAt: t0, mark: nil, userId: "u", shared: [:], office: officeRow, canWrite: true, trades: false)
        XCTAssertEqual(first.values.pricing.markupPct, 10)
        var edited: CompanyPrefsValues = first.values
        edited.pricing.markupPct = 35
        let second = CompanyPrefs.plan(local: edited, localSavedAt: t1, mark: first.mark, userId: "u", shared: [:], office: officeRow, canWrite: true, trades: false)
        XCTAssertTrue(second.pulled.isEmpty)
        XCTAssertNotNil(second.pushOffice["pricing"])
        officeRow = merge(officeRow, second.pushOffice)
        let kept: [String: Any] = (officeRow["pricing"] as? [String: Any])?["value"] as? [String: Any] ?? [:]
        XCTAssertEqual(kept["markupPct"] as? Double, 35)
        let third = CompanyPrefs.plan(local: edited, localSavedAt: t1, mark: second.mark, userId: "u", shared: [:], office: officeRow, canWrite: true, trades: false)
        XCTAssertTrue(third.pulled.isEmpty && third.pushOffice.isEmpty)
    }

    func testTradePackWirePricesDoNotSeedTheCompanysPrices() {
        let pack: TradePack = Trades.pack(.electrical)
        var v = fresh()
        for (w, p) in pack.wirePrices where v.pricing.wirePrices[w] == nil { v.pricing.wirePrices[w] = p }
        let plan = CompanyPrefs.plan(local: v, localSavedAt: nil, mark: nil, userId: "u", shared: [:], office: [:], canWrite: true, trades: false)
        XCTAssertNil(plan.pushOffice["pricing"])
        var real = v
        real.pricing.markupPct = 12
        let up = CompanyPrefs.plan(local: real, localSavedAt: t0, mark: nil, userId: "u", shared: [:], office: [:], canWrite: true, trades: false)
        XCTAssertNotNil(up.pushOffice["pricing"])
    }
}
