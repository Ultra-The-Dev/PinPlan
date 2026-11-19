import XCTest
@testable import PinPlanCore

/// Mirrors planAllowsWork (src/lib/plans.ts) and the banner rules of src/lib/billingLogic.ts.
final class BillingLogicTests: XCTestCase {
    let now = ISO8601DateFormatter().date(from: "2026-11-20T12:00:00Z")!

    private func iso(days: Double) -> String {
        let f = ISO8601DateFormatter()
        return f.string(from: now.addingTimeInterval(days * 86_400))
    }

    func testPlanAllowsWorkMatchesTheWebAndTheDatabase() {
        let future = iso(days: 5), past = iso(days: -1)
        for s in [PlanStatus.active, .pastDue, .comped] {
            XCTAssertTrue(BillingLogic.planAllowsWork(s, trialEndsAt: nil, now: now), s.rawValue)
            XCTAssertTrue(BillingLogic.planAllowsWork(s, trialEndsAt: past, now: now), s.rawValue)
        }
        XCTAssertTrue(BillingLogic.planAllowsWork(.trialing, trialEndsAt: nil, now: now))
        XCTAssertTrue(BillingLogic.planAllowsWork(.trialing, trialEndsAt: future, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.trialing, trialEndsAt: past, now: now))
        XCTAssertTrue(BillingLogic.planAllowsWork(.incomplete, trialEndsAt: future, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.incomplete, trialEndsAt: nil, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.incomplete, trialEndsAt: past, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.none, trialEndsAt: nil, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(nil, trialEndsAt: nil, now: now))
        XCTAssertTrue(BillingLogic.planAllowsWork(nil, trialEndsAt: future, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.canceled, trialEndsAt: future, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.unpaid, trialEndsAt: future, now: now))
        // Solo or not loaded: never locked.
        XCTAssertTrue(BillingLogic.allowsWork(nil, now: now))
        XCTAssertEqual(BillingLogic.trialDays, 14)
    }

    func testParsesTeamBillingJSON() throws {
        let json = """
        {"team_id":"t1","status":"trialing","trial_ends_at":"2026-11-29 11:00:00.123456+00","current_period_end":null,
         "seat_limit":6,"members":4,"can_work":true,"has_subscription":false,"billing_email":null}
        """
        let b = try XCTUnwrap(BillingLogic.parse(Data(json.utf8)))
        XCTAssertEqual(b.status, .trialing)
        XCTAssertEqual(b.seatLimit, 6)
        XCTAssertEqual(b.members, 4)
        XCTAssertTrue(b.canWork)
        XCTAssertFalse(b.hasSubscription)
        XCTAssertNil(b.currentPeriodEnd)
        XCTAssertEqual(BillingLogic.daysLeft(b.trialEndsAt, now: now), 9)
        XCTAssertNil(BillingLogic.parse(Data("null".utf8)))
        XCTAssertNil(BillingLogic.parse(Data("[]".utf8)))
        // Unknown status from a newer server; missing fields.
        let odd = try XCTUnwrap(BillingLogic.parse(Data(#"{"status":"paused"}"#.utf8)))
        XCTAssertEqual(odd.status, PlanStatus.none)
        XCTAssertNil(odd.seatLimit)
        XCTAssertEqual(odd.members, 0)
        XCTAssertFalse(odd.canWork)
        // Cached with the team snapshot and read back.
        let snap = TeamSnapshot(userId: "u", billing: b)
        let back = try JSONDecoder().decode(TeamSnapshot.self, from: JSONEncoder().encode(snap))
        XCTAssertEqual(back, snap)
        // Snapshots cached before billing existed still decode.
        let old = try JSONDecoder().decode(TeamSnapshot.self, from: Data(#"{"userId":"u","members":[]}"#.utf8))
        XCTAssertNil(old.billing)
    }

    func testDaysLeftRoundsUp() {
        XCTAssertEqual(BillingLogic.daysLeft(iso(days: 0.2), now: now), 1)
        XCTAssertEqual(BillingLogic.daysLeft(iso(days: 3), now: now), 3)
        XCTAssertEqual(BillingLogic.daysLeft(iso(days: -2), now: now), 0)
        XCTAssertEqual(BillingLogic.daysLeft(nil, now: now), 0)
    }

    func testBannerOnlyWhenThereIsSomethingToSay() {
        let fine = TeamBilling(status: .trialing, trialEndsAt: iso(days: 10), now: now)
        XCTAssertNil(BillingLogic.banner(fine, role: .owner, now: now))
        XCTAssertNil(BillingLogic.banner(nil, role: .owner, now: now))
        XCTAssertNil(BillingLogic.banner(TeamBilling(status: .comped, now: now), role: .tech, now: now))
        XCTAssertNil(BillingLogic.banner(TeamBilling(status: .active, now: now), role: .owner, now: now))
        // A trial with a subscription already set up doesn't nag.
        XCTAssertNil(BillingLogic.banner(TeamBilling(status: .trialing, trialEndsAt: iso(days: 2), hasSubscription: true, now: now), role: .owner, now: now))

        let ending = TeamBilling(status: .trialing, trialEndsAt: iso(days: 2.5), now: now)
        let owner = BillingLogic.banner(ending, role: .owner, now: now)
        XCTAssertEqual(owner?.tone, .amber)
        XCTAssertEqual(owner?.action, .manageOnWeb)
        XCTAssertEqual(owner?.text, "Your company's PinPlan trial ends in 3 days.")
        XCTAssertEqual(owner?.readOnly, false)
        let tech = BillingLogic.banner(ending, role: .tech, now: now)
        XCTAssertEqual(tech?.action, .askOffice)
        XCTAssertEqual(tech?.text, "Your company's PinPlan trial ends in 3 days. Ask your office.")
        XCTAssertEqual(BillingLogic.banner(TeamBilling(status: .trialing, trialEndsAt: iso(days: 0.5), now: now), role: .admin, now: now)?.text,
                       "Your company's PinPlan trial ends today or tomorrow.")

        let late = BillingLogic.banner(TeamBilling(status: .pastDue, now: now), role: .admin, now: now)
        XCTAssertEqual(late?.tone, .amber)
        XCTAssertEqual(late?.text, "Your company's PinPlan subscription needs attention.")

        for b in [TeamBilling(status: .canceled, now: now), TeamBilling(status: .unpaid, now: now), TeamBilling(status: .trialing, trialEndsAt: iso(days: -1), now: now)] {
            let r = BillingLogic.banner(b, role: .tech, now: now)
            XCTAssertEqual(r?.tone, .red, b.status.rawValue)
            XCTAssertEqual(r?.readOnly, true)
            XCTAssertEqual(r?.action, .askOffice)
            XCTAssertTrue(r?.text.hasSuffix("Ask your office.") ?? false)
        }
    }

    func testBannerNeverSellsInsideTheApp() {
        let all: [TeamBilling] = PlanStatus.allCases.flatMap { s in
            [TeamBilling(status: s, now: now), TeamBilling(status: s, trialEndsAt: iso(days: 1), now: now), TeamBilling(status: s, trialEndsAt: iso(days: -1), now: now)]
        }
        for b in all {
            for role in [TeamRole.owner, .admin, .tech] {
                guard let text = BillingLogic.banner(b, role: role, now: now)?.text.lowercased() else { continue }
                for word in ["subscribe", "buy", "purchase", "price", "$", "upgrade", "card"] {
                    XCTAssertFalse(text.contains(word), "\(b.status.rawValue)/\(role.rawValue): \(text)")
                }
            }
            let line = BillingLogic.statusLine(b, now: now)
            XCTAssertFalse(line.label.contains("$"))
        }
        XCTAssertEqual(BillingLogic.manageLinkTitle, "Manage your account on the web")
    }

    func testStatusLineForSettings() {
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .comped, now: now), now: now).label, "Founder account")
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .active, currentPeriodEnd: "2026-12-20T00:00:00Z", now: now), now: now),
                       BillingStatusLine(label: "Active", detail: "Renews Dec 20, 2026.", tone: .green))
        let trial = BillingLogic.statusLine(TeamBilling(status: .trialing, trialEndsAt: iso(days: 9), now: now), now: now)
        XCTAssertEqual(trial.label, "Trial — 9 days left")
        XCTAssertEqual(trial.tone, .slate)
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .trialing, trialEndsAt: iso(days: 1), now: now), now: now).label, "Trial — 1 day left")
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .trialing, trialEndsAt: iso(days: -1), now: now), now: now).label, "Read-only")
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .canceled, now: now), now: now).tone, .red)
        XCTAssertEqual(BillingLogic.statusLine(TeamBilling(status: .pastDue, now: now), now: now).tone, .amber)
    }

    func testSeatsAndTexts() {
        XCTAssertEqual(BillingLogic.seatsText(TeamBilling(status: .active, seatLimit: 6, members: 5, now: now)), "5 of 6 seats used")
        XCTAssertEqual(BillingLogic.seatsText(TeamBilling(status: .trialing, members: 1, now: now)), "1 person · no seat limit")
        XCTAssertEqual(BillingLogic.seatsText(TeamBilling(status: .trialing, members: 4, now: now)), "4 people · no seat limit")
        XCTAssertTrue(BillingLogic.seatsFull(TeamBilling(status: .active, seatLimit: 3, members: 3, now: now)))
        XCTAssertFalse(BillingLogic.seatsFull(TeamBilling(status: .active, seatLimit: 4, members: 3, now: now)))
        XCTAssertFalse(BillingLogic.seatsFull(nil))

        XCTAssertEqual(BillingLogic.readOnlyStatus(pending: 3, device: "iPad"), "Read-only — subscription inactive · 3 changes kept on this iPad")
        XCTAssertEqual(BillingLogic.readOnlyStatus(pending: 1, device: "iPhone"), "Read-only — subscription inactive · 1 change kept on this iPhone")
        XCTAssertEqual(BillingLogic.readOnlyStatus(pending: 0), "Read-only — subscription inactive")

        XCTAssertTrue(BillingLogic.isSubscriptionInactive("PinPlan subscription inactive"))
        XCTAssertTrue(BillingLogic.isSubscriptionInactive("ERROR: PinPlan subscription inactive (P0001)"))
        XCTAssertFalse(BillingLogic.isSubscriptionInactive("permission denied"))
        XCTAssertFalse(BillingLogic.isSubscriptionInactive(nil))

        XCTAssertEqual(BillingLogic.manageURL(origin: "pinplan.example.com/"), "https://pinplan.example.com/settings#billing")
        XCTAssertEqual(BillingLogic.webURL(origin: "http://127.0.0.1:3000", path: "/terms"), "http://127.0.0.1:3000/terms")
        XCTAssertNil(BillingLogic.webURL(origin: "  ", path: "privacy"))

        let preview = BillingLogic.readOnlyPreview(TeamBilling(status: .trialing, trialEndsAt: iso(days: 9), seatLimit: 6, members: 5, now: now), now: now)
        XCTAssertFalse(BillingLogic.allowsWork(preview, now: now))
        XCTAssertEqual(preview.members, 5)
        XCTAssertEqual(BillingLogic.banner(preview, role: .owner, now: now)?.readOnly, true)
    }
}
