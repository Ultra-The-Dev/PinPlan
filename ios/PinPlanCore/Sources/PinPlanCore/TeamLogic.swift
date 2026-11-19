import Foundation

// Company teams: roles, what each role may do, and invite codes. Mirrors src/lib/teamLogic.ts so the web app and
// the iPad / iPhone app agree on codes, roles and what a technician sees.

/// Who someone is on a company team.
public enum TeamRole: String, Codable, CaseIterable, Sendable, Hashable {
    case owner, admin, tech

    /// "Owner", "Office / admin", "Technician".
    public var name: String {
        switch self {
        case .owner: return "Owner"
        case .admin: return "Office / admin"
        case .tech: return "Technician"
        }
    }

    /// Short badge text: "Owner", "Admin", "Tech".
    public var short: String {
        switch self {
        case .owner: return "Owner"
        case .admin: return "Admin"
        case .tech: return "Tech"
        }
    }

    public var description: String {
        switch self {
        case .owner: return "Everything, including billing and the team. One per company."
        case .admin: return "Everything: estimates, proposals, Billdu, catalog and the team."
        case .tech: return "Field work on every job: plans, devices, photos, checklists, logs and tasks. No prices."
        }
    }

    /// Roles an invite can give (there is one owner per team).
    public static let invitable: [TeamRole] = [.tech, .admin]

    /// Unknown values (a newer server) count as the most limited role.
    public init(remote: String?) { self = TeamRole(rawValue: remote ?? "") ?? .tech }
}

/// Things the app shows or hides by role. The database enforces the price and delete rules as well.
public enum TeamAction: String, CaseIterable, Sendable {
    /// Estimate tab, proposals, plan review sending, Billdu, prices in the catalog and products.
    case prices
    /// Invite, change roles, remove people.
    case manageTeam
    case deleteJob
    case editCatalog
}

/// The state of an invite code.
public enum InviteState: String, Sendable, Equatable {
    case open, used, expired, revoked

    public var label: String {
        switch self {
        case .open: return "Waiting"
        case .used: return "Joined"
        case .expired: return "Expired"
        case .revoked: return "Cancelled"
        }
    }
}

public enum TeamLogic {
    /// No team (working alone) means full access; technicians do field work only.
    public static func can(_ role: TeamRole?, _ action: TeamAction) -> Bool {
        role != .tech
    }

    /// Unambiguous characters (no 0/O, 1/I/L), so a code read aloud or typed on an iPad works first time.
    public static let codeAlphabet = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    public static let codeLength = 10

    /// Cryptographically secure random bytes (the system generator).
    public static func secureRandomBytes(_ n: Int) -> [UInt8] {
        var g = SystemRandomNumberGenerator()
        return (0..<n).map { _ in UInt8.random(in: UInt8.min...UInt8.max, using: &g) }
    }

    /// A random invite code, e.g. "K7QMXR4TPA". `random` is for tests.
    public static func newInviteCode(random: (Int) -> [UInt8] = secureRandomBytes) -> String {
        let n = codeAlphabet.count
        let limit = 256 - (256 % n)
        while true {
            var out: [Character] = []
            // Rejection sampling keeps every character equally likely.
            for b in random(codeLength * 2) where out.count < codeLength {
                let v = Int(b)
                if v < limit { out.append(codeAlphabet[v % n]) }
            }
            if out.count == codeLength { return String(out) }
        }
    }

    /// Codes are stored upper case without separators; people may type spaces, dashes or lower case.
    public static func normalizeCode(_ input: String) -> String {
        String(input.uppercased().unicodeScalars.filter { ("A"..."Z").contains($0) || ("0"..."9").contains($0) }.map(Character.init))
    }

    /// "K7QMXR4TPA" → "K7QM-XR4T-PA" for showing and reading aloud.
    public static func formatCode(_ code: String) -> String {
        let c = Array(normalizeCode(code))
        return stride(from: 0, to: c.count, by: 4).map { String(c[$0..<min($0 + 4, c.count)]) }.joined(separator: "-")
    }

