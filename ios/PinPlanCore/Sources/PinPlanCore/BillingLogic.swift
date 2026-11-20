import Foundation

// Subscription status of the company team, as the database's `team_billing()` reports it. Mirrors src/lib/plans.ts
// (`planAllowsWork`) and src/lib/billingLogic.ts (banner, read-only lock) so the web app and the iPad / iPhone app
// agree on when a team is read-only.
//
// App Store rule: the app never sells. No prices, no "subscribe" / "buy" buttons — the wording stays neutral
// ("Your company's PinPlan subscription needs attention") and owners / admins only get a link to manage their
// account on the web.

/// `teams.plan_status`. `none` = no billing record (or a value this version doesn't know).
public enum PlanStatus: String, Codable, CaseIterable, Sendable {
    case trialing, active
    case pastDue = "past_due"
    case canceled, unpaid, incomplete, comped, none

    /// Unknown values (a newer server) count as `none`, which only works while a trial runs.
    public init(remote: String?) { self = PlanStatus(rawValue: remote ?? "") ?? .none }
}

/// The caller's team billing, as `team_billing()` returns it (snake_case JSON; cached on the device the same way).
public struct TeamBilling: Codable, Equatable, Sendable {
    public var status: PlanStatus
    public var trialEndsAt: String?
    public var currentPeriodEnd: String?
    /// Nil: no seat limit (trial, comped, or not set yet).
    public var seatLimit: Int?
    public var members: Int
    /// What the server said when it was loaded. The app re-checks the clock (`BillingLogic.allowsWork`).
    public var canWork: Bool
    public var hasSubscription: Bool
    public var billingEmail: String?

    public init(status: PlanStatus, trialEndsAt: String? = nil, currentPeriodEnd: String? = nil, seatLimit: Int? = nil, members: Int = 1,
                canWork: Bool? = nil, hasSubscription: Bool = false, billingEmail: String? = nil, now: Date = Date()) {
        self.status = status
        self.trialEndsAt = trialEndsAt
        self.currentPeriodEnd = currentPeriodEnd
        self.seatLimit = seatLimit
        self.members = members
        self.canWork = canWork ?? BillingLogic.planAllowsWork(status, trialEndsAt: trialEndsAt, now: now)
        self.hasSubscription = hasSubscription
        self.billingEmail = billingEmail
    }

    enum CodingKeys: String, CodingKey {
        case status, members
        case trialEndsAt = "trial_ends_at", currentPeriodEnd = "current_period_end", seatLimit = "seat_limit"
        case canWork = "can_work", hasSubscription = "has_subscription", billingEmail = "billing_email"
    }

    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        status = PlanStatus(remote: try? c.decodeIfPresent(String.self, forKey: .status))
        func text(_ k: CodingKeys) -> String? {
            guard let s = (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil, !s.isEmpty else { return nil }
            return s
        }
        trialEndsAt = text(.trialEndsAt)
        currentPeriodEnd = text(.currentPeriodEnd)
        billingEmail = text(.billingEmail)
        if let n = (try? c.decodeIfPresent(Int.self, forKey: .seatLimit)) ?? nil {
            seatLimit = n
        } else if let n = (try? c.decodeIfPresent(Double.self, forKey: .seatLimit)) ?? nil, n.isFinite {
            seatLimit = Int(n)
        } else {
            seatLimit = nil
        }
        let m = ((try? c.decodeIfPresent(Int.self, forKey: .members)) ?? nil) ?? 0
        members = max(0, m)
        hasSubscription = ((try? c.decodeIfPresent(Bool.self, forKey: .hasSubscription)) ?? nil) ?? false
        let works = (try? c.decodeIfPresent(Bool.self, forKey: .canWork)) ?? nil
        canWork = works ?? BillingLogic.planAllowsWork(status, trialEndsAt: trialEndsAt)
    }
}

/// How a status line or banner should look.
public enum BillingTone: String, Sendable, Equatable {
    case green, slate, amber, red
}

/// Settings › Team: "Trial — 9 days left", "Active", "Founder account", "Read-only".
public struct BillingStatusLine: Equatable, Sendable {
    public var label: String
    public var detail: String
    public var tone: BillingTone
}

/// The notice on the Projects screen and in a job.
public struct BillingBanner: Equatable, Sendable {
    public enum Action: String, Sendable, Equatable {
        /// Owner / admin: a neutral link to manage the account on the web.
        case manageOnWeb
        /// Technician: nothing to tap; the office sorts it out.
        case askOffice
    }
    public var tone: BillingTone
    public var title: String
    public var text: String
    public var action: Action
    public var readOnly: Bool
}

