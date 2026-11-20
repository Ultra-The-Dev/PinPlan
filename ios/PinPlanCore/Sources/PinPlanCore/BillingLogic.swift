import Foundation

// Subscription status of the company team, as the database's `team_billing()` reports it. Mirrors src/lib/plans.ts
// (`planAllowsWork`) and src/lib/billingLogic.ts (banner, read-only lock) so the web app and the iPad / iPhone app
// agree on when a team is read-only.
//
// App Store rule: the app never sells. No prices, no "subscribe" / "buy" buttons — the wording stays neutral
// ("Your company's Northpin subscription needs attention") and owners / admins only get a link to manage their
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
    /// A cancellation scheduled in Stripe: the subscription ends then (nil: none). Missing in older caches.
    public var cancelAt: String?
    /// `billing_settings.enforce`: false while billing isn't switched on (an unpaid trial never locks). Missing = true.
    public var enforce: Bool

    public init(status: PlanStatus, trialEndsAt: String? = nil, currentPeriodEnd: String? = nil, seatLimit: Int? = nil, members: Int = 1,
                canWork: Bool? = nil, hasSubscription: Bool = false, billingEmail: String? = nil, cancelAt: String? = nil,
                enforce: Bool = true, now: Date = Date()) {
        self.status = status
        self.trialEndsAt = trialEndsAt
        self.currentPeriodEnd = currentPeriodEnd
        self.seatLimit = seatLimit
        self.members = members
        self.canWork = canWork ?? BillingLogic.planAllowsWork(status, trialEndsAt: trialEndsAt, now: now, enforce: enforce)
        self.hasSubscription = hasSubscription
        self.billingEmail = billingEmail
        self.cancelAt = cancelAt
        self.enforce = enforce
    }

    enum CodingKeys: String, CodingKey {
        case status, members, enforce
        case trialEndsAt = "trial_ends_at", currentPeriodEnd = "current_period_end", seatLimit = "seat_limit"
        case canWork = "can_work", hasSubscription = "has_subscription", billingEmail = "billing_email", cancelAt = "cancel_at"
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
        cancelAt = text(.cancelAt)
        // Older databases (and caches) don't report it: billing was always enforced there.
        enforce = ((try? c.decodeIfPresent(Bool.self, forKey: .enforce)) ?? nil) != false
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
        canWork = works ?? BillingLogic.planAllowsWork(status, trialEndsAt: trialEndsAt, enforce: enforce)
    }
}

/// The caller's personal trial when on no team, as `solo_billing()` returns it. Mirrors `SoloBilling` in
/// src/lib/billingLogic.ts.
public struct SoloBilling: Codable, Equatable, Sendable {
    /// Nil: no deadline (signed up before launch, or comped).
    public var trialEndsAt: String?
    /// `billing_settings.enforce`. Missing = true.
    public var enforce: Bool

    public init(trialEndsAt: String? = nil, enforce: Bool = true) {
        self.trialEndsAt = trialEndsAt
        self.enforce = enforce
    }

    enum CodingKeys: String, CodingKey {
        case enforce
        case trialEndsAt = "trial_ends_at"
    }

    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        let t = (try? c.decodeIfPresent(String.self, forKey: .trialEndsAt)) ?? nil
        trialEndsAt = (t ?? "").isEmpty ? nil : t
        enforce = ((try? c.decodeIfPresent(Bool.self, forKey: .enforce)) ?? nil) != false
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
    public static let inactiveMessage = "Northpin subscription inactive"
    /// After the database refused a push as inactive, wait this long before pushing again (pulls go on).
    public static let readOnlyRetry: TimeInterval = 10 * 60
    /// Shown on the link for owners and admins. Neutral on purpose (App Store: no purchasing inside the app).
    public static let manageLinkTitle = "Manage your account on the web"
    public static let askOfficeText = "Ask your office."

