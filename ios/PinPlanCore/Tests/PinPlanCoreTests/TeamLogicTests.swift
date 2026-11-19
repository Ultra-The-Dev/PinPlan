import XCTest
@testable import PinPlanCore

/// Mirrors tests/teamLogic.test.ts so the web and the app agree.
final class TeamLogicTests: XCTestCase {
    func testTechsDoFieldWorkOnlyEveryoneElseEverything() {
        for a in TeamAction.allCases {
            XCTAssertFalse(TeamLogic.can(.tech, a), a.rawValue)
            XCTAssertTrue(TeamLogic.can(.admin, a), a.rawValue)
            XCTAssertTrue(TeamLogic.can(.owner, a), a.rawValue)
            XCTAssertTrue(TeamLogic.can(nil, a), a.rawValue)
        }
        XCTAssertFalse(TeamLogic.mayPush(.estimateLines, role: .tech))
        XCTAssertTrue(TeamLogic.mayPush(.estimateLines, role: .admin))
        XCTAssertTrue(TeamLogic.mayPush(.estimateLines, role: nil))
        XCTAssertTrue(TeamLogic.mayPush(.markers, role: .tech))
        XCTAssertTrue(TeamLogic.mayPush(.photos, role: .tech))
    }

    func testUnknownRolesAreTheMostLimited() {
        XCTAssertEqual(TeamRole(remote: "owner"), .owner)
        XCTAssertEqual(TeamRole(remote: "supervisor"), .tech)
        XCTAssertEqual(TeamRole(remote: nil), .tech)
        XCTAssertEqual(TeamRole.invitable, [.tech, .admin])
        XCTAssertEqual(TeamRole.tech.name, "Technician")
        XCTAssertEqual(TeamRole.admin.short, "Admin")
    }

    func testSortsOwnerAdminsTechsThenByName() {
        let m = TeamLogic.sortMembers([
            TeamMember(userId: "1", role: .tech, name: "zed"),
            TeamMember(userId: "2", role: .admin, name: "Bea"),
            TeamMember(userId: "3", role: .tech, name: "Al"),
            TeamMember(userId: "4", role: .owner, name: "Olivia"),
            TeamMember(userId: "5", role: .tech, name: "", email: "bob@acme.com"),
        ])
        XCTAssertEqual(m.map(\.userId), ["4", "2", "3", "5", "1"])
        XCTAssertEqual(TeamLogic.memberLabel(name: " ", email: "tom@acme.com"), "tom")
        XCTAssertEqual(TeamLogic.memberLabel(name: " Ana ", email: "tom@acme.com"), "Ana")
        XCTAssertEqual(TeamLogic.memberLabel(name: nil, email: nil), "Team member")
    }

    func testInviteCodesAreTenUnambiguousCharacters() {
        var seen = Set<String>()
        for _ in 0..<200 {
            let c = TeamLogic.newInviteCode()
            XCTAssertEqual(c.count, TeamLogic.codeLength)
            for ch in c { XCTAssertTrue(TeamLogic.codeAlphabet.contains(ch)) }
            seen.insert(c)
        }
        XCTAssertEqual(seen.count, 200)
        for bad in "01OIL" { XCTAssertFalse(TeamLogic.codeAlphabet.contains(bad)) }
        XCTAssertEqual(TeamLogic.codeAlphabet.count, 31)
    }

    func testRejectsBiasedBytesAndStillFillsTheCode() {
        var calls = 0
        let c = TeamLogic.newInviteCode { n in
            defer { calls += 1 }
            return Array(repeating: calls == 0 ? 255 : 3, count: n)
        }
        XCTAssertEqual(c, String(repeating: "D", count: 10))
        XCTAssertEqual(calls, 2)
        // 248 is the first rejected byte (256 - 256 % 31); 247 maps to 247 % 31 = 30 → "9".
        XCTAssertEqual(TeamLogic.newInviteCode { n in (0..<n).map { $0 % 2 == 0 ? 248 : 247 } }, String(repeating: "9", count: 10))
    }

    func testNormaliseAndFormatWhatPeopleType() {
        XCTAssertEqual(TeamLogic.normalizeCode(" k7qm-xr4t pa "), "K7QMXR4TPA")
        XCTAssertEqual(TeamLogic.formatCode("K7QMXR4TPA"), "K7QM-XR4T-PA")
        XCTAssertEqual(TeamLogic.formatCode("k7qm"), "K7QM")
        XCTAssertEqual(TeamLogic.formatCode("k7qmx"), "K7QM-X")
        XCTAssertEqual(TeamLogic.formatCode(""), "")
        XCTAssertEqual(TeamLogic.joinURL(origin: "https://pinplan.example.com/", code: "k7qm-xr4t-pa"), "https://pinplan.example.com/join?code=K7QMXR4TPA")
        XCTAssertEqual(TeamLogic.joinURL(origin: "pinplan.example.com", code: "K7QMXR4TPA"), "https://pinplan.example.com/join?code=K7QMXR4TPA")
    }