public enum BillingLogic {
    public static let trialDays = 14
    /// The database refuses job writes with this message (error P0001) when the team can't work.
    public static let inactiveMessage = "PinPlan subscription inactive"
    /// After the database refused a push as inactive, wait this long before pushing again (pulls go on).
    public static let readOnlyRetry: TimeInterval = 10 * 60
    /// Shown on the link for owners and admins. Neutral on purpose (App Store: no purchasing inside the app).
    public static let manageLinkTitle = "Manage your account on the web"
    public static let askOfficeText = "Ask your office."

    /// Can the team use the app normally? Past due keeps working (the card is retried); the rest are read-only.
    /// Mirrors `planAllowsWork()` in src/lib/plans.ts and `plan_allows_work()` in the billing migration.
    public static func planAllowsWork(_ status: PlanStatus?, trialEndsAt: String?, now: Date = Date()) -> Bool {
        let s = status ?? .none
        if s == .active || s == .pastDue || s == .comped { return true }
        let end = TeamLogic.parseDate(trialEndsAt)
        let inTrial = end.map { $0 > now } ?? false
        // A Stripe trial carries its own end date; a trialing team without one has no deadline.
        if s == .trialing { return end == nil || inTrial }
        // The first payment is still pending: keep working while the team's own trial runs.
        if s == .incomplete || s == .none { return inTrial }
        return false
    }

    /// Can the team work right now? Nil (solo, or billing not loaded / not set up) never locks. Re-checked against
    /// the clock, so a trial that ends while the app is open locks.
    public static func allowsWork(_ b: TeamBilling?, now: Date = Date()) -> Bool {
        guard let b else { return true }
        return planAllowsWork(b.status, trialEndsAt: b.trialEndsAt, now: now)
    }

    /// May jobs be changed on this device? A lapsed team's jobs are read-only everywhere (view and export only), like
    /// the web app: edits made anyway could never be sent. Solo users and unknown billing never lock.
    public static func canEdit(_ b: TeamBilling?, now: Date = Date()) -> Bool { allowsWork(b, now: now) }

    /// Why a change was refused on a read-only team (nil when changes are allowed).
    public static func editBlockedMessage(_ b: TeamBilling?, role: TeamRole?, now: Date = Date()) -> String? {
        guard !canEdit(b, now: now), let b else { return nil }
        let ended = b.status == .trialing || b.status == .incomplete || b.status == .none
        let why = ended ? "Your free trial has ended" : "Your PinPlan subscription is inactive"
        let office = role == .owner || role == .admin
        return "\(why), so jobs are read-only — you can still view and export everything. " + (office ? "Manage your account on the web to edit again." : askOfficeText)
    }