    /// Can the team use the app normally? Past due keeps working (the card is retried); the rest are read-only.
    /// A team that canceled, or whose first payment is pending, keeps working until its own trial ends. `enforce` is
    /// `billing_settings.enforce`: while false (billing not switched on yet) an unpaid trial never locks.
    /// Mirrors `planAllowsWork()` in src/lib/plans.ts and `plan_allows_work()` in the billing policy migration.
    public static func planAllowsWork(_ status: PlanStatus?, trialEndsAt: String?, now: Date = Date(), enforce: Bool = true) -> Bool {
        let s = status ?? .none
        if s == .active || s == .pastDue || s == .comped { return true }
        let end = TeamLogic.parseDate(trialEndsAt)
        let inTrial = end.map { $0 > now } ?? false
        // A Stripe trial carries its own end date; a trialing team without one has no deadline.
        if s == .trialing && (end == nil || inTrial) { return true }
        // The first payment is still pending, or the subscription was canceled: keep working while the team's own
        // trial runs.
        if (s == .incomplete || s == .canceled) && inTrial { return true }
        // Billing isn't switched on yet: an unpaid trial never locks.
        if !enforce && (s == .trialing || s == .incomplete || s == .none) { return true }
        if s == .none { return inTrial }
        return false
    }

    /// Can the team work right now? Nil (solo, or billing not loaded / not set up) never locks. Re-checked against
    /// the clock, so a trial that ends while the app is open locks.
    public static func allowsWork(_ b: TeamBilling?, now: Date = Date()) -> Bool {
        guard let b else { return true }
        return planAllowsWork(b.status, trialEndsAt: b.trialEndsAt, now: now, enforce: b.enforce)
    }

    /// May a person on no team work? Mirrors `soloAllowsWork()` in src/lib/billingLogic.ts and `solo_allows_work()`
    /// in the database. Nil (not loaded, or a database without solo billing) never locks.
    public static func soloAllowsWork(_ s: SoloBilling?, now: Date = Date()) -> Bool {
        guard let s, s.enforce, let end = TeamLogic.parseDate(s.trialEndsAt) else { return true }
        return end > now
    }

    /// Can this person change jobs right now? Mirrors `canWork()` in src/lib/billingLogic.ts and the database's
    /// `team_can_write()`: on a team the team's plan decides; on no team, the personal trial does.
    public static func allowsWork(onTeam: Bool, billing: TeamBilling?, solo: SoloBilling?, now: Date = Date()) -> Bool {
        onTeam ? allowsWork(billing, now: now) : soloAllowsWork(solo, now: now)
    }

    /// May jobs be changed on this device? A lapsed team's jobs are read-only everywhere (view and export only), like
    /// the web app: edits made anyway could never be sent. Unknown billing never locks.
    public static func canEdit(_ b: TeamBilling?, now: Date = Date()) -> Bool { allowsWork(b, now: now) }

    /// Same, including a person on no team whose personal trial ended.
    public static func canEdit(onTeam: Bool, billing: TeamBilling?, solo: SoloBilling?, now: Date = Date()) -> Bool {
        allowsWork(onTeam: onTeam, billing: billing, solo: solo, now: now)
    }

    /// Why a change was refused on a read-only team (nil when changes are allowed).
    public static func editBlockedMessage(_ b: TeamBilling?, role: TeamRole?, now: Date = Date()) -> String? {
        guard !canEdit(b, now: now), let b else { return nil }
        let ended = b.status == .trialing || b.status == .incomplete || b.status == .none
        let why = ended ? "Your free trial has ended" : "Your Northpin subscription is inactive"
        let office = role == .owner || role == .admin
        return "\(why), so jobs are read-only — you can still view and export everything. " + (office ? "Manage your account on the web to edit again." : askOfficeText)
    }

    /// Why a change was refused, for a team member or a person on no team (nil when changes are allowed).
    public static func editBlockedMessage(onTeam: Bool, billing: TeamBilling?, solo: SoloBilling?, role: TeamRole?, now: Date = Date()) -> String? {
        if onTeam { return editBlockedMessage(billing, role: role, now: now) }
        return soloAllowsWork(solo, now: now) ? nil : soloReadOnlyText
    }