    /// The web page that joins a team: "<origin>/join?code=K7QMXR4TPA".
    public static func joinURL(origin: String, code: String) -> String {
        var o = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        if !o.isEmpty, !o.lowercased().hasPrefix("http") { o = "https://" + o }
        while o.hasSuffix("/") { o.removeLast() }
        return "\(o)/join?code=\(normalizeCode(code))"
    }

    /// Open, used, expired or revoked.
    public static func inviteState(revoked: Bool, usedBy: String?, expiresAt: String, now: Date = Date()) -> InviteState {
        if revoked { return .revoked }
        if let u = usedBy, !u.isEmpty { return .used }
        guard let exp = parseDate(expiresAt) else { return .open }
        return exp <= now ? .expired : .open
    }

    /// Postgres / ISO timestamps ("2026-11-21 10:00:00.123456+00", "2026-11-21T10:00:00Z") → Date.
    public static func parseDate(_ s: String?) -> Date? {
        guard var t = s?.trimmingCharacters(in: .whitespaces), !t.isEmpty else { return nil }
        t = t.replacingOccurrences(of: " ", with: "T")
        // Keep at most 3 fractional digits (the formatter doesn't read microseconds everywhere).
        if let dot = t.firstIndex(of: ".") {
            var end = t.index(after: dot)
            while end < t.endIndex, t[end].isNumber { end = t.index(after: end) }
            let digits = String(t[t.index(after: dot)..<end].prefix(3))
            t = String(t[..<dot]) + (digits.isEmpty ? "" : "." + digits) + String(t[end...])
        }
        // "+00" → "+00:00".
        if t.contains("T"), let r = t.range(of: #"[+-]\d\d$"#, options: .regularExpression) {
            let zone = String(t[r])
            t.replaceSubrange(r, with: zone + ":00")
        }
        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return frac.date(from: t) ?? plain.date(from: t)
    }

    /// The cloud database doesn't have the team tables or functions yet (migration not run).
    public static func isMissingSchema(code: String?, message: String?) -> Bool {
        if let code, ["PGRST205", "PGRST202", "42P01", "42883"].contains(code) { return true }
        let m = message ?? ""
        return m.range(of: "Could not find the (table|function)", options: [.regularExpression, .caseInsensitive]) != nil
    }

    public static let migrationFile = "supabase/migrations/20261120000000_teams.sql"
    public static let migrationMessage = "The cloud database needs the team update: run \(migrationFile) in Supabase."

    /// A friendly message for the errors the team functions raise.
    public static func errorMessage(_ message: String?, code: String? = nil) -> String {
        let msg = (message?.isEmpty == false ? message : nil) ?? "Something went wrong"
        if isMissingSchema(code: code, message: msg) { return migrationMessage }
        if msg.range(of: #"(function|table|relation)[\s\S]*\b(team_|create_team|teams\b)"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return migrationMessage
        }
        if msg.range(of: "JWT|not authenticated|Sign in first", options: [.regularExpression, .caseInsensitive]) != nil { return "Sign in first." }
        return msg
    }

    /// What to call someone: their name, else the part of their email before the @.
    public static func memberLabel(name: String?, email: String?) -> String {
        if let n = name?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty { return n }
        if let e = email, let first = e.split(separator: "@", omittingEmptySubsequences: false).first, !first.isEmpty { return String(first) }
        return "Team member"
    }

    private static func rank(_ r: TeamRole) -> Int {
        switch r {
        case .owner: return 0
        case .admin: return 1
        case .tech: return 2
        }
    }

    /// Owner, admins, techs, then by name.
    public static func sortMembers(_ members: [TeamMember]) -> [TeamMember] {
        members.sorted { a, b in
            if rank(a.role) != rank(b.role) { return rank(a.role) < rank(b.role) }
            let la = (a.name.isEmpty ? (a.email ?? "") : a.name).lowercased()
            let lb = (b.name.isEmpty ? (b.email ?? "") : b.name).lowercased()
            return la.localizedCompare(lb) == .orderedAscending
        }
    }