    func testInvitesKnowTheirState() {
        let now = TeamLogic.parseDate("2026-11-20T12:00:00Z")!
        XCTAssertEqual(TeamLogic.inviteState(revoked: false, usedBy: nil, expiresAt: "2026-11-21T00:00:00Z", now: now), .open)
        XCTAssertEqual(TeamLogic.inviteState(revoked: false, usedBy: nil, expiresAt: "2026-11-19T00:00:00Z", now: now), .expired)
        XCTAssertEqual(TeamLogic.inviteState(revoked: false, usedBy: "u", expiresAt: "2026-11-21T00:00:00Z", now: now), .used)
        XCTAssertEqual(TeamLogic.inviteState(revoked: true, usedBy: nil, expiresAt: "2026-11-21T00:00:00Z", now: now), .revoked)
        // Postgres formats, with microseconds and short zones.
        XCTAssertEqual(TeamLogic.inviteState(revoked: false, usedBy: nil, expiresAt: "2026-11-20 11:59:59.123456+00", now: now), .expired)
        XCTAssertEqual(TeamLogic.inviteState(revoked: false, usedBy: nil, expiresAt: "2026-11-20T12:00:01.5+00:00", now: now), .open)
        XCTAssertEqual(TeamLogic.parseDate("2026-11-20 13:00:00+01")!, now)
        XCTAssertNil(TeamLogic.parseDate(""))
    }

    func testExplainsAMissingMigration() {
        XCTAssertEqual(TeamLogic.errorMessage("Could not find the function public.create_team(p_my_name, p_name) in the schema cache"), TeamLogic.migrationMessage)
        XCTAssertTrue(TeamLogic.migrationMessage.contains("20261120000000_teams.sql"))
        XCTAssertEqual(TeamLogic.errorMessage("Could not find the table 'public.team_members' in the schema cache"), TeamLogic.migrationMessage)
        XCTAssertEqual(TeamLogic.errorMessage("whatever", code: "PGRST205"), TeamLogic.migrationMessage)
        XCTAssertEqual(TeamLogic.errorMessage("That invite has expired. Ask for a new one."), "That invite has expired. Ask for a new one.")
        XCTAssertEqual(TeamLogic.errorMessage("Sign in first"), "Sign in first.")
        XCTAssertEqual(TeamLogic.errorMessage(nil), "Something went wrong")
        XCTAssertTrue(TeamLogic.isMissingSchema(code: "PGRST202", message: nil))
        XCTAssertFalse(TeamLogic.isMissingSchema(code: "23505", message: "duplicate key"))
    }

    func testDecodesServerRowsAndCachesThem() throws {
        let members = """
        [{"user_id":"u1","role":"owner","name":"Olivia","email":"o@acme.com","created_at":"2026-11-19T10:00:00+00:00"},
         {"user_id":"u2","role":"tech","name":null,"email":"sam@acme.com","created_at":"2026-11-19T11:00:00+00:00"}]
        """.data(using: .utf8)!
        let m = try JSONDecoder().decode([TeamMember].self, from: members)
        XCTAssertEqual(m.map(\.role), [.owner, .tech])
        XCTAssertEqual(m[1].label, "sam")
        let team = try JSONDecoder().decode([Team].self, from: #"[{"id":"t1","name":"Acme AV","owner_id":"u1"}]"#.data(using: .utf8)!)
        XCTAssertEqual(team.first, Team(id: "t1", name: "Acme AV", ownerId: "u1"))
        let inv = try JSONDecoder().decode([TeamInvite].self, from: """
        [{"code":"K7QMXR4TPA","role":"admin","name":"Bea","created_at":"2026-11-19T10:00:00+00:00","expires_at":"2099-01-01T00:00:00+00:00","used_by":null,"used_at":null,"revoked":false}]
        """.data(using: .utf8)!)
        XCTAssertEqual(inv.first?.state(), .open)
        XCTAssertEqual(inv.first?.role, .admin)
        let info = try JSONDecoder().decode(InviteInfo.self, from: #"{"team":"Acme AV","role":"tech","name":"Sam","expires_at":"2099-01-01T00:00:00+00:00"}"#.data(using: .utf8)!)
        XCTAssertEqual(info.role, .tech)

        let snap = TeamSnapshot(userId: "u2", team: team.first, role: .tech, members: m)
        let round = try JSONDecoder().decode(TeamSnapshot.self, from: JSONEncoder().encode(snap))
        XCTAssertEqual(round, snap)
        XCTAssertEqual(round.me?.label, "sam")
        XCTAssertEqual(round.memberNames, ["Olivia", "sam"])
    }

    func testInviteMessageReadsWell() {
        let s = TeamLogic.inviteMessage(team: "Acme AV", role: .tech, name: "Sam", code: "K7QMXR4TPA", link: "https://x.example/join?code=K7QMXR4TPA")
        XCTAssertTrue(s.hasPrefix("Hi Sam, you're invited to join Acme AV on PinPlan as a technician."))
        XCTAssertTrue(s.contains("https://x.example/join?code=K7QMXR4TPA"))
        XCTAssertTrue(s.contains("K7QM-XR4T-PA"))
        XCTAssertFalse(TeamLogic.inviteMessage(team: "", role: .admin, name: "", code: "AB", link: nil).contains("Join here"))
    }
}