    static let soloReadOnlyText = "Your free trial has ended, so jobs are read-only — you can still view and export everything. Manage your account on the web to keep working."

    /// The date a scheduled cancellation ends the subscription, while it is still ahead.
    static func endingAt(_ b: TeamBilling, now: Date) -> String? {
        guard let at = b.cancelAt, let d = TeamLogic.parseDate(at), d > now else { return nil }
        return at
    }

    /// "Ends Dec 1, 2026: jobs turn read-only after that."
    static func endsNote(_ iso: String) -> String { "Ends \(shortDate(iso) ?? iso): jobs turn read-only after that." }

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
        let ending = endingAt(b, now: now)
        switch b.status {
        case .comped:
            return BillingStatusLine(label: "Founder account", detail: "Free, no seat limit.", tone: .green)
        case .active:
            if let ending { return BillingStatusLine(label: "Ending", detail: endsNote(ending), tone: .amber) }
            let renews = shortDate(b.currentPeriodEnd).map { "Renews \($0)." } ?? "The subscription is active."
            return BillingStatusLine(label: "Active", detail: renews, tone: .green)
        case .pastDue:
            return BillingStatusLine(label: "Active — needs attention", detail: "The last payment didn't go through. Everything keeps working for now.", tone: .amber)
        case .trialing, .incomplete, .none:
            if !works {
                return BillingStatusLine(label: "Read-only", detail: "The trial has ended. Jobs can be viewed and exported but not changed.", tone: .red)
            }
            // Billing isn't switched on yet: the trial is over but nothing locks.
            if b.trialEndsAt != nil && daysLeft(b.trialEndsAt, now: now) == 0 {
                return BillingStatusLine(label: "Trial ended", detail: "The free trial is over. Jobs stay editable for now.", tone: .slate)
            }
            if let ending, b.status == .trialing {
                return BillingStatusLine(label: "Trial", detail: endsNote(ending), tone: .amber)
            }
            if b.trialEndsAt == nil {
                return BillingStatusLine(label: "Trial", detail: "Free trial.", tone: .slate)
            }
            let d = daysLeft(b.trialEndsAt, now: now)
            return BillingStatusLine(label: "Trial — \(plural(d, "day")) left", detail: shortDate(b.trialEndsAt).map { "Ends \($0)." } ?? "", tone: d <= 3 ? .amber : .slate)
        case .canceled where works && b.trialEndsAt != nil:
            // Canceled during the trial: still working until the trial ends.
            return BillingStatusLine(label: "Canceled", detail: endsNote(b.trialEndsAt ?? ""), tone: .amber)
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
                                 text: "Your company's Northpin subscription needs attention, so jobs are read-only. You can still view and export everything." + next,
                                 action: action, readOnly: true)
        }
        if b.status == .canceled, let end = b.trialEndsAt {
            // Canceled during the trial: still working until the trial ends.
            return BillingBanner(tone: .amber, title: "Canceled",
                                 text: "Your company's Northpin subscription was canceled. " + endsNote(end) + next, action: action, readOnly: false)
        }
        // A cancellation scheduled in Stripe, within a week.
        if b.status == .active || b.status == .trialing, let ending = endingAt(b, now: now), daysLeft(ending, now: now) <= 7 {
            return BillingBanner(tone: .amber, title: "Ending",
                                 text: "Your company's Northpin subscription is ending. " + endsNote(ending) + next, action: action, readOnly: false)
        }
        if b.status == .pastDue {
            return BillingBanner(tone: .amber, title: "Needs attention",
                                 text: "Your company's Northpin subscription needs attention." + next, action: action, readOnly: false)
        }
        // While billing isn't switched on, the trial ending changes nothing: say nothing.
        if (b.status == .trialing || b.status == .incomplete) && !b.hasSubscription && b.trialEndsAt != nil && b.enforce {
            let d = daysLeft(b.trialEndsAt, now: now)
            if d <= 3 {
                let when = d <= 1 ? "today or tomorrow" : "in \(d) days"
                return BillingBanner(tone: .amber, title: "Trial ending",
                                     text: "Your company's Northpin trial ends \(when)." + next, action: action, readOnly: false)
            }
        }
        return nil
    }

    /// The notice for a person on no team: personal trial ending (within 3 days) or over. Nil when there's nothing to
    /// say. Mirrors `soloBannerFor()` in src/lib/billingLogic.ts, in the App Store's neutral wording.
    public static func soloBanner(_ s: SoloBilling?, now: Date = Date()) -> BillingBanner? {
        guard let s, s.enforce, s.trialEndsAt != nil else { return nil }
        if !soloAllowsWork(s, now: now) {
            return BillingBanner(tone: .red, title: "Read-only", text: soloReadOnlyText, action: .manageOnWeb, readOnly: true)
        }
        let d = daysLeft(s.trialEndsAt, now: now)
        guard d <= 3 else { return nil }
        let when = d <= 1 ? "today or tomorrow" : "in \(d) days"
        return BillingBanner(tone: .amber, title: "Trial ending", text: "Your Northpin trial ends \(when).", action: .manageOnWeb, readOnly: false)
    }

    /// `solo_billing()`'s answer. Nil for JSON null (on a team, or signed out) or anything unreadable.
    public static func parseSolo(_ data: Data) -> SoloBilling? {
        guard let obj = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]), obj is [String: Any] else { return nil }
        return try? JSONDecoder().decode(SoloBilling.self, from: data)
    }

    /// Sync status while read-only: "Read-only — subscription inactive · 3 changes kept on this iPad".
    public static func readOnlyStatus(pending: Int, device: String = "device") -> String {
        let base = "Read-only — subscription inactive"
        guard pending > 0 else { return base }
        return "\(base) · \(plural(pending, "change")) kept on this \(device)"
    }

    /// A page on the Northpin web server: "<origin>/<path>" (path may carry a #fragment). Nil without an origin.
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
        // A canceled team still in its trial keeps working: the preview must be past it.
        out.trialEndsAt = nil
        out.cancelAt = nil
        out.enforce = true
        return out
    }
}