    /// Whether this device may send rows of a table (technicians can't write prices: the database refuses them).
    public static func mayPush(_ table: SyncTable, role: TeamRole?) -> Bool {
        table == .estimateLines ? can(role, .prices) : true
    }

    /// The friendly text sent with an invite (Messages, Mail, WhatsApp…).
    public static func inviteMessage(team: String, role: TeamRole, name: String, code: String, link: String?) -> String {
        let hi = name.trimmingCharacters(in: .whitespaces).isEmpty ? "Hi" : "Hi \(name.trimmingCharacters(in: .whitespaces))"
        let company = team.trimmingCharacters(in: .whitespaces).isEmpty ? "our team" : team.trimmingCharacters(in: .whitespaces)
        let joinWith = link.map { "Join here: \($0)\n" } ?? ""
        return "\(hi), you're invited to join \(company) on PinPlan as \(role == .admin ? "office / admin" : "a technician").\n"
            + joinWith + "Or open PinPlan › Settings › Team and enter the code \(formatCode(code))."
    }
}

// MARK: - rows

/// A company team.
public struct Team: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var ownerId: String
    public init(id: String, name: String, ownerId: String) { self.id = id; self.name = name; self.ownerId = ownerId }
    enum CodingKeys: String, CodingKey { case id, name, ownerId = "owner_id" }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        ownerId = try c.decodeIfPresent(String.self, forKey: .ownerId) ?? ""
    }
}

/// Someone on the team.
public struct TeamMember: Codable, Equatable, Sendable, Identifiable {
    public var userId: String
    public var role: TeamRole
    public var name: String
    public var email: String?
    public var createdAt: String
    public var id: String { userId }
    public var label: String { TeamLogic.memberLabel(name: name, email: email) }
    public init(userId: String, role: TeamRole, name: String, email: String? = nil, createdAt: String = "") {
        self.userId = userId; self.role = role; self.name = name; self.email = email; self.createdAt = createdAt
    }
    enum CodingKeys: String, CodingKey { case userId = "user_id", role, name, email, createdAt = "created_at" }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        role = TeamRole(remote: try c.decodeIfPresent(String.self, forKey: .role))
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        email = try c.decodeIfPresent(String.self, forKey: .email)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}

/// An invite code waiting to be used (or used, expired, cancelled).
public struct TeamInvite: Codable, Equatable, Sendable, Identifiable {
    public var code: String
    public var role: TeamRole
    public var name: String
    public var createdAt: String
    public var expiresAt: String
    public var usedBy: String?
    public var usedAt: String?
    public var revoked: Bool
    public var id: String { code }
    public init(code: String, role: TeamRole, name: String, createdAt: String = "", expiresAt: String, usedBy: String? = nil, usedAt: String? = nil, revoked: Bool = false) {
        self.code = code; self.role = role; self.name = name; self.createdAt = createdAt; self.expiresAt = expiresAt
        self.usedBy = usedBy; self.usedAt = usedAt; self.revoked = revoked
    }
    enum CodingKeys: String, CodingKey { case code, role, name, createdAt = "created_at", expiresAt = "expires_at", usedBy = "used_by", usedAt = "used_at", revoked }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        code = try c.decode(String.self, forKey: .code)
        role = TeamRole(remote: try c.decodeIfPresent(String.self, forKey: .role))
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        usedBy = try c.decodeIfPresent(String.self, forKey: .usedBy)
        usedAt = try c.decodeIfPresent(String.self, forKey: .usedAt)
        revoked = try c.decodeIfPresent(Bool.self, forKey: .revoked) ?? false
    }
    public func state(now: Date = Date()) -> InviteState {
        TeamLogic.inviteState(revoked: revoked, usedBy: usedBy, expiresAt: expiresAt, now: now)
    }
}