    /// `team_billing()`'s answer. Nil for JSON null (not on a team) or anything unreadable.
    public static func parse(_ data: Data) -> TeamBilling? {
        guard let obj = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]), obj is [String: Any] else { return nil }
        return try? JSONDecoder().decode(TeamBilling.self, from: data)
    }

    /// Did the database refuse a write because the team's subscription lapsed?
    public static func isSubscriptionInactive(_ message: String?) -> Bool {
        guard let m = message, !m.isEmpty else { return false }
        return m.contains(inactiveMessage)
    }

    /// Whole days left until `iso` (rounded up; 0 when past or unknown).
    public static func daysLeft(_ iso: String?, now: Date = Date()) -> Int {
        guard let end = TeamLogic.parseDate(iso) else { return 0 }
        let secs = end.timeIntervalSince(now)
        if secs <= 0 { return 0 }
        return Int((secs / 86_400).rounded(.up))
    }

    static func plural(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }

    /// "Mar 4, 2027" (UTC, so it doesn't shift a day with the device's time zone).
    public static func shortDate(_ iso: String?) -> String? {
        guard let d = TeamLogic.parseDate(iso) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMM d, yyyy"
        return f.string(from: d)
    }

    /// One line for Settings › Team.
    public static func statusLine(_ b: TeamBilling, now: Date = Date()) -> BillingStatusLine {
        let works = allowsWork(b, now: now)
        switch b.status {
        case .comped:
            return BillingStatusLine(label: "Founder account", detail: "Free, no seat limit.", tone: .green)
        case .active:
            let renews = shortDate(b.currentPeriodEnd).map { "Renews \($0)." } ?? "The subscription is active."
            return BillingStatusLine(label: "Active", detail: renews, tone: .green)
        case .pastDue:
            return BillingStatusLine(label: "Active — needs attention", detail: "The last payment didn't go through. Everything keeps working for now.", tone: .amber)
        case .trialing, .incomplete, .none:
            if !works {
                return BillingStatusLine(label: "Read-only", detail: "The trial has ended. Jobs can be viewed and exported but not changed.", tone: .red)
            }
            if b.trialEndsAt == nil {
                return BillingStatusLine(label: "Trial", detail: "Free trial.", tone: .slate)
            }
            let d = daysLeft(b.trialEndsAt, now: now)
            return BillingStatusLine(label: "Trial — \(plural(d, "day")) left", detail: shortDate(b.trialEndsAt).map { "Ends \($0)." } ?? "", tone: d <= 3 ? .amber : .slate)
        case .canceled, .unpaid:
            return BillingStatusLine(label: "Read-only", detail: "The subscription isn't active. Jobs can be viewed and exported but not changed.", tone: .red)
        }
    }

    /// "5 of 6 seats used", or "5 people · no seat limit".
    public static func seatsText(_ b: TeamBilling) -> String {
        if let limit = b.seatLimit { return "\(b.members) of \(limit) seat\(limit == 1 ? "" : "s") used" }
        let people = b.members == 1 ? "1 person" : "\(b.members) people"
        return "\(people) · no seat limit"
    }

    /// Is every seat taken (an invite will be refused when they try to join)?
    public static func seatsFull(_ b: TeamBilling?) -> Bool {
        guard let b, let limit = b.seatLimit else { return false }
        return b.members >= limit
    }

    /// The notice: read-only, payment needs attention, or the trial ends within 3 days. Nil when there's nothing to say.
    public static func banner(_ b: TeamBilling?, role: TeamRole?, now: Date = Date()) -> BillingBanner? {
        guard let b, b.status != .comped else { return nil }
        let office = role == .owner || role == .admin || role == nil
        let action: BillingBanner.Action = office ? .manageOnWeb : .askOffice
        let next = office ? "" : " " + askOfficeText
        if !allowsWork(b, now: now) {
            return BillingBanner(tone: .red, title: "Read-only",
                                 text: "Your company's PinPlan subscription needs attention, so jobs are read-only. You can still view and export everything." + next,
                                 action: action, readOnly: true)
        }
        if b.status == .pastDue {
            return BillingBanner(tone: .amber, title: "Needs attention",
                                 text: "Your company's PinPlan subscription needs attention." + next, action: action, readOnly: false)
        }
        if (b.status == .trialing || b.status == .incomplete) && !b.hasSubscription && b.trialEndsAt != nil {
            let d = daysLeft(b.trialEndsAt, now: now)
            if d <= 3 {
                let when = d <= 1 ? "today or tomorrow" : "in \(d) days"
                return BillingBanner(tone: .amber, title: "Trial ending",
                                     text: "Your company's PinPlan trial ends \(when)." + next, action: action, readOnly: false)
            }
        }
        return nil
    }

    /// Sync status while read-only: "Read-only — subscription inactive · 3 changes kept on this iPad".
    public static func readOnlyStatus(pending: Int, device: String = "device") -> String {
        let base = "Read-only — subscription inactive"
        guard pending > 0 else { return base }
        return "\(base) · \(plural(pending, "change")) kept on this \(device)"
    }

    /// A page on the PinPlan web server: "<origin>/<path>" (path may carry a #fragment). Nil without an origin.
    public static func webURL(origin: String, path: String) -> String? {
        var o = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !o.isEmpty else { return nil }
        if !o.lowercased().hasPrefix("http") { o = "https://" + o }
        while o.hasSuffix("/") { o.removeLast() }
        var p = path
        while p.hasPrefix("/") { p.removeFirst() }
        return p.isEmpty ? o : "\(o)/\(p)"
    }

    /// Where owners and admins manage the subscription: "<origin>/settings#billing".
    public static func manageURL(origin: String) -> String? { webURL(origin: origin, path: "settings#billing") }

    /// For screenshots: the cached billing turned into a read-only (lapsed) team.
    public static func readOnlyPreview(_ b: TeamBilling?, now: Date = Date()) -> TeamBilling {
        var out = b ?? TeamBilling(status: .canceled, members: 1, now: now)
        out.status = .canceled
        out.canWork = false
        out.hasSubscription = true
        return out
    }
}