// MARK: - account deletion

/// What `DELETE /api/account` answered. The server only deletes on a fresh sign-in (the last 5 minutes) or when the
/// body carries the account's email, typed by the person (`{ "confirmEmail": … }`); otherwise it answers 403 with
/// code `reauth_required`, and the app asks for the email.
public enum AccountDeletionResult: Equatable, Sendable {
    case deleted
    /// Type the email you sign in with (or sign in again), then try again. `message` is the server's wording.
    case needsEmail(message: String)
    /// The person owns a team that still has other people on it (409).
    case teamInTheWay(message: String)
    /// Deletion isn't switched on for this server (501 / 404, except a team subscription that can't be changed).
    case unavailable
    case failed(message: String)

    public static let needsEmailFallback = "To keep your account safe, type the email you sign in with, or sign out and sign in again, then delete your account."

    /// Reads the server's answer (`{ "error": …, "code": … }`).
    public static func from(status: Int, body: Data) -> AccountDeletionResult {
        if (200..<300).contains(status) { return .deleted }
        let j = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        let message = (j?["error"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let code = j?["code"] as? String
        if code == "reauth_required" || (status == 403 && code == nil) { return .needsEmail(message: message ?? needsEmailFallback) }
        switch status {
        case 409: return .teamInTheWay(message: message ?? "You own a team that still has other people on it. Remove them (or hand the team over) first, then try again.")
        case 501, 404:
            // The team's subscription can't be changed right now: the server says what to do instead.
            if code == "billing_not_configured", let message { return .failed(message: message) }
            return .unavailable
        case 401: return .failed(message: message ?? "Your sign-in has expired. Sign in again, then delete the account.")
        default: return .failed(message: message ?? "The server answered \(status). Try again in a moment.")
        }
    }

    /// The request body: the typed email when there is one (trimmed), else nothing.
    public static func body(confirmEmail: String?) -> [String: String]? {
        let e = (confirmEmail ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return e.isEmpty ? nil : ["confirmEmail": e]
    }
}