/// What an invite code is for (looked up before joining).
public struct InviteInfo: Codable, Equatable, Sendable {
    public var team: String
    public var role: TeamRole
    public var name: String
    public var expiresAt: String
    public init(team: String, role: TeamRole, name: String, expiresAt: String) { self.team = team; self.role = role; self.name = name; self.expiresAt = expiresAt }
    enum CodingKeys: String, CodingKey { case team, role, name, expiresAt = "expires_at" }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        team = try c.decodeIfPresent(String.self, forKey: .team) ?? ""
        role = TeamRole(remote: try c.decodeIfPresent(String.self, forKey: .role))
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
    }
}

/// The signed-in user's team as last seen, kept on the device so role gating works offline.
public struct TeamSnapshot: Codable, Equatable, Sendable {
    public var userId: String
    public var team: Team?
    public var role: TeamRole?
    public var members: [TeamMember]
    /// The team's subscription from `team_billing()`. Nil when not on a team, not loaded yet, or the database has no
    /// billing update (then nothing is ever locked). Optional, so snapshots cached by older versions still decode.
    public var billing: TeamBilling?
    public init(userId: String, team: Team? = nil, role: TeamRole? = nil, members: [TeamMember] = [], billing: TeamBilling? = nil) {
        self.userId = userId; self.team = team; self.role = role; self.members = members; self.billing = billing
    }
    /// Me, from the member list.
    public var me: TeamMember? { members.first { $0.userId == userId } }
    /// Everyone's name, for task assignees.
    public var memberNames: [String] { TeamLogic.sortMembers(members).map(\.label) }
}

// MARK: - account sign-up (mirrors signupProblem / PASSWORD_MIN in src/lib/teamLogic.ts)

/// Checks for creating an account in the app, and the App Store rule for the web account link.
public enum SignupLogic {
    /// Same minimum as the web sign-up and password reset.
    public static let passwordMin = 10
    /// Supabase (bcrypt) only reads the first 72 characters.
    public static let passwordMax = 72

    /// The first problem with a new account, or nil when it's fine. `needsCompany` is false when the person is
    /// joining a team from an invite (the team already exists).
    public static func problem(email: String, password: String, name: String, company: String, needsCompany: Bool, acceptedTerms: Bool) -> String? {
        if needsCompany && company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Enter your company name." }
        if company.trimmingCharacters(in: .whitespacesAndNewlines).count > 80 { return "Keep the company name under 80 characters." }
        if name.trimmingCharacters(in: .whitespacesAndNewlines).count > 80 { return "Keep your name under 80 characters." }
        if !isEmail(email) { return "Enter a valid email address." }
        if password.count < passwordMin { return "Use a password of at least \(passwordMin) characters." }
        if password.count > passwordMax { return "Use a password of \(passwordMax) characters or fewer." }
        if !acceptedTerms { return "Agree to the Terms of Service and Privacy Policy to create an account." }
        return nil
    }

    /// Like the web's check: something@something.something, no spaces, at most 254 characters.
    public static func isEmail(_ raw: String) -> Bool {
        let e = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard e.count <= 254, !e.contains(where: \.isWhitespace) else { return false }
        let parts = e.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty else { return false }
        let domain = parts[1].split(separator: ".", omittingEmptySubsequences: false)
        return domain.count >= 2 && domain.allSatisfy { !$0.isEmpty }
    }

    /// Profile details saved with the account (Supabase `user_metadata`), like the web sign-up.
    /// `terms_accepted_at` records when the Terms of Service and Privacy Policy were agreed to.
    public static func metadata(name: String, company: String, acceptedAt: Date) -> [String: String] {
        var m = ["terms_accepted_at": ISO8601DateFormatter().string(from: acceptedAt)]
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines), c = company.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { m["name"] = n }
        if !c.isEmpty { m["company"] = c }
        return m
    }

    /// Whether the app may show a link to manage the account on the web: only on the United States storefront
    /// (App Store country code "USA"). Elsewhere the app says it in plain text with no link (guideline 3.1.3(f)).
    public static func mayLinkToWebAccount(storefrontCountry: String?) -> Bool {
        storefrontCountry?.uppercased() == "USA"
    }
}
