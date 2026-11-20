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
        // Canceled during the team's own trial: keeps working until it ends.
        XCTAssertTrue(BillingLogic.planAllowsWork(.canceled, trialEndsAt: future, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.canceled, trialEndsAt: past, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.canceled, trialEndsAt: nil, now: now))
        XCTAssertFalse(BillingLogic.planAllowsWork(.incomplete, trialEndsAt: past, now: now))
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
        // A canceled team still in its trial would keep working: the preview is past it.
        let canceledInTrial = TeamBilling(status: .canceled, trialEndsAt: iso(days: 5), cancelAt: iso(days: 5), enforce: false, now: now)
        XCTAssertFalse(BillingLogic.allowsWork(BillingLogic.readOnlyPreview(canceledInTrial, now: now), now: now))
    }

    // MARK: enforce switch (billing_settings.enforce)

    func testEnforceOffNeverLocksAnUnpaidTrial() {
        let past = iso(days: -3)
        for s in [PlanStatus.trialing, .incomplete, .none] {
            XCTAssertTrue(BillingLogic.planAllowsWork(s, trialEndsAt: past, now: now, enforce: false), s.rawValue)
            XCTAssertFalse(BillingLogic.planAllowsWork(s, trialEndsAt: past, now: now), "enforced is the default: \(s.rawValue)")
        }
        XCTAssertTrue(BillingLogic.planAllowsWork(nil, trialEndsAt: nil, now: now, enforce: false))
        // A lapsed subscription still locks.
        XCTAssertFalse(BillingLogic.planAllowsWork(.canceled, trialEndsAt: past, now: now, enforce: false))
        XCTAssertFalse(BillingLogic.planAllowsWork(.unpaid, trialEndsAt: nil, now: now, enforce: false))

        let open = TeamBilling(status: .trialing, trialEndsAt: past, enforce: false, now: now)
        XCTAssertTrue(open.canWork)
        XCTAssertTrue(BillingLogic.allowsWork(open, now: now))
        XCTAssertTrue(BillingLogic.canEdit(open, now: now))
        XCTAssertNil(BillingLogic.editBlockedMessage(open, role: .owner, now: now))
        // No banner while nothing will lock; the plan line says the trial is over but jobs stay editable.
        XCTAssertNil(BillingLogic.banner(open, role: .owner, now: now))
        XCTAssertNil(BillingLogic.banner(TeamBilling(status: .trialing, trialEndsAt: iso(days: 2), enforce: false, now: now), role: .owner, now: now))
        XCTAssertEqual(BillingLogic.statusLine(open, now: now).label, "Trial ended")
        XCTAssertEqual(BillingLogic.statusLine(open, now: now).tone, .slate)
    }

    func testParsesEnforceAndCancelAt() throws {
        let off = try XCTUnwrap(BillingLogic.parse(Data(#"{"status":"trialing","trial_ends_at":"2026-11-01T00:00:00Z","enforce":false,"cancel_at":"2026-12-01T00:00:00Z"}"#.utf8)))
        XCTAssertFalse(off.enforce)
        XCTAssertEqual(off.cancelAt, "2026-12-01T00:00:00Z")
        XCTAssertTrue(off.canWork, "worked out from the status when the server doesn't say")
        XCTAssertTrue(BillingLogic.allowsWork(off, now: now))
        // Older servers don't send them: enforced, no cancellation.
        let old = try XCTUnwrap(BillingLogic.parse(Data(#"{"status":"trialing","trial_ends_at":"2026-11-01T00:00:00Z","cancel_at":""}"#.utf8)))
        XCTAssertTrue(old.enforce)
        XCTAssertNil(old.cancelAt)
        XCTAssertFalse(BillingLogic.allowsWork(old, now: now))
        // Cached in the team snapshot and read back; caches from before these fields existed still decode.
        let snap = TeamSnapshot(userId: "u", billing: off)
        XCTAssertEqual(try JSONDecoder().decode(TeamSnapshot.self, from: JSONEncoder().encode(snap)), snap)
        let cached = try JSONDecoder().decode(TeamBilling.self, from: Data(#"{"status":"active","members":2,"can_work":true,"has_subscription":true}"#.utf8))
        XCTAssertTrue(cached.enforce)
        XCTAssertNil(cached.cancelAt)
    }

    // MARK: canceled within the trial, scheduled cancellations

    func testCanceledWithinTheTrialKeepsWorkingUntilItEnds() {
        let b = TeamBilling(status: .canceled, trialEndsAt: "2026-11-25T12:00:00Z", hasSubscription: true, now: now)
        XCTAssertTrue(b.canWork)
        XCTAssertTrue(BillingLogic.canEdit(b, now: now))
        XCTAssertEqual(BillingLogic.statusLine(b, now: now),
                       BillingStatusLine(label: "Canceled", detail: "Ends Nov 25, 2026: jobs turn read-only after that.", tone: .amber))
        let owner = BillingLogic.banner(b, role: .owner, now: now)
        XCTAssertEqual(owner?.tone, .amber)
        XCTAssertEqual(owner?.readOnly, false)
        XCTAssertEqual(owner?.action, .manageOnWeb)
        XCTAssertEqual(owner?.text, "Your company's PinPlan subscription was canceled. Ends Nov 25, 2026: jobs turn read-only after that.")
        XCTAssertEqual(BillingLogic.banner(b, role: .tech, now: now)?.text,
                       "Your company's PinPlan subscription was canceled. Ends Nov 25, 2026: jobs turn read-only after that. Ask your office.")
        // After the trial: read-only.
        let later = now.addingTimeInterval(6 * 86_400)
        XCTAssertFalse(BillingLogic.canEdit(b, now: later))
        XCTAssertEqual(BillingLogic.banner(b, role: .owner, now: later)?.readOnly, true)
        XCTAssertEqual(BillingLogic.statusLine(b, now: later).tone, .red)
        XCTAssertEqual(BillingLogic.editBlockedMessage(b, role: .owner, now: later),
                       "Your PinPlan subscription is inactive, so jobs are read-only — you can still view and export everything. Manage your account on the web to edit again.")
    }

    func testScheduledCancellation() {
        let soon = TeamBilling(status: .active, currentPeriodEnd: "2026-11-24T00:00:00Z", hasSubscription: true, cancelAt: "2026-11-24T00:00:00Z", now: now)
        XCTAssertEqual(BillingLogic.statusLine(soon, now: now),
                       BillingStatusLine(label: "Ending", detail: "Ends Nov 24, 2026: jobs turn read-only after that.", tone: .amber))
        XCTAssertEqual(BillingLogic.banner(soon, role: .admin, now: now)?.text,
                       "Your company's PinPlan subscription is ending. Ends Nov 24, 2026: jobs turn read-only after that.")
        XCTAssertTrue(BillingLogic.canEdit(soon, now: now))
        // More than a week away: only the plan line says so.
        let far = TeamBilling(status: .active, hasSubscription: true, cancelAt: iso(days: 20), now: now)
        XCTAssertNil(BillingLogic.banner(far, role: .owner, now: now))
        XCTAssertEqual(BillingLogic.statusLine(far, now: now).label, "Ending")
        // A cancellation already past is ignored (the webhook turns the team canceled).
        let gone = TeamBilling(status: .active, currentPeriodEnd: "2026-12-20T00:00:00Z", cancelAt: iso(days: -1), now: now)
        XCTAssertEqual(BillingLogic.statusLine(gone, now: now).label, "Active")
        XCTAssertNil(BillingLogic.banner(gone, role: .owner, now: now))
        // A trial that will end with the subscription.
        let trial = TeamBilling(status: .trialing, trialEndsAt: iso(days: 6), hasSubscription: true, cancelAt: iso(days: 6), now: now)
        XCTAssertEqual(BillingLogic.statusLine(trial, now: now).tone, .amber)
        XCTAssertEqual(BillingLogic.banner(trial, role: .owner, now: now)?.title, "Ending")
    }

    // MARK: people on no team (personal trial)

    func testSoloTrialLocksWhenItEnds() throws {
        XCTAssertNil(BillingLogic.parseSolo(Data("null".utf8)))
        XCTAssertEqual(BillingLogic.parseSolo(Data(#"{"trial_ends_at":"2026-11-23T12:00:00Z","can_work":true,"enforce":true}"#.utf8)),
                       SoloBilling(trialEndsAt: "2026-11-23T12:00:00Z", enforce: true))
        XCTAssertEqual(BillingLogic.parseSolo(Data(#"{"trial_ends_at":null}"#.utf8)), SoloBilling(trialEndsAt: nil, enforce: true))
        XCTAssertEqual(BillingLogic.parseSolo(Data(#"{"trial_ends_at":"2026-11-01T00:00:00Z","enforce":false}"#.utf8))?.enforce, false)

        let lapsed = SoloBilling(trialEndsAt: iso(days: -1))
        XCTAssertTrue(BillingLogic.soloAllowsWork(SoloBilling(trialEndsAt: iso(days: 2)), now: now))
        XCTAssertFalse(BillingLogic.soloAllowsWork(lapsed, now: now))
        XCTAssertTrue(BillingLogic.soloAllowsWork(SoloBilling(trialEndsAt: nil), now: now), "no deadline (signed up before launch)")
        XCTAssertTrue(BillingLogic.soloAllowsWork(SoloBilling(trialEndsAt: iso(days: -1), enforce: false), now: now))
        XCTAssertTrue(BillingLogic.soloAllowsWork(nil, now: now), "not loaded yet")

        // The team decides when on one; else the personal trial.
        XCTAssertFalse(BillingLogic.canEdit(onTeam: false, billing: nil, solo: lapsed, now: now))
        XCTAssertTrue(BillingLogic.canEdit(onTeam: true, billing: TeamBilling(status: .active, now: now), solo: lapsed, now: now))
        XCTAssertFalse(BillingLogic.canEdit(onTeam: true, billing: TeamBilling(status: .unpaid, now: now), solo: nil, now: now))
        XCTAssertTrue(BillingLogic.canEdit(onTeam: true, billing: nil, solo: lapsed, now: now), "no billing in the database")
        XCTAssertTrue(BillingLogic.canEdit(onTeam: false, billing: nil, solo: nil, now: now))

        XCTAssertNil(BillingLogic.editBlockedMessage(onTeam: false, billing: nil, solo: SoloBilling(trialEndsAt: iso(days: 2)), role: nil, now: now))
        XCTAssertEqual(BillingLogic.editBlockedMessage(onTeam: false, billing: nil, solo: lapsed, role: nil, now: now),
                       "Your free trial has ended, so jobs are read-only — you can still view and export everything. Manage your account on the web to keep working.")
        XCTAssertNil(BillingLogic.editBlockedMessage(onTeam: true, billing: nil, solo: lapsed, role: .owner, now: now))
    }

    func testSoloBanner() {
        XCTAssertNil(BillingLogic.soloBanner(nil, now: now))
        XCTAssertNil(BillingLogic.soloBanner(SoloBilling(trialEndsAt: iso(days: 10)), now: now))
        XCTAssertNil(BillingLogic.soloBanner(SoloBilling(trialEndsAt: nil), now: now))
        XCTAssertNil(BillingLogic.soloBanner(SoloBilling(trialEndsAt: iso(days: -1), enforce: false), now: now))
        let ending = BillingLogic.soloBanner(SoloBilling(trialEndsAt: iso(days: 2.5)), now: now)
        XCTAssertEqual(ending?.text, "Your PinPlan trial ends in 3 days.")
        XCTAssertEqual(ending?.readOnly, false)
        XCTAssertEqual(BillingLogic.soloBanner(SoloBilling(trialEndsAt: iso(days: 0.5)), now: now)?.text, "Your PinPlan trial ends today or tomorrow.")
        let over = BillingLogic.soloBanner(SoloBilling(trialEndsAt: iso(days: -1)), now: now)
        XCTAssertEqual(over?.tone, .red)
        XCTAssertEqual(over?.readOnly, true)
        XCTAssertEqual(over?.action, .manageOnWeb)
        for b in [ending, over].compactMap({ $0 }) {
            for word in ["subscribe", "buy", "purchase", "price", "$", "upgrade", "card"] {
                XCTAssertFalse(b.text.lowercased().contains(word), b.text)
            }
        }
    }

    // MARK: account deletion

    func testAccountDeletionAnswers() {
        func answer(_ status: Int, _ json: String) -> AccountDeletionResult { AccountDeletionResult.from(status: status, body: Data(json.utf8)) }
        XCTAssertEqual(answer(200, #"{"ok":true}"#), .deleted)
        XCTAssertEqual(answer(403, #"{"error":"To keep your account safe, type the email.","code":"reauth_required"}"#),
                       .needsEmail(message: "To keep your account safe, type the email."))
        XCTAssertEqual(answer(403, ""), .needsEmail(message: AccountDeletionResult.needsEmailFallback))
        XCTAssertEqual(answer(409, #"{"error":"Remove them first.","code":"team_has_members"}"#), .teamInTheWay(message: "Remove them first."))
        XCTAssertEqual(answer(501, #"{"error":"x","code":"unavailable"}"#), .unavailable)
        XCTAssertEqual(answer(404, "<html>"), .unavailable)
        XCTAssertEqual(answer(501, #"{"error":"Email support and we'll delete it.","code":"billing_not_configured"}"#),
                       .failed(message: "Email support and we'll delete it."))
        XCTAssertEqual(answer(401, #"{"error":"Your sign-in has expired.","code":"unauthorized"}"#), .failed(message: "Your sign-in has expired."))
        XCTAssertEqual(answer(502, ""), .failed(message: "The server answered 502. Try again in a moment."))

        XCTAssertNil(AccountDeletionResult.body(confirmEmail: nil))
        XCTAssertNil(AccountDeletionResult.body(confirmEmail: "  "))
        XCTAssertEqual(AccountDeletionResult.body(confirmEmail: " me@example.com \n"), ["confirmEmail": "me@example.com"])
    }
}
