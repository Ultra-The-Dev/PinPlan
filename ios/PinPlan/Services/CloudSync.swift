import Foundation
import Security
import UIKit
import Observation
import PinPlanCore

/// Session tokens for the cloud account, kept in the Keychain (never in the documents folder or backups).
///
/// Items are "this device only": they never move to another device through an encrypted backup or a device transfer.
/// Keychain items outlive deleting the app, so `CloudSync.init` removes the session on the first launch of a fresh
/// install (no `installIdKey` in UserDefaults, which is deleted with the app): a reinstall starts signed out.
enum Keychain {
    private static let service = "app.pinplan.cloud"
    static let accessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    /// Set on the first launch of this install.
    static let installIdKey = "pinplan.installId"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    /// Store `data`. False (and nothing stored) when the Keychain refused it: the sign-in then lasts until the app closes.
    @discardableResult
    static func save(_ data: Data, account: String) -> Bool {
        let q = query(account)
        SecItemDelete(q as CFDictionary)
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = accessible
        let status = SecItemAdd(add as CFDictionary, nil)
        if status != errSecSuccess {
            NSLog("Northpin: couldn't save the sign-in to the Keychain (OSStatus %d)", status)
            return false
        }
        return true
    }

    static func load(account: String) -> Data? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    /// Items saved by older versions could move to a new device in a backup: make them this-device-only.
    static func migrateAccessibility(account: String) {
        let status = SecItemUpdate(query(account) as CFDictionary, [kSecAttrAccessible as String: accessible] as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            // Can't change it in place: drop it (signing in again saves it the new way).
            NSLog("Northpin: couldn't update the saved sign-in (OSStatus %d); removing it", status)
            delete(account: account)
        }
    }

    static func delete(account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }

    /// First launch of this install (the app was just installed, or reinstalled): forget any sign-in an earlier
    /// install left in the Keychain. True when it was a first launch. `upgradeKeys`: settings an earlier version of
    /// this same install wrote (UserDefaults go with the app, the Keychain doesn't), so updating the app from a version
    /// without the marker doesn't sign everyone out.
    @discardableResult
    static func resetOnFreshInstall(account: String, upgradeKeys: [String] = [], defaults: UserDefaults = .standard) -> Bool {
        guard defaults.string(forKey: installIdKey) == nil else { return false }
        defaults.set(UUID().uuidString, forKey: installIdKey)
        if upgradeKeys.contains(where: { defaults.object(forKey: $0) != nil }) { return false }
        delete(account: account)
        return true
    }
}

/// Minimal Supabase client: email/password auth, table rows (PostgREST) and the private "plans" storage bucket.
/// Only the public project URL and anon key live in the app; row-level security on the server decides what a user can see.
struct SupabaseClient {
    struct Config: Codable, Equatable { var url: String; var anonKey: String }
    struct Session: Codable { var accessToken: String; var refreshToken: String; var expiresAt: Date; var userId: String; var email: String }
    struct Failure: LocalizedError {
        let message: String
        /// HTTP status when the server answered (0 = no answer, e.g. offline).
        var status: Int = 0
        /// PostgREST / Postgres error code when there is one ("42501", "PGRST205", "23505"…).
        var code: String? = nil
        var errorDescription: String? { message }
        /// The server answered and refused this request (bad row, not allowed, missing table). Retrying the same
        /// request won't help, but other requests may still work. Not an expired sign-in or a busy server.
        var isRefusal: Bool { (400..<500).contains(status) && ![401, 408, 429].contains(status) }
        /// The cloud table doesn't exist yet (the database is a migration behind the app).
        var isMissingTable: Bool { SyncPaging.isMissingTable(code: code, message: message) }
    }

    let config: Config
    var base: URL { URL(string: config.url.hasSuffix("/") ? String(config.url.dropLast()) : config.url)! }

    private func request(_ path: String, query: String? = nil, method: String = "GET", token: String? = nil) -> URLRequest {
        var s = base.absoluteString + path
        if let query { s += "?" + query }
        var r = URLRequest(url: URL(string: s)!)
        r.httpMethod = method
        r.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(token ?? config.anonKey)", forHTTPHeaderField: "Authorization")
        r.timeoutInterval = 60
        return r
    }

    private func send(_ r: URLRequest) async throws -> Data {
        let (data, resp) = try await URLSession.shared.data(for: r)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            var msg = (j?["error_description"] ?? j?["msg"] ?? j?["message"] ?? j?["error"]) as? String
            switch (j?["error_code"] as? String) ?? "" {
            case "invalid_credentials": msg = String(localized: "Wrong email or password. Use the same ones as on the web app.")
            case "email_not_confirmed": msg = String(localized: "This email isn't confirmed yet. Open the confirmation email (check spam), then sign in.")
            case "user_already_exists": msg = String(localized: "This email already has an account — tap Sign in instead.")
            case "over_email_send_rate_limit": msg = String(localized: "Too many emails sent — wait an hour, or sign in if the account already exists.")
            default: break
            }
            throw Failure(message: msg ?? String(localized: "Cloud server returned \(status)"), status: status, code: j?["code"] as? String)
        }
        return data
    }

    // MARK: auth

    private func session(from data: Data) throws -> Session {
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = j["access_token"] as? String, let refresh = j["refresh_token"] as? String,
              let user = j["user"] as? [String: Any], let uid = user["id"] as? String else {
            // Sign-up without a session: either a new account waiting for its confirmation email, or an email that
            // already has an account (Supabase sends nothing then, and doesn't say which).
            throw Failure(message: String(localized: "If you already have an account with this email, tap Sign in instead (no email is sent). If it's new, open the confirmation email (check spam), then sign in."))
        }
        let expires = (j["expires_in"] as? Double) ?? 3600
        return Session(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expires - 60), userId: uid, email: user["email"] as? String ?? "")
    }

    func signIn(email: String, password: String) async throws -> Session {
        var r = request("/auth/v1/token", query: "grant_type=password", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        return try session(from: try await send(r))
    }

    /// Create an account. Nil when the project asks new accounts to confirm their email first (no session yet), or
    /// when the email already has an account (Supabase answers the same way then, and sends nothing).
    func signUp(email: String, password: String) async throws -> Session? {
        var r = request("/auth/v1/signup", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let data = try await send(r)
        let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard j?["access_token"] is String else { return nil }
        return try session(from: data)
    }

    /// Send a password-reset email (`POST /auth/v1/recover`). The link in it opens `redirectTo` (the web app's reset
    /// page), where a new password is set. Supabase answers the same whether or not the email has an account.
    func recover(email: String, redirectTo: String?) async throws {
        var query: String?
        if let redirectTo, let enc = redirectTo.addingPercentEncoding(withAllowedCharacters: .alphanumerics) { query = "redirect_to=\(enc)" }
        var r = request("/auth/v1/recover", query: query, method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["email": email]
        if let redirectTo { body["redirect_to"] = redirectTo }
        r.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await send(r)
    }

    /// End this session on the server (`POST /auth/v1/logout?scope=local`): its refresh token stops working.
    func logout(token: String) async throws {
        var r = request("/auth/v1/logout", query: "scope=local", method: "POST", token: token)
        r.timeoutInterval = 10   // signing out mustn't hang on a bad connection
        _ = try await send(r)
    }

    /// Ask for a one-time sign-in code by email (`POST /auth/v1/otp`), for an existing account only.
    func sendCode(email: String) async throws {
        var r = request("/auth/v1/otp", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "create_user": false])
        _ = try await send(r)
    }

    /// Sign in with the emailed code (`POST /auth/v1/verify`, type email).
    func verifyCode(email: String, code: String) async throws -> Session {
        var r = request("/auth/v1/verify", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["type": "email", "email": email, "token": code])
        return try session(from: try await send(r))
    }

    func refresh(_ s: Session) async throws -> Session {
        var r = request("/auth/v1/token", query: "grant_type=refresh_token", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": s.refreshToken])
        return try session(from: try await send(r))
    }

    // MARK: rows

    func upsert(_ table: String, conflict: String, rows: [[String: Any]], token: String) async throws {
        var r = request("/rest/v1/\(table)", query: "on_conflict=\(conflict)", method: "POST", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        r.httpBody = try JSONSerialization.data(withJSONObject: rows)
        _ = try await send(r)
    }

    func patch(_ table: String, filter: String, values: [String: Any], token: String) async throws {
        var r = request("/rest/v1/\(table)", query: filter, method: "PATCH", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        r.httpBody = try JSONSerialization.data(withJSONObject: values)
        _ = try await send(r)
    }

    /// One page of rows changed on the server since the cursor (synced_at >= since, oldest first, by key within a
    /// stamp), with named columns only (`SyncMap.pullQuery`: never '*', never the price columns).
    func page(_ t: SyncTable, cursor: SyncPaging.Cursor, missing: Set<String>, token: String) async throws -> [[String: Any]] {
        let r = request("/rest/v1/\(SyncMap.specs[t]!.remote)", query: SyncMap.pullQuery(t, cursor, missing: missing), token: token)
        return (try JSONSerialization.jsonObject(with: try await send(r)) as? [[String: Any]]) ?? []
    }

    /// Rows by id (rows a pull couldn't apply before).
    func rows(_ t: SyncTable, ids: [String], missing: Set<String>, token: String) async throws -> [[String: Any]] {
        guard !ids.isEmpty else { return [] }
        let r = request("/rest/v1/\(SyncMap.specs[t]!.remote)", query: SyncMap.byIdQuery(t, ids, missing: missing), token: token)
        return (try JSONSerialization.jsonObject(with: try await send(r)) as? [[String: Any]]) ?? []
    }

    /// Call a database function (`POST /rest/v1/rpc/<name>`). Without a token it runs as the public (anon) role.
    func rpc(_ name: String, params: [String: Any], token: String?) async throws -> Data {
        var r = request("/rest/v1/rpc/\(name)", method: "POST", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: params)
        return try await send(r)
    }

    func select(_ table: String, query: String, token: String) async throws -> Data {
        try await send(request("/rest/v1/\(table)", query: query, token: token))
    }

    /// Insert a row unless one with the same key exists (then nothing changes).
    func insertIfMissing(_ table: String, conflict: String, row: [String: Any], token: String) async throws {
        var r = request("/rest/v1/\(table)", query: "on_conflict=\(conflict)", method: "POST", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("resolution=ignore-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        r.httpBody = try JSONSerialization.data(withJSONObject: [row])
        _ = try await send(r)
    }

    /// Update rows and return how many were changed (row security can leave none).
    func updateCounting(_ table: String, filter: String, values: [String: Any], select: String, token: String) async throws -> Int {
        var r = request("/rest/v1/\(table)", query: filter + "&select=" + select, method: "PATCH", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("return=representation", forHTTPHeaderField: "Prefer")
        r.httpBody = try JSONSerialization.data(withJSONObject: values)
        let data: Data = try await send(r)
        let rows: [Any] = (try? JSONSerialization.jsonObject(with: data)) as? [Any] ?? []
        return rows.count
    }

    func insert(_ table: String, row: [String: Any], token: String) async throws -> Data {
        var r = request("/rest/v1/\(table)", method: "POST", token: token)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("return=representation", forHTTPHeaderField: "Prefer")
        r.httpBody = try JSONSerialization.data(withJSONObject: row)
        return try await send(r)
    }

    // MARK: storage

    func upload(bucket: String, path: String, data: Data, token: String, contentType: String = "image/jpeg") async throws {
        var r = request("/storage/v1/object/\(bucket)/\(path)", method: "POST", token: token)
        r.setValue(contentType, forHTTPHeaderField: "Content-Type")
        // Files replaced in place (the job's plans PDF) shouldn't be cached for long.
        r.setValue("max-age=60", forHTTPHeaderField: "cache-control")
        r.setValue("true", forHTTPHeaderField: "x-upsert")
        r.httpBody = data
        r.timeoutInterval = 180
        _ = try await send(r)
    }

    func publicURL(bucket: String, path: String) -> String { base.absoluteString + "/storage/v1/object/public/\(bucket)/\(path)" }

    func upload(path: String, data: Data, token: String) async throws {
        var r = request("/storage/v1/object/plans/\(path)", method: "POST", token: token)
        r.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        r.setValue("true", forHTTPHeaderField: "x-upsert")
        r.httpBody = data
        r.timeoutInterval = 180
        _ = try await send(r)
    }

    func download(path: String, token: String) async throws -> Data {
        var r = request("/storage/v1/object/authenticated/plans/\(path)", token: token)
        r.timeoutInterval = 180
        return try await send(r)
    }
}

/// Keeps this device's jobs, catalog and products in step with the cloud account — the same data the web app syncs.
/// Local-first: everything works offline; changes go up and come down whenever there is a connection.
@MainActor
@Observable
final class CloudSync {
    private(set) var config: SupabaseClient.Config?
    private(set) var session: SupabaseClient.Session?
    private(set) var syncing = false
    private(set) var lastSync: Date?
    private(set) var lastError: String?
    private(set) var lastSummary: String?
    /// Per job: photos / documents on this device not uploaded yet. Refreshed after each sync and on edits.
    private(set) var uploadBacklogs: [String: UploadBacklog] = [:]
    /// The signed-in user's company team as last loaded (kept on the device, so role gating works offline).
    /// `team == nil` inside means signed in but not on a team: working alone, full access.
    private(set) var team: TeamSnapshot?
    /// On no team: the personal trial (`solo_billing()`) of `soloUserId`, cached on the device. Read through `solo`.
    private(set) var soloBilling: SoloBilling?
    @ObservationIgnored private var soloUserId: String?
    /// The cloud database doesn't have the team tables yet (supabase/migrations/20261120000000_teams.sql not run).
    private(set) var teamNeedsMigration = false
    private(set) var teamError: String?
    /// Something worth telling once ("You joined Acme as Technician", "Only the office can delete a job…").
    var teamNotice: String?

    /// When the team was last loaded from the cloud (syncs refresh it at most about once a minute).
    @ObservationIgnored var teamLoadedAt: Date?

    /// The team's subscription has lapsed (or the database refused a push as "Northpin subscription inactive"): this
    /// device keeps pulling but stops pushing. Local edits stay queued and go up once the team is active again.
    private(set) var readOnly = false
    /// Changes on this device the cloud doesn't have yet (counted while read-only, for the status line).
    private(set) var pendingChanges = 0
    /// After the database refused a push as inactive, don't push again before this (pulls go on).
    @ObservationIgnored private var readOnlyUntil: Date?

    /// This device holds jobs of another account than the one signed in. Nothing syncs until the person chooses:
    /// remove those jobs from this device (`removeOtherAccountsJobs`) or sign out. They are never pushed into this account.
    private(set) var accountSwitch: AccountSwitchPrompt?
    struct AccountSwitchPrompt: Equatable {
        /// Jobs on this device now.
        var jobs: Int
        /// The account they were last synced with, when known.
        var previousEmail: String?
        var message: String {
            if let previousEmail {
                return String(localized: "This device has \(jobs) jobs from another account (\(previousEmail)). To sync this account, remove them from this device first (they stay in the other account's cloud), or sign out.")
            }
            return String(localized: "This device has \(jobs) jobs from another account. To sync this account, remove them from this device first (they stay in the other account's cloud), or sign out.")
        }
    }
    /// Cloud tables the database doesn't have yet (the latest migration hasn't been run): their rows wait.
    private(set) var missingTables: [String] = []
    /// Columns this build names that the cloud database doesn't have yet (left out of pulls until the app restarts).
    @ObservationIgnored private var missingColumns: [SyncTable: Set<String>] = [:]
    /// Rows the last pull refused because their ids aren't ones this app makes (never merged, never fetched again).
    private(set) var refusedRows = 0

    @ObservationIgnored private weak var app: AppModel?
    @ObservationIgnored private var ledger = SyncLedger()
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var pendingKick: Task<Void, Never>?

    private static let configKey = "pinplan.cloud.config"
    private static let sessionAccount = "session"
    /// The account the jobs on this device were last synced with (and its email, for the prompt).
    static let dataOwnerKey = "pinplan.cloud.dataOwner"
    private static let dataOwnerEmailKey = "pinplan.cloud.dataOwnerEmail"
    /// Signed out and chose to keep the jobs on this device: they stay hidden until this account (its user id) signs
    /// in again.
    static let jobsLockedKey = "pinplan.cloud.jobsLockedFor"
    /// The last team loaded on this device (any account), kept across sign-out so the role fails closed.
    @ObservationIgnored private(set) var lastTeam: TeamSnapshot?

    init() {
        if let d = UserDefaults.standard.data(forKey: Self.configKey) {
            config = (try? JSONDecoder().decode(SupabaseClient.Config.self, from: d)).flatMap { Self.allowed($0) ? $0 : nil }
        }
        // A reinstall starts signed out: the Keychain keeps items after the app is deleted.
        Keychain.resetOnFreshInstall(account: Self.sessionAccount, upgradeKeys: [Self.configKey, Self.dataOwnerKey])
        if let d = Keychain.load(account: Self.sessionAccount) {
            Keychain.migrateAccessibility(account: Self.sessionAccount)
            let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
            session = try? dec.decode(SupabaseClient.Session.self, from: d)
        }
        // Signed in without a cloud project to use it with: nothing to keep.
        if config == nil, session != nil { session = nil; Keychain.delete(account: Self.sessionAccount) }
        lastTeam = Self.cachedTeam()
        loadTeamCache()
    }

    /// A cloud project address this build may use: https (http only in debug builds, for a local test project).
    static func allowed(_ c: SupabaseClient.Config) -> Bool { CloudEndpoint.url(c.url, allowHTTP: APIClient.allowsHTTP) != nil }

    var signedIn: Bool { session != nil && config != nil }
    private var client: SupabaseClient? { config.map { SupabaseClient(config: $0) } }

    func attach(_ app: AppModel) {
        self.app = app
        hideLockedJobs()
        loadLedger()
        refreshUploadBacklogs()
        startLoop()
    }

    /// Photos and documents of this job that this device holds but hasn't uploaded yet.
    func uploadBacklog(projectId: String) -> UploadBacklog { uploadBacklogs[projectId] ?? UploadBacklog() }

    func refreshUploadBacklogs() {
        guard let app else { uploadBacklogs = [:]; return }
        var out: [String: UploadBacklog] = [:]
        for b in app.projects {
            let n = backlog(b, store: app.store)
            if n.total > 0 { out[b.project.id] = n }
        }
        if out != uploadBacklogs { uploadBacklogs = out }
    }

    private func refreshUploadBacklog(_ b: ProjectBundle, store: Store) {
        let n = backlog(b, store: store)
        let next: UploadBacklog? = n.total > 0 ? n : nil
        if uploadBacklogs[b.project.id] != next { uploadBacklogs[b.project.id] = next }
    }

    /// Only files missing from the ledger are checked on disk, so this stays cheap once a job is uploaded.
    private func backlog(_ b: ProjectBundle, store: Store) -> UploadBacklog {
        ledger.uploadBacklog(b) { id, isDocument in isDocument ? store.hasFile(id) : store.hasImage(id) }
    }

    // MARK: setup

    /// Use this cloud project (empty: none). Only an https address is taken (http only in debug builds). Switching to
    /// another project while signed in signs out first: the sign-in belongs to the old one.
    @discardableResult
    func setConfig(url: String, anonKey: String) -> Bool {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines), k = anonKey.trimmingCharacters(in: .whitespacesAndNewlines)
        var next: SupabaseClient.Config?
        if !u.isEmpty && !k.isEmpty {
            guard let parsed = CloudEndpoint.url(u, allowHTTP: APIClient.allowsHTTP) else { return false }
            var s = parsed.absoluteString
            while s.hasSuffix("/") { s.removeLast() }
            next = .init(url: s, anonKey: k)
        }
        if next != config, signedIn { signOutKeepingData() }
        config = next
        if let config, let d = try? JSONEncoder().encode(config) { UserDefaults.standard.set(d, forKey: Self.configKey) } else { UserDefaults.standard.removeObject(forKey: Self.configKey) }
        return true
    }

    /// Fetch the cloud settings from the Northpin server (they are public values: project URL + anon key).
    func configure(from api: APIClient) async throws {
        var req = URLRequest(url: api.baseURL.appendingPathComponent("api/config"))
        req.timeoutInterval = 20
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any], let url = j["supabaseUrl"] as? String, let key = j["supabaseAnonKey"] as? String,
              !url.isEmpty, !key.isEmpty else {
            throw SupabaseClient.Failure(message: String(localized: "Cloud sync isn't switched on for that Northpin server yet."))
        }
        // Passwords and session tokens go to this address: never over plain http.
        guard CloudEndpoint.url(url, allowHTTP: APIClient.allowsHTTP) != nil, setConfig(url: url, anonKey: key) else {
            throw SupabaseClient.Failure(message: String(localized: "That Northpin server gave a cloud address that isn't secure (https), so it wasn't used."))
        }
    }

    func signIn(email: String, password: String, create: Bool) async throws {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Connect a cloud project first.")) }
        if create {
            guard try await createAccount(email: email, password: password) else {
                throw SupabaseClient.Failure(message: SignUpOutcome.confirmEmail(email).message)
            }
            return
        }
        await begin(try await client.signIn(email: email, password: password))
    }

    /// What happened when creating an account.
    enum SignUpOutcome: Equatable {
        case signedIn
        /// The project asks new accounts to confirm their email (or the email already has an account).
        case confirmEmail(String)
        var message: String {
            switch self {
            case .signedIn: return String(localized: "Account created.")
            case .confirmEmail(let e):
                if e.isEmpty { return String(localized: "Check your inbox for the confirmation email (and spam), tap the link, then come back and sign in. If this email already has an account, just sign in.") }
                return String(localized: "Check \(e) for the confirmation email (and spam), tap the link, then come back and sign in. If this email already has an account, just sign in.")
            }
        }
    }

    /// Create an account (`POST /auth/v1/signup`). True when it signed straight in; false when the email has to be
    /// confirmed first. Any invite code remembered with `rememberPendingInvite` is used after the next sign-in.
    @discardableResult
    func createAccount(email: String, password: String) async throws -> Bool {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Connect a cloud project first.")) }
        guard let s = try await client.signUp(email: email, password: password) else { return false }
        await begin(s)
        return true
    }

    /// A new sign-in: switch ledgers, learn the team (and finish a remembered invite), then sync.
    private func begin(_ s: SupabaseClient.Session) async {
        if let old = session, old.userId != s.userId { ledger = SyncLedger(); team = nil; soloBilling = nil; soloUserId = nil }
        store(s)
        unlockJobs(for: s.userId)
        loadLedger()
        loadTeamCache()
        await loadTeam()
        await finishPendingInvite()
        await syncNow()
    }

    // MARK: signing out

    /// Sign out: the session is revoked on the server first (`POST /auth/v1/logout?scope=local`, so a copied token
    /// stops working), then forgotten here. `removeData` (the default the screen offers) removes everything this
    /// app keeps on this device (`AppModel.wipeLocalData`); otherwise the jobs stay on the device, hidden until the
    /// same account signs in again.
    func signOut(removeData: Bool) async {
        if let client, let s = session { await revoke(s, client: client) }
        if removeData, let app {
            app.wipeLocalData()   // also ends the session here (wipeForAccountDeletion)
        } else {
            endSession(lockJobs: true)
        }
    }

    /// Sign out without asking (a different cloud project or server was chosen): revoke in the background, keep the
    /// jobs hidden for this account.
    func signOutKeepingData() {
        if let client, let s = session { Task { await self.revoke(s, client: client) } }
        endSession(lockJobs: true)
    }

    /// Changes on this device the cloud doesn't have yet (asked before signing out).
    var unsyncedChanges: Int {
        guard let app, signedIn else { return 0 }
        return countPending(app)
    }

    /// Ask the server to end this session. Errors (offline, already ended) are ignored: signing out goes on.
    private func revoke(_ s: SupabaseClient.Session, client: SupabaseClient) async {
        try? await client.logout(token: s.accessToken)
    }

    /// Forget the session and everything tied to it on this device. The last team stays cached (`teamKey`), so the role
    /// keeps failing closed while nobody is signed in; `lockJobs` hides the jobs until this account signs in again.
    private func endSession(lockJobs: Bool) {
        if lockJobs, let uid = session?.userId {
            let owner = UserDefaults.standard.string(forKey: Self.dataOwnerKey) ?? uid
            UserDefaults.standard.set(owner, forKey: Self.jobsLockedKey)
        }
        pendingKick?.cancel()
        session = nil
        accountSwitch = nil
        missingTables = []
        missingColumns = [:]
        Keychain.delete(account: Self.sessionAccount)
        lastSync = nil
        lastSummary = nil
        lastError = nil
        uploadBacklogs = [:]
        team = nil
        teamNeedsMigration = false
        teamError = nil
        readOnly = false
        pendingChanges = 0
        readOnlyUntil = nil
        soloBilling = nil
        soloUserId = nil
        UserDefaults.standard.removeObject(forKey: Self.soloKey)
        // The company setup's sync records stay: they name their account (another one never reads them, and an
        // account switch removes them), and without them a change made here before the session ended would be
        // overwritten by the company's copy when the same person signs back in.
        clearPendingInvite()
        hideLockedJobs()
    }

    /// Jobs kept on this device by a signed-out account stay off the screens (in memory only: they remain on disk)
    /// until that account signs in again.
    private func hideLockedJobs() {
        guard let app, let locked = UserDefaults.standard.string(forKey: Self.jobsLockedKey), session?.userId != locked else { return }
        if !app.projects.isEmpty { app.projects = [] }
    }

    /// The account the hidden jobs belong to signed in: show them again.
    private func unlockJobs(for userId: String) {
        guard let app, let locked = UserDefaults.standard.string(forKey: Self.jobsLockedKey), locked == userId else { return }
        UserDefaults.standard.removeObject(forKey: Self.jobsLockedKey)
        app.projects = app.store.loadAllProjects().sorted { $0.project.updatedAt > $1.project.updatedAt }
    }

    /// Another account's jobs are hidden on this device (they are still on disk).
    private var lockedJobsOnDisk: [ProjectBundle] {
        guard let app, let locked = UserDefaults.standard.string(forKey: Self.jobsLockedKey), session?.userId != locked else { return [] }
        return app.store.loadAllProjects()
    }

    private func store(_ s: SupabaseClient.Session) {
        session = s
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        if let d = try? enc.encode(s), !Keychain.save(d, account: Self.sessionAccount) {
            // Still signed in until the app closes; say so rather than fail silently.
            lastError = String(localized: "Couldn't keep your sign-in on this device, so you'll need to sign in again after closing the app.")
        }
    }

    @ObservationIgnored private var refreshing: Task<SupabaseClient.Session, Error>?

    /// A valid access token. Renews the sign-in a few minutes before it runs out; stays signed in when offline
    /// (renewal is retried later) and only signs out if the server rejects the saved sign-in.
    private func token() async throws -> String {
        guard let client, let s = session else { throw SupabaseClient.Failure(message: String(localized: "Not signed in")) }
        if s.expiresAt > Date().addingTimeInterval(120) { return s.accessToken }
        // One renewal at a time: two at once would spend the same one-time renewal token and get rejected.
        if let t = refreshing { return try await t.value.accessToken }
        let t = Task { try await client.refresh(s) }
        refreshing = t
        defer { refreshing = nil }
        do {
            let fresh = try await t.value
            store(fresh)
            return fresh.accessToken
        } catch let e as SupabaseClient.Failure where e.status == 400 || e.status == 401 {
            endSession(lockJobs: true)
            throw SupabaseClient.Failure(message: String(localized: "Your sign-in ended — please sign in again."))
        } catch {
            // Offline or the server didn't answer: keep the sign-in and try again on the next sync.
            if s.expiresAt > Date() { return s.accessToken }
            throw SupabaseClient.Failure(message: String(localized: "Can't reach the cloud right now — will retry."))
        }
    }

    // MARK: ledger

    private var ledgerURL: URL? { app.map { $0.store.root.appendingPathComponent("sync-\(session?.userId ?? "none").json") } }
    /// The ledger of the signed-in account. A file that records another account is never used.
    private func loadLedger() {
        ledger = SyncLedger.load(ledgerURL.flatMap { try? Data(contentsOf: $0) }, for: session?.userId)
    }
    private func saveLedger() {
        ledger.userId = session?.userId
        guard let url = ledgerURL, let d = try? JSONEncoder().encode(ledger) else { return }
        try? d.write(to: url, options: .atomic)
    }

    // MARK: account switch

    /// Sync ledgers on this device other than the signed-in account's (devices from before the data owner was recorded).
    private func ledgerFiles(_ store: Store) -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: store.root.path)) ?? []
        return names.filter { $0.hasPrefix("sync-") && $0.hasSuffix(".json") && $0 != "sync-none.json" }
    }

    /// May this account sync the jobs on this device? Records the account as their owner when so; otherwise sets
    /// `accountSwitch` and stops (another account's jobs must never be pushed into this one).
    private func checkAccount(_ app: AppModel) -> Bool {
        guard let uid = session?.userId else { return false }
        let defaults = UserDefaults.standard
        let owner = defaults.string(forKey: Self.dataOwnerKey)
        let files = ledgerFiles(app.store)
        let own = "sync-\(uid).json"
        let others = files.contains { $0 != own }, ownFile = files.contains(own)
        // Jobs another account kept on this device when it signed out are hidden, but still there.
        let hidden = lockedJobsOnDisk.count
        let decision = AccountSwitch.decide(dataOwner: owner, signingIn: uid, hasLocalJobs: !app.projects.isEmpty || hidden > 0,
                                            otherAccountLedgers: others, ownLedger: ownFile)
        guard decision == .proceed else {
            accountSwitch = AccountSwitchPrompt(jobs: max(app.projects.count, hidden), previousEmail: owner == nil ? nil : defaults.string(forKey: Self.dataOwnerEmailKey))
            lastError = accountSwitch?.message
            return false
        }
        if owner != uid {
            // The jobs are gone (removed by hand) but the catalog and products are still the other account's: keep
            // them here without sending them into this account.
            if AccountSwitch.isOtherAccount(dataOwner: owner, signingIn: uid, otherAccountLedgers: others, ownLedger: ownFile) {
                AccountSwitch.keepWithoutSending(app.catalog, products: app.products, in: &ledger)
                saveLedger()
                // The other account's business details, prices and templates must not show here or go up into this
                // account's company: back to a fresh install's, then this account's come down.
                app.forgetCompanySetup()
                UserDefaults.standard.removeObject(forKey: Self.companyDetailsMarkKey)
                UserDefaults.standard.removeObject(forKey: Self.companyPrefsMarkKey)
            }
            defaults.set(uid, forKey: Self.dataOwnerKey)
            defaults.set(session?.email, forKey: Self.dataOwnerEmailKey)
        }
        accountSwitch = nil
        return true
    }

    /// Remove the other account's jobs from this device, then sync this account. The catalog and products stay but
    /// aren't sent (this account's own come down).
    func removeOtherAccountsJobs() async {
        guard let app, let uid = session?.userId, accountSwitch != nil else { return }
        var before = state(app)
        for b in lockedJobsOnDisk where before.bundles[b.project.id] == nil { before.bundles[b.project.id] = b }
        var after = before
        after.bundles = [:]
        app.applySync(from: before, to: after)
        UserDefaults.standard.removeObject(forKey: Self.jobsLockedKey)
        // The other account's business details, prices and templates go too; this account's come down.
        app.forgetCompanySetup()
        UserDefaults.standard.removeObject(forKey: Self.companyDetailsMarkKey)
        UserDefaults.standard.removeObject(forKey: Self.companyPrefsMarkKey)
        ledger = AccountSwitch.freshLedger(for: uid, keeping: app.catalog, products: app.products)
        imagePaths = [:]
        saveLedger()
        UserDefaults.standard.set(uid, forKey: Self.dataOwnerKey)
        UserDefaults.standard.set(session?.email, forKey: Self.dataOwnerEmailKey)
        accountSwitch = nil
        lastError = nil
        refreshUploadBacklogs()
        await syncNow(force: true)
    }

    // MARK: running

    private func startLoop() {
        loop?.cancel()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                if let self, self.signedIn { await self.syncNow() }
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    /// Sync a few seconds after an edit (edits in a burst become one sync).
    func kick() {
        guard signedIn else { return }
        refreshUploadBacklogs()   // a new photo / document shows as waiting right away
        pendingKick?.cancel()
        pendingKick = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            // The edit time is noted now, even when the sync can't run (offline, another sync under way).
            self?.noteEdits()
            await self?.syncNow()
        }
    }

    /// Note when unsynced rows were first seen changed: that time, not the push's, goes up as their `updated_at`.
    private func noteEdits() {
        guard let app, signedIn, accountSwitch == nil else { return }
        let before = ledger.dirtyAt
        ledger.noteDirty(state(app).changes(since: ledger), now: isoNow())
        if ledger.dirtyAt != before { saveLedger() }
    }

    /// `force` (the Sync now button) also retries pushing right away after a "subscription inactive" refusal.
    func syncNow(force: Bool = false) async {
        guard signedIn, !syncing, let app, let client else { return }
        // Another account's jobs on this device: nothing syncs until the person chooses.
        guard checkAccount(app) else { return }
        syncing = true
        defer { syncing = false; refreshUploadBacklogs() }
        noteEdits()
        do {
            let token = try await token()
            // Know the role (and the team's billing) before pushing, so this device never sends what the database
            // would refuse.
            await loadTeam(maxAge: 50)
            applyTeamTrades(app)
            // A technician's device keeps no prices (they never come down for a technician either).
            if teamKnown, role == .tech {
                var s = state(app)
                let before = s
                if s.dropPrices(ledger: &ledger) { app.applySync(from: before, to: s) }
            }
            // A lapsed subscription makes the team read-only: keep local edits queued (nothing is lost), don't keep
            // sending what the database refuses, and keep pulling. Billing is re-read on every sync, so pushing
            // resumes once the team is active again (or ~10 minutes after a refused push).
            if force { readOnlyUntil = nil }
            var blocked = !canWork
            if let until = readOnlyUntil, Date() < until { blocked = true }
            var pushed = 0
            var refused: Error?
            if !blocked {
                do {
                    let result = try await push(app: app, client: client, token: token)
                    pushed = result.0
                    refused = result.1
                } catch let e as SupabaseClient.Failure where BillingLogic.isSubscriptionInactive(e.message) {
                    blocked = true
                    readOnlyUntil = Date().addingTimeInterval(BillingLogic.readOnlyRetry)
                    // The cached billing is out of date: read it again on the next sync.
                    teamLoadedAt = nil
                }
            }
            if !blocked { readOnlyUntil = nil }
            readOnly = blocked
            let (pulled, pullError) = try await pull(app: app, client: client, token: token)
            // The company's business details, pricing, templates and other setup (newest change wins, part by part).
            // Before the files, so a new device gets the setup even when a file fails.
            await syncCompanySetup(app: app, client: client, token: token, mayPush: !blocked)
            try await images(app: app, client: client, token: token, uploads: !blocked)
            saveLedger()
            pendingChanges = blocked ? countPending(app) : 0
            lastSync = Date()
            func text(_ e: Error) -> String { (e as? LocalizedError)?.errorDescription ?? e.localizedDescription }
            lastError = refused.map { String(localized: "Some changes weren't accepted by the cloud (they'll be tried again): \(text($0))") }
                ?? pullError.map { String(localized: "Some changes couldn't be received (they'll be tried again): \(text($0))") }
                ?? (refusedRows == 0 ? nil : String(localized: "\(refusedRows) items from the cloud weren't taken: their ids aren't one Northpin makes."))
                ?? (missingTables.isEmpty ? nil : String(localized: "The cloud isn't up to date yet, so some job data doesn't sync (\(missingTables.joined(separator: ", "))). Everything else is synced."))
            if blocked {
                lastSummary = BillingLogic.readOnlyStatus(pending: pendingChanges, device: UIDevice.current.model)
            } else {
                lastSummary = pushed + pulled == 0 ? String(localized: "Up to date") : String(localized: "Sent \(pushed), received \(pulled) changes")
            }
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            saveLedger()
        }
    }

    // MARK: client proposals

    struct ProposalRow: Decodable, Identifiable {
        let id: String
        let project_id: String
        let snapshot: ProposalSnapshot
        let status: String
        let viewed_at: String?
        let responded_at: String?
        let client_name: String?
        let signature: String?
        let chosen_options: [String]?
        let accepted_total: Double?
        let client_note: String?
        let created_at: String
    }

    func proposals(projectId: String) async throws -> [ProposalRow] {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Cloud sync isn't connected.")) }
        let data = try await client.select("proposals", query: "select=id,project_id,snapshot,status,viewed_at,responded_at,client_name,signature,chosen_options,accepted_total,client_note,created_at&project_id=eq.\(projectId)&order=created_at.desc", token: try await token())
        // One row this version can't read (e.g. a newer web app's snapshot) mustn't hide the job's other links.
        return try JSONDecoder().decode([Lossy<ProposalRow>].self, from: data).compactMap(\.value)
    }

    private struct Lossy<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    /// Run a sync and wait for it, even if one is already under way (so a job just created is on the server).
    private func syncAndWait() async {
        while syncing { try? await Task.sleep(for: .milliseconds(250)) }
        await syncNow()
    }

    /// Upload the plan images, then save the proposal. The job's earlier open links are withdrawn.
    func publishProposal(token link: String, projectId: String, images: [String: Data], build: ([String: String]) -> ProposalSnapshot,
                         withdraw: [String], progress: (String) -> Void) async throws {
        guard let client, let uid = session?.userId else { throw SupabaseClient.Failure(message: String(localized: "Sign in to cloud sync first.")) }
        let tok = try await token()
        // The job must be on the server first (proposals belong to a synced job).
        await syncAndWait()
        var urls: [String: String] = [:]
        for (i, (sheetId, data)) in images.sorted(by: { $0.key < $1.key }).enumerated() {
            progress(String(localized: "Uploading plan \(i + 1) of \(images.count)…"))
            let path = "\(uid)/\(link)/\(sheetId).jpg"
            try await client.upload(bucket: "proposals", path: path, data: data, token: tok)
            urls[sheetId] = client.publicURL(bucket: "proposals", path: path)
        }
        progress(String(localized: "Publishing…"))
        let snap = build(urls)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(snap))
        _ = try await client.insert("proposals", row: ["id": link, "project_id": projectId, "snapshot": json, "valid_until": snap.validUntil.map { $0 as Any } ?? NSNull()], token: tok)
        // Earlier open links are withdrawn only now that the new one exists (a failed publish leaves the client's link working).
        for id in withdraw { try? await client.patch("proposals", filter: "id=eq.\(id)", values: ["status": "revoked", "updated_at": isoNow()], token: tok) }
    }

    /// Upload a file anyone with the link can open (under this account's folder) and return its address.
    func uploadPublic(path: String, data: Data, contentType: String) async throws -> String {
        guard let client, let uid = session?.userId else { throw SupabaseClient.Failure(message: String(localized: "Sign in to cloud sync first.")) }
        let full = "\(uid)/\(path)"
        try await client.upload(bucket: "proposals", path: full, data: data, token: try await token(), contentType: contentType)
        return client.publicURL(bucket: "proposals", path: full)
    }

    /// Save a photo report the client can open at /r?t=<token> (photos already uploaded with `uploadPublic`).
    func publishPhotoReport(token link: String, projectId: String, snapshot: [String: Any]) async throws {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Sign in to cloud sync first.")) }
        await syncAndWait()   // the report belongs to a synced job
        do {
            _ = try await client.insert("photo_reports", row: ["id": link, "project_id": projectId, "snapshot": snapshot], token: try await token())
        } catch {
            let m = error.localizedDescription
            if m.contains("does not exist") || m.contains("schema cache") {
                throw SupabaseClient.Failure(message: String(localized: "Photo reports aren't switched on for this Northpin server yet. Try again once it's updated."))
            }
            throw error
        }
    }

    func withdrawProposal(_ id: String) async throws {
        guard let client else { return }
        try await client.patch("proposals", filter: "id=eq.\(id)", values: ["status": "revoked", "updated_at": isoNow()], token: try await token())
    }

    private func state(_ app: AppModel) -> SyncState { SyncState(bundles: app.projects, catalog: app.catalog, products: app.products) }

    /// Rows and job deletions on this device that the cloud doesn't have yet.
    private func countPending(_ app: AppModel) -> Int {
        let s = state(app)
        return s.changes(since: ledger).count + s.removedProjects(since: ledger).count
    }

    /// Send this device's changes. A row the server refuses (not allowed, bad value, missing table) is reported, not
    /// fatal: the other rows and tables still go up and the pull still runs, so one bad row can't stall syncing.
    /// No connection or an ended sign-in still stops the run.
    private func push(app: AppModel, client: SupabaseClient, token: String) async throws -> (Int, Error?) {
        let s = state(app)
        let changed = s.changes(since: ledger)
        let now = isoNow()
        let role = self.role
        let known = teamKnown
        // Refusals are only taken as final for a role that is actually known (not the "team unknown" stand-in).
        let refusalRole: TeamRole? = known ? role : nil
        var refused: Error?
        var sent = 0
        for t in SyncMap.pushOrder {
            let rows = changed.filter { $0.table == t }
            guard !rows.isEmpty, let spec = SyncMap.specs[t] else { continue }
            guard TeamLogic.mayPush(t, role: role) else {
                // Technicians can't write prices (the database refuses): drop those edits instead of retrying forever.
                // While the team isn't known yet they wait instead: an office edit mustn't be lost to a failed lookup.
                if known { s.markSynced(rows, ledger: &ledger) }
                continue
            }
            func payload(_ chunk: [SyncState.Row]) -> [[String: Any]] {
                chunk.map { r -> [String: Any] in
                    var row = SyncMap.toRemote(t, r.json)
                    // The edit's own time (never the time of this push): the server keeps whichever edit is newer.
                    row["updated_at"] = ledger.editTime(r, fallback: now)
                    return row
                }
            }
            for chunk in stride(from: 0, to: rows.count, by: 200).map({ Array(rows[$0..<min($0 + 200, rows.count)]) }) {
                do {
                    try await client.upsert(spec.remote, conflict: spec.conflict, rows: payload(chunk), token: token)
                    s.markSynced(chunk, ledger: &ledger)
                    sent += chunk.count
                } catch let e as SupabaseClient.Failure where BillingLogic.isSubscriptionInactive(e.message) {
                    throw e   // the whole team is read-only: stop pushing, keep everything queued
                } catch let e as SupabaseClient.Failure where e.isRefusal {
                    if chunk.count == 1 {
                        noteRefusal(e, rows: chunk, role: refusalRole, refused: &refused)
                        continue
                    }
                    // Find the refused rows: send one at a time. Three refusals in a row means the whole table is
                    // refused (e.g. a missing column): stop there and try again on the next sync.
                    var strikes = 0
                    for r in chunk where strikes < 3 {
                        do {
                            try await client.upsert(spec.remote, conflict: spec.conflict, rows: payload([r]), token: token)
                            s.markSynced([r], ledger: &ledger)
                            sent += 1
                            strikes = 0
                        } catch let one as SupabaseClient.Failure where BillingLogic.isSubscriptionInactive(one.message) {
                            throw one
                        } catch let one as SupabaseClient.Failure where one.isRefusal {
                            noteRefusal(one, rows: [r], role: refusalRole, refused: &refused)
                            strikes += 1
                        }
                    }
                }
            }
        }
        // Jobs deleted on this device.
        let removed = s.removedProjects(since: ledger)
        for id in removed {
            do {
                try await client.patch("projects", filter: "id=eq.\(id)", values: ["deleted": true, "updated_at": now], token: token)
                ledger.hashes.removeValue(forKey: SyncLedger.key(.projects, id))
                sent += 1
            } catch let e as SupabaseClient.Failure where BillingLogic.isSubscriptionInactive(e.message) {
                throw e
            } catch let e as SupabaseClient.Failure where e.isRefusal {
                if e.status == 403 || e.code == "42501" {
                    // Not allowed to delete it (a technician): it stays on the server, so bring it back here.
                    // Forgetting the pull watermarks makes the next pull fetch the job (and its sheets, devices…) again.
                    ledger.hashes.removeValue(forKey: SyncLedger.key(.projects, id))
                    ledger.watermarks = [:]
                    teamNotice = String(localized: "Only the office can delete a job, so it's back on this device.")
                } else if refused == nil {
                    refused = e
                }
            }
        }
        return (sent, refused)
    }

    /// Remember a refused row. A technician's row the database won't take (403 / 42501) is dropped for good —
    /// it would be refused every time — while other refusals are tried again on the next sync.
    private func noteRefusal(_ e: SupabaseClient.Failure, rows: [SyncState.Row], role: TeamRole?, refused: inout Error?) {
        if role == .tech && (e.status == 403 || e.code == "42501") {
            for r in rows { ledger.hashes[SyncLedger.key(r.table, r.id)] = r.hash }
            // A form the office has locked (submitted): pull the forms again so the server's copy replaces this one.
            if rows.contains(where: { $0.table == .forms }) { ledger.watermarks.removeValue(forKey: SyncTable.forms.rawValue) }
            return
        }
        if refused == nil { refused = e }
    }

    /// What a table holds, in words for the sync status.
    private static func plainName(_ t: SyncTable, remote: String) -> String {
        switch t {
        case .salesDocs: return String(localized: "quotes & invoices")
        case .salesPayments: return String(localized: "payments")
        case .rfis: return String(localized: "RFIs")
        case .scheduleItems: return String(localized: "schedule")
        case .measurements: return String(localized: "saved measurements")
        case .sheetLinks: return String(localized: "plan links")
        case .planMarkups: return String(localized: "markups")
        default: return remote.replacingOccurrences(of: "_", with: " ")
        }
    }

    /// Fetch every table's changes (paged like the web app, with a 30 s lookback), then merge. One table the server
    /// refuses doesn't stop the others: what was fetched is merged and its watermark kept, and the error is returned.
    /// A table the database doesn't have yet is skipped. Rows that couldn't be applied are fetched again by id next
    /// time, so a watermark never moves past a row for good. No connection (or an ended sign-in) still stops the run.
    private func pull(app: AppModel, client: SupabaseClient, token: String) async throws -> (Int, Error?) {
        // Fetch first (async), then merge into whatever is current on the main actor, so edits made meanwhile are kept.
        var fetched: [(SyncTable, [String: Any])] = []
        refusedRows = 0
        var marks: [String: String] = [:]
        var askedAgain: [SyncTable: Set<String>] = [:]
        var failure: Error?
        var parentsFailed = false
        var missing: [String] = []
        let role = self.role
        tables: for t in SyncMap.pushOrder {
            // Prices (and estimates, quotes, invoices) only for the office. While the team isn't known, `role` is a
            // technician's, so nothing priced is asked for.
            guard let spec = SyncMap.specs[t], TeamLogic.mayPull(t, role: role) else { continue }
            var attempts = 0
            do {
                while true {
                    do {
                        let cols = missingColumns[t] ?? []
                        var cur = SyncPaging.Cursor(since: SyncPaging.pullStart(ledger.watermarks[t.rawValue]))
                        while true {
                            let rows = try await client.page(t, cursor: cur, missing: cols, token: token)
                            fetched += rows.map { (t, $0) }
                            let next = SyncPaging.next(cur, rows: rows)
                            cur = next.cursor
                            if !rows.isEmpty { marks[t.rawValue] = cur.since }
                            if next.done { break }
                        }
                        let waiting = ledger.retry[t.rawValue] ?? []
                        for i in stride(from: 0, to: waiting.count, by: 100) {
                            let ids = Array(waiting[i..<min(i + 100, waiting.count)])
                            fetched += try await client.rows(t, ids: ids, missing: cols, token: token).map { (t, $0) }
                            askedAgain[t, default: []].formUnion(ids)
                        }
                        break
                    } catch let e as SupabaseClient.Failure where attempts < 5 && Self.missingColumn(e).map({ !(missingColumns[t] ?? []).contains($0) }) == true {
                        // A column this build names that the cloud database doesn't have yet: leave it out and ask again.
                        missingColumns[t, default: []].insert(Self.missingColumn(e)!)
                        attempts += 1
                        continue
                    }
                }
            } catch let e as SupabaseClient.Failure where e.isMissingTable {
                missing.append(Self.plainName(t, remote: spec.remote))
            } catch let e as SupabaseClient.Failure where e.status != 0 && e.status != 401 {
                if failure == nil { failure = SupabaseClient.Failure(message: "\(spec.remote): \(e.message)", status: e.status, code: e.code) }
                if t == .projects { parentsFailed = true }
            } catch {
                // Offline or signed out: merge what arrived, then stop.
                failure = error
                parentsFailed = true
                break tables
            }
        }
        missingTables = missing
        var applied = 0
        if !fetched.isEmpty {
            var s = state(app)
            let before = s
            var again: [SyncTable: [String]] = [:]
            var settled: [SyncTable: Set<String>] = [:]
            var refusedIds = 0
            for (t, row) in fetched {
                let r = s.merge(t, remote: row, ledger: &ledger)
                if r == .applied || r == .removedProject { applied += 1 }
                // Ids that would become unsafe file names or paths here: never merged, never asked for again.
                if r == .refused { refusedIds += 1; continue }
                if let id = row[SyncMap.specs[t]!.idColumn] as? String {
                    if SyncState.needsRetry(r, parentsFailed: parentsFailed) { again[t, default: []].append(id) } else { settled[t, default: []].insert(id) }
                }
                // Only a path that names this image (a new revision's row can arrive before its image_path moves on),
                // made of safe parts.
                if t == .sheets, let path = row["image_path"] as? String, let id = row["image_id"] as? String, SyncMap.isSafeId(id),
                   path.hasSuffix("/\(id)"), path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ SyncMap.isSafeId(String($0)) }) {
                    imagePaths[id] = path
                }
            }
            refusedRows = refusedIds
            app.applySync(from: before, to: s)
            for t in SyncMap.pushOrder {
                let retry = again[t] ?? []
                // Asked for again but not sent back: gone from the server (or not ours to see) — stop asking.
                let done = (settled[t] ?? []).union((askedAgain[t] ?? []).subtracting(retry))
                ledger.clearRetry(t, done.subtracting(retry))
                ledger.addRetry(t, retry)
            }
        }
        for (k, v) in marks { ledger.watermarks[k] = SyncPaging.advance(ledger.watermarks[k], to: v) }
        if let e = failure as? SupabaseClient.Failure, e.status == 0 || e.status == 401 { throw e }
        if let e = failure, !(e is SupabaseClient.Failure) { throw e }
        return (applied, failure)
    }

    @ObservationIgnored private var imagePaths: [String: String] = [:]

    /// Upload plan images this device has that the cloud doesn't; download ones it is missing.
    /// `uploads: false` (read-only team) only downloads: the database would refuse the sheet rows' image paths.
    private func images(app: AppModel, client: SupabaseClient, token: String, uploads: Bool = true) async throws {
        // One file the server refuses (too big, bad type…) mustn't hold up every other upload and all downloads:
        // remember the first refusal and report it at the end. No connection at all still stops the run straight away.
        var refused: Error?
        func attempt(_ id: String, _ work: () async throws -> Void) async throws {
            do {
                try await work()
                ledger.uploadedImages.insert(id)
            } catch let e as SupabaseClient.Failure where e.status != 0 && e.status != 401 {
                if refused == nil { refused = e }
            }
        }
        for b in app.projects where uploads {
            let pid = b.project.id
            for s in b.liveSheets where !ledger.uploadedImages.contains(s.imageId) {
                guard let data = app.store.imageData(s.imageId) else { continue }
                let path = "\(pid)/\(s.imageId)"
                try await attempt(s.imageId) {
                    try await client.upload(path: path, data: data, token: token)
                    try await client.patch("sheets", filter: "image_id=eq.\(s.imageId)", values: ["image_path": path], token: token)
                }
            }
            for m in b.liveMarkers {
                guard let id = m.photoId, !ledger.uploadedImages.contains(id), let data = app.store.imageData(id) else { continue }
                try await attempt(id) { try await client.upload(path: "\(pid)/\(id)", data: data, token: token) }
            }
            // Job photos and documents: stored at <project>/<file id>, like the web app.
            for p in b.livePhotos where !ledger.uploadedImages.contains(p.imageId) {
                guard let data = app.store.imageData(p.imageId) else { continue }
                try await attempt(p.imageId) { try await client.upload(path: "\(pid)/\(p.imageId)", data: data, token: token) }
            }
            // Daily report signatures: <project>/<image id> too.
            for id in b.signatureImageIds where !ledger.uploadedImages.contains(id) {
                guard let data = app.store.imageData(id) else { continue }
                try await attempt(id) { try await client.upload(path: "\(pid)/\(id)", data: data, token: token) }
            }
            for d in b.liveDocuments where !ledger.uploadedImages.contains(d.fileId) {
                guard let data = app.store.fileData(d.fileId) else { continue }
                try await attempt(d.fileId) { try await client.upload(bucket: "plans", path: "\(pid)/\(d.fileId)", data: data, token: token, contentType: StorageTypes.plansUploadType(d.mime)) }
            }
            // Form signatures: stored at <project>/<image id>, like the web app.
            for f in b.liveForms {
                for s in f.signatures ?? [] where !s.imageId.isEmpty && !ledger.uploadedImages.contains(s.imageId) {
                    guard let data = app.store.imageData(s.imageId) else { continue }
                    try await attempt(s.imageId) { try await client.upload(path: "\(pid)/\(s.imageId)", data: data, token: token) }
                }
            }
            refreshUploadBacklog(b, store: app.store)   // the "waiting to upload" count goes down job by job
        }
        // Downloads: check for the file without reading it (this runs every minute), and cap each run so a big
        // first sync doesn't hold the loop for ages — the rest come on the next runs. Only files that actually arrive
        // use up the budget: files missing on the server (still uploading elsewhere) mustn't starve the rest forever.
        var budget = 300
        for b in app.projects {
            let pid = b.project.id
            for s in b.liveSheets where budget > 0 && !app.store.hasImage(s.imageId) {
                let path = imagePaths[s.imageId] ?? "\(pid)/\(s.imageId)"
                guard let data = try? await client.download(path: path, token: token) else { continue }   // may still be uploading elsewhere
                budget -= 1
                _ = app.store.saveImageData(data, id: s.imageId)
                ledger.uploadedImages.insert(s.imageId)
            }
            // Device photos (a marker's photo) are stored at <project>/<photo id> too.
            for id in b.liveMarkers.compactMap(\.photoId) where budget > 0 && !app.store.hasImage(id) {
                guard let data = try? await client.download(path: "\(pid)/\(id)", token: token) else { continue }
                budget -= 1
                _ = app.store.saveImageData(data, id: id)
                ledger.uploadedImages.insert(id)
            }
            for p in b.livePhotos where budget > 0 && !app.store.hasImage(p.imageId) {
                guard let data = try? await client.download(path: "\(pid)/\(p.imageId)", token: token) else { continue }
                budget -= 1
                _ = app.store.saveImageData(data, id: p.imageId)
                ledger.uploadedImages.insert(p.imageId)
            }
            for id in b.signatureImageIds where budget > 0 && !app.store.hasImage(id) {
                guard let data = try? await client.download(path: "\(pid)/\(id)", token: token) else { continue }
                budget -= 1
                _ = app.store.saveImageData(data, id: id)
                ledger.uploadedImages.insert(id)
            }
            for f in b.liveForms {
                for s in f.signatures ?? [] where budget > 0 && !s.imageId.isEmpty && !app.store.hasImage(s.imageId) {
                    guard let data = try? await client.download(path: "\(pid)/\(s.imageId)", token: token) else { continue }
                    budget -= 1
                    _ = app.store.saveImageData(data, id: s.imageId)
                    ledger.uploadedImages.insert(s.imageId)
                }
            }
            for d in b.liveDocuments where budget > 0 && !app.store.hasFile(d.fileId) {
                guard let data = try? await client.download(path: "\(pid)/\(d.fileId)", token: token) else { continue }
                budget -= 1
                app.store.saveFile(data, id: d.fileId)
                ledger.uploadedImages.insert(d.fileId)
            }
        }
        if let refused { throw refused }
    }
}

// MARK: - company team

/// The signed-in user's company team and the calls that manage it (mirrors src/lib/team.ts). The team and role are
/// cached on this device so the app hides the right things offline too.
extension CloudSync {
    static let teamKey = "pinplan.team"
    static let soloKey = "pinplan.soloBilling"
    private static let pendingInviteKey = "pinplan.pendingInvite"

    /// My role on my company team as loaded, or nil when working alone, signed out or not known yet.
    var teamRole: TeamRole? {
        guard signedIn, let t = team, t.userId == session?.userId, t.team != nil else { return nil }
        return t.role
    }
    /// Signed in and the team was loaded for this account (from the cloud, or cached on this device for it).
    var teamKnown: Bool { signedIn && team?.userId == session?.userId }
    /// The device's situation for deciding the role when the team isn't known.
    var roleContext: TeamLogic.RoleContext {
        let cached = lastTeam
        return TeamLogic.RoleContext(signedIn: signedIn, teamKnown: teamKnown, dataOwner: UserDefaults.standard.string(forKey: Self.dataOwnerKey),
                                     cachedUserId: cached?.userId, cachedRole: cached?.role, cachedOnTeam: cached?.team != nil)
    }
    /// The role the app acts on, failing closed (TeamLogic.effectiveRole): my team role when known; a technician's while
    /// signed in with the team not known yet; signed out, the last known role of the account whose jobs these are
    /// (a technician's when that isn't known); nil (full access) only when working alone or for jobs that never had an
    /// account.
    var role: TeamRole? { TeamLogic.effectiveRole(teamRole, roleContext) }
    /// What this user may do (fails closed, see `role`). Solo users (no team) can do everything.
    func can(_ action: TeamAction) -> Bool { TeamLogic.can(role, action) }

    /// The team cached on this device, whoever it belongs to (kept across sign-out).
    static func cachedTeam() -> TeamSnapshot? {
        guard let d = UserDefaults.standard.data(forKey: teamKey) else { return nil }
        return try? JSONDecoder().decode(TeamSnapshot.self, from: d)
    }

    /// The column a 42703 / PGRST204 error says the cloud database doesn't have ("column projects.labels does not exist").
    static func missingColumn(_ e: SupabaseClient.Failure) -> String? {
        guard e.code == "42703" || e.code == "PGRST204" || e.message.contains("does not exist") || e.message.contains("Could not find the") else { return nil }
        for pattern in [#"column "?(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)"? does not exist"#, #"Could not find the '([A-Za-z0-9_]+)' column"#] {
            if let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
               let m = re.firstMatch(in: e.message, range: NSRange(e.message.startIndex..., in: e.message)), m.numberOfRanges > 1,
               let r = Range(m.range(at: 1), in: e.message) {
                return String(e.message[r])
            }
        }
        return nil
    }
    var onTeam: Bool { teamRole != nil }
    /// My row on the team.
    var teamMe: TeamMember? { teamRole == nil ? nil : team?.me }
    /// Everyone on the team, owner first.
    var teamMembers: [TeamMember] { teamRole == nil ? [] : TeamLogic.sortMembers(team?.members ?? []) }

    func loadTeamCache() {
        loadSoloCache()
        guard let uid = session?.userId, let d = UserDefaults.standard.data(forKey: Self.teamKey),
              let snap = try? JSONDecoder().decode(TeamSnapshot.self, from: d), snap.userId == uid else { return }
        if team == nil { team = snap }
    }

    private func saveTeam(_ snap: TeamSnapshot) {
        team = snap
        teamLoadedAt = Date()
        lastTeam = snap
        if let d = try? JSONEncoder().encode(snap) { UserDefaults.standard.set(d, forKey: Self.teamKey) }
        // Joining or changing teams (create, invite, another device): pull everything again once.
        if snap.userId == session?.userId, ledger.noteTeam(snap.team?.id) { saveLedger() }
    }

    private static let teamTradesSeenKey = "pinplan.team.tradesSeen"

    /// Follow the team's trades (set by the office on the web or another device). A change made on this device stands
    /// until the team's trades change again. Catalog packs are added only for people who may change the catalog.
    func applyTeamTrades(_ app: AppModel) {
        guard teamRole != nil, let t = team?.team else { return }
        let key = "\(Self.teamTradesSeenKey).\(t.id)"
        let seen = UserDefaults.standard.stringArray(forKey: key)
        if let next = Team.tradesToAdopt(team: t.trades, seen: seen, local: app.trades) {
            // The team's trades coming down are not a change made here: keep the settings' save time (unless a
            // settings screen had changes of its own, which setTrades has just saved: those keep their new time).
            let savedAt: String? = app.settings.updatedAt
            let unsaved: Bool = app.hasUnsavedCompanySettings
            app.setTrades(next, addPacks: can(.editCatalog))
            if !unsaved {
                var s: AppSettings = app.settings
                s.updatedAt = savedAt
                app.replaceSettingsFromCloud(s)
            }
        }
        if let tr = t.trades, !tr.isEmpty { UserDefaults.standard.set(tr, forKey: key) }
    }

    /// Learn (or refresh) my team: my member row → the team → everyone on it. Offline, or a database without the
    /// team tables, keeps what this device knew. `maxAge` skips the call when the team was loaded that recently.
    func loadTeam(maxAge: TimeInterval = 0) async {
        guard let client, let uid = session?.userId else { return }
        if maxAge > 0, let at = teamLoadedAt, Date().timeIntervalSince(at) < maxAge { return }
        do {
            let tok = try await token()
            let meData = try await client.select("team_members", query: "select=team_id,role&user_id=eq.\(uid)", token: tok)
            let mine = (try JSONSerialization.jsonObject(with: meData) as? [[String: Any]]) ?? []
            teamNeedsMigration = false
            teamError = nil
            guard let row = mine.first, let tid = row["team_id"] as? String else {
                // On no team: the personal trial decides whether jobs can be changed.
                saveSolo(await loadSolo(client: client, token: tok), userId: uid)
                saveTeam(TeamSnapshot(userId: uid))
                return
            }
            saveSolo(nil, userId: uid)
            // Trades are newer than teams: a database without the column still loads the team.
            let tData: Data
            do {
                tData = try await client.select("teams", query: "select=id,name,owner_id,trades&id=eq.\(tid)", token: tok)
            } catch let e as SupabaseClient.Failure where e.code == "42703" || e.message.contains("trades") {
                tData = try await client.select("teams", query: "select=id,name,owner_id&id=eq.\(tid)", token: tok)
            }
            let mData = try await client.select("team_members", query: "select=user_id,role,name,email,created_at&team_id=eq.\(tid)", token: tok)
            let teams = try JSONDecoder().decode([Team].self, from: tData)
            let members = try JSONDecoder().decode([TeamMember].self, from: mData)
            let billing = await loadBilling(client: client, token: tok)
            saveTeam(TeamSnapshot(userId: uid, team: teams.first, role: TeamRole(remote: row["role"] as? String), members: members, billing: billing))
        } catch let e as SupabaseClient.Failure {
            if TeamLogic.isMissingSchema(code: e.code, message: e.message) {
                teamNeedsMigration = true
                teamError = nil
                // No team tables: nobody is on a team, so this account works alone.
                if team?.userId != uid { saveTeam(TeamSnapshot(userId: uid)) }
                teamLoadedAt = Date()
            } else if e.status != 0 {
                teamError = TeamLogic.errorMessage(e.message, code: e.code)
            }
        } catch {
            // Offline or an answer we couldn't read: keep the cached team.
        }
    }

    /// The team's subscription (`team_billing()`). A database without the billing update has no billing (never
    /// locked); any other failure keeps what this device knew.
    private func loadBilling(client: SupabaseClient, token: String) async -> TeamBilling? {
        do {
            let data = try await client.rpc("team_billing", params: [:], token: token)
            return BillingLogic.parse(data)
        } catch let e as SupabaseClient.Failure where TeamLogic.isMissingSchema(code: e.code, message: e.message) {
            return nil
        } catch {
            return team?.billing
        }
    }

    /// The personal trial of a person on no team (`solo_billing()`). A database without it never locks (nil); any
    /// other failure keeps what this device knew.
    private func loadSolo(client: SupabaseClient, token: String) async -> SoloBilling? {
        do {
            let data = try await client.rpc("solo_billing", params: [:], token: token)
            return BillingLogic.parseSolo(data)
        } catch let e as SupabaseClient.Failure where TeamLogic.isMissingSchema(code: e.code, message: e.message) || e.code == "PGRST202" {
            return nil
        } catch {
            return soloUserId == session?.userId ? soloBilling : nil
        }
    }

    private struct SoloCache: Codable { var userId: String; var solo: SoloBilling? }

    /// Remember the personal trial (on this device too, so it holds offline).
    private func saveSolo(_ solo: SoloBilling?, userId: String) {
        soloBilling = solo
        soloUserId = userId
        if let d = try? JSONEncoder().encode(SoloCache(userId: userId, solo: solo)) { UserDefaults.standard.set(d, forKey: Self.soloKey) }
    }

    /// The cached personal trial for the signed-in person (also on launch, before the first load).
    func loadSoloCache() {
        guard let uid = session?.userId, soloUserId != uid, let d = UserDefaults.standard.data(forKey: Self.soloKey),
              let c = try? JSONDecoder().decode(SoloCache.self, from: d), c.userId == uid else { return }
        soloBilling = c.solo
        soloUserId = uid
    }

    /// The personal trial when signed in and on no team. Nil otherwise (or not loaded yet: never locks).
    var solo: SoloBilling? {
        guard signedIn, teamRole == nil, let uid = session?.userId, soloUserId == uid else { return nil }
        if ProcessInfo.processInfo.arguments.contains("--billing-banner") { return nil }
        return soloBilling
    }

    /// The team's subscription as last loaded. Nil when working alone (never locked).
    /// Screenshot hook: `--billing-banner` shows a read-only team, `--billing-banner trial` a trial about to end.
    var billing: TeamBilling? {
        guard teamRole != nil else { return nil }
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--billing-banner") {
            if args.indices.contains(i + 1), args[i + 1] == "trial" {
                var b = team?.billing ?? TeamBilling(status: .trialing)
                b.status = .trialing
                b.hasSubscription = false
                b.trialEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(2 * 86_400))
                b.canWork = true
                b.cancelAt = nil
                b.enforce = true
                return b
            }
            return BillingLogic.readOnlyPreview(team?.billing)
        }
        return team?.billing
    }
    /// The team may change jobs; on no team, the personal trial decides (mirrors the database's team_can_write()).
    var canWork: Bool { BillingLogic.allowsWork(onTeam: teamRole != nil, billing: billing, solo: solo) }
    /// Jobs may be changed on this device (a lapsed team, or an ended personal trial, is read-only: view and export
    /// only, like the web app).
    var canEdit: Bool { BillingLogic.canEdit(onTeam: teamRole != nil, billing: billing, solo: solo) }
    /// Why changes are blocked, for an alert (nil when they're allowed).
    var editBlockedMessage: String? { BillingLogic.editBlockedMessage(onTeam: teamRole != nil, billing: billing, solo: solo, role: role) }
    /// The notice for the Projects screen and the job view, if any.
    var billingBanner: BillingBanner? { teamRole != nil ? BillingLogic.banner(billing, role: role) : BillingLogic.soloBanner(solo) }
    /// Plan status line for Settings › Team.
    var billingStatus: BillingStatusLine? { billing.map { BillingLogic.statusLine($0) } }

    /// Run a team call with a friendly message on failure (missing migration, signed out…).
    private func teamCall<T>(_ work: (SupabaseClient, String) async throws -> T) async throws -> T {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Connect cloud sync first.")) }
        do {
            let tok = try await token()
            return try await work(client, tok)
        } catch let e as SupabaseClient.Failure {
            if TeamLogic.isMissingSchema(code: e.code, message: e.message) { teamNeedsMigration = true }
            throw SupabaseClient.Failure(message: TeamLogic.errorMessage(e.message, code: e.code), status: e.status, code: e.code)
        }
    }

    func createTeam(name: String, myName: String) async throws {
        let n = name.trimmingCharacters(in: .whitespaces), me = myName.trimmingCharacters(in: .whitespaces)
        let _: Data = try await teamCall { c, t in
            try await c.rpc("create_team", params: ["p_name": n, "p_my_name": me], token: t)
        }
        await loadTeam()
    }

    func renameTeam(_ name: String) async throws {
        guard let id = team?.team?.id else { return }
        let n = name.trimmingCharacters(in: .whitespaces)
        let _: Void = try await teamCall { c, t in
            try await c.patch("teams", filter: "id=eq.\(id)", values: ["name": n, "updated_at": isoNow()], token: t)
        }
        await loadTeam()
    }

    func setMyName(_ name: String) async throws {
        guard let uid = session?.userId else { return }
        let n = name.trimmingCharacters(in: .whitespaces)
        let _: Void = try await teamCall { c, t in
            try await c.patch("team_members", filter: "user_id=eq.\(uid)", values: ["name": n], token: t)
        }
        await loadTeam()
    }

    func listInvites() async throws -> [TeamInvite] {
        guard let id = team?.team?.id else { return [] }
        let data: Data = try await teamCall { c, t in
            try await c.select("team_invites", query: "select=code,role,name,created_at,expires_at,used_by,used_at,revoked&team_id=eq.\(id)&order=created_at.desc", token: t)
        }
        return try JSONDecoder().decode([TeamInvite].self, from: data)
    }

    /// Make an invite code for someone (returns the code, upper case without dashes).
    func createInvite(role: TeamRole, name: String) async throws -> String {
        guard let id = team?.team?.id else { throw SupabaseClient.Failure(message: String(localized: "Start your team first.")) }
        let n = name.trimmingCharacters(in: .whitespaces)
        let r = role == .admin ? "admin" : "tech"
        // A clash is astronomically unlikely, but retry rather than fail.
        for _ in 0..<3 {
            let code = TeamLogic.newInviteCode()
            do {
                let _: Data = try await teamCall { c, t in
                    try await c.insert("team_invites", row: ["code": code, "team_id": id, "role": r, "name": n], token: t)
                }
                return code
            } catch let e as SupabaseClient.Failure where e.code == "23505" {
                continue
            }
        }
        throw SupabaseClient.Failure(message: String(localized: "Couldn't make an invite code. Try again."))
    }

    func revokeInvite(_ code: String) async throws {
        let c0 = TeamLogic.normalizeCode(code)
        let _: Void = try await teamCall { c, t in
            try await c.patch("team_invites", filter: "code=eq.\(c0)", values: ["revoked": true], token: t)
        }
    }

    func setMemberRole(_ userId: String, role: TeamRole) async throws {
        let r = role == .admin ? "admin" : "tech"
        let _: Data = try await teamCall { c, t in
            try await c.rpc("set_team_member_role", params: ["p_user": userId, "p_role": r], token: t)
        }
        await loadTeam()
    }

    func removeMember(_ userId: String) async throws {
        let _: Data = try await teamCall { c, t in
            try await c.rpc("remove_team_member", params: ["p_user": userId], token: t)
        }
        await loadTeam()
    }

    func leaveTeam() async throws {
        guard let uid = session?.userId else { return }
        try await removeMember(uid)
    }

    /// What a code is for (works before signing in). Nil when the code isn't valid (wrong, used, expired or revoked).
    func inviteInfo(_ code: String) async throws -> InviteInfo? {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Connect cloud sync first.")) }
        var tok: String?
        if signedIn { tok = try? await token() }
        do {
            let data = try await client.rpc("team_invite_info", params: ["p_code": TeamLogic.normalizeCode(code)], token: tok)
            return try? JSONDecoder().decode(InviteInfo.self, from: data)   // JSON null → nil
        } catch let e as SupabaseClient.Failure {
            if TeamLogic.isMissingSchema(code: e.code, message: e.message) { teamNeedsMigration = true }
            throw SupabaseClient.Failure(message: TeamLogic.errorMessage(e.message, code: e.code), status: e.status, code: e.code)
        }
    }

    /// Join a team with an invite code. Returns the team's name and my role there.
    @discardableResult
    func acceptInvite(_ code: String, name: String) async throws -> (team: String, role: TeamRole) {
        let c0 = TeamLogic.normalizeCode(code), n = name.trimmingCharacters(in: .whitespaces)
        let data: Data = try await teamCall { c, t in
            try await c.rpc("accept_team_invite", params: ["p_code": c0, "p_name": n], token: t)
        }
        await loadTeam()
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let joined: String = (j?["team"] as? String) ?? team?.team?.name ?? ""
        let joinedRole = TeamRole(remote: (j?["role"] as? String) ?? team?.role?.rawValue)
        return (joined, joinedRole)
    }

    // An invite opened before the worker had an account (e.g. waiting for the confirmation email) is finished
    // automatically the next time they sign in on this device.

    struct PendingInvite: Codable, Equatable {
        var code: String
        var name: String
        /// The email the person signed in or created their account with right after entering the code (lower case).
        /// The invite is used automatically only by that account.
        var email: String?
    }

    var pendingInvite: PendingInvite? {
        guard let d = UserDefaults.standard.data(forKey: Self.pendingInviteKey) else { return nil }
        return try? JSONDecoder().decode(PendingInvite.self, from: d)
    }

    func rememberPendingInvite(code: String, name: String) {
        let p = PendingInvite(code: TeamLogic.normalizeCode(code), name: name.trimmingCharacters(in: .whitespaces))
        if let d = try? JSONEncoder().encode(p) { UserDefaults.standard.set(d, forKey: Self.pendingInviteKey) }
    }

    /// The person is signing in (or creating an account) with this email to use the remembered invite.
    /// The latest attempt counts (a mistyped email corrected on the same screen still joins).
    func notePendingInviteEmail(_ email: String) {
        guard var p = pendingInvite else { return }
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !e.isEmpty else { return }
        p.email = e
        if let d = try? JSONEncoder().encode(p) { UserDefaults.standard.set(d, forKey: Self.pendingInviteKey) }
    }

    func clearPendingInvite() { UserDefaults.standard.removeObject(forKey: Self.pendingInviteKey) }

    /// Call after sign-in: joins the team from a remembered invite, if any.
    func finishPendingInvite() async {
        guard let p = pendingInvite, signedIn else { return }
        switch TeamLogic.pendingInviteAction(code: p.code, invitedEmail: p.email, signedInEmail: session?.email) {
        case .none: return
        case .confirm:
            // Saved for another account (or nobody said which): never joins a team on its own.
            clearPendingInvite()
            teamNotice = String(localized: "An invite code saved on this device was for another sign-in, so it wasn't used. To join, enter the code under Settings › Team.")
            return
        case .accept: break
        }
        do {
            let r = try await acceptInvite(p.code, name: p.name)
            clearPendingInvite()
            teamNotice = r.team.isEmpty ? String(localized: "You joined the team as \(tr(r.role.name)).") : String(localized: "You joined \(r.team) as \(tr(r.role.name)).")
        } catch let e as SupabaseClient.Failure where e.status != 0 {
            // A dead code won't start working later; a network error might.
            clearPendingInvite()
            teamNotice = String(localized: "Couldn't join with the saved invite code: \(e.message)")
        } catch {
            // Offline: try again after the next sign-in.
        }
    }
}

// MARK: - account

/// Password reset, account deletion and the signed-in calls to the Northpin web server.
extension CloudSync {
    /// A valid access token for calls to the Northpin web server (account deletion, invite emails).
    func accessToken() async throws -> String { try await token() }

    /// Email a password-reset link. `serverURL` is the Northpin web server; its /reset page sets the new password.
    func sendPasswordReset(email: String, serverURL: String) async throws {
        guard let client else { throw SupabaseClient.Failure(message: String(localized: "Connect a cloud project first.")) }
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard e.contains("@") else { throw SupabaseClient.Failure(message: String(localized: "Enter your email address first.")) }
        try await client.recover(email: e, redirectTo: BillingLogic.webURL(origin: serverURL, path: "reset"))
    }

    /// Delete the account on the server (`DELETE /api/account`). The caller wipes this device after `.deleted`.
    /// The server only deletes on a fresh sign-in (a password or emailed code in the last 5 minutes, read from the
    /// token); otherwise it answers 401 `reauth_required` (`.needsEmail`), and the screen asks for the password or a
    /// code (`reauthenticate`, `verifyReauthCode`) and tries again with the fresh token. A stolen session alone can't
    /// delete the account.
    func deleteAccount(api: APIClient) async throws -> AccountDeletionResult {
        guard signedIn else { throw SupabaseClient.Failure(message: String(localized: "Sign in first.")) }
        guard api.mayCarrySession else {
            throw SupabaseClient.Failure(message: String(localized: "Your sign-in isn't used with this Northpin server. Delete your account on the web instead, or contact support."))
        }
        let tok = try await token()
        var req = URLRequest(url: api.baseURL.appendingPathComponent("api/account"))
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 60
        let (data, resp) = try await URLSession.shared.data(for: req)
        return AccountDeletionResult.from(status: (resp as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }

    /// Prove it's really the account's owner: sign in again with the password. The fresh session replaces the old one
    /// (same account only).
    func reauthenticate(password: String) async throws {
        guard let client, let s = session else { throw SupabaseClient.Failure(message: String(localized: "Sign in first.")) }
        guard !password.isEmpty else { throw SupabaseClient.Failure(message: String(localized: "Enter your password.")) }
        try adoptFresh(try await client.signIn(email: s.email, password: password))
    }

    /// For sign-ins without a password: email a one-time code to the account's own address.
    func sendReauthCode() async throws {
        guard let client, let s = session, !s.email.isEmpty else { throw SupabaseClient.Failure(message: String(localized: "Sign in first.")) }
        try await client.sendCode(email: s.email)
    }

    /// Sign in again with the emailed code (same account only).
    func verifyReauthCode(_ code: String) async throws {
        guard let client, let s = session else { throw SupabaseClient.Failure(message: String(localized: "Sign in first.")) }
        let c = code.filter(\.isNumber)
        guard !c.isEmpty else { throw SupabaseClient.Failure(message: String(localized: "Enter the code from the email.")) }
        try adoptFresh(try await client.verifyCode(email: s.email, code: c))
    }

    private func adoptFresh(_ fresh: SupabaseClient.Session) throws {
        guard fresh.userId == session?.userId else {
            throw SupabaseClient.Failure(message: String(localized: "That's a different account. Sign in again with the account you want to delete."))
        }
        store(fresh)
    }

    /// Email a team invite through the Northpin web server.
    func emailInvite(api: APIClient, code: String, email: String, name: String) async throws {
        let tok = try await token()
        try await api.sendInviteEmail(code: TeamLogic.normalizeCode(code), email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                                      name: name.trimmingCharacters(in: .whitespaces), token: tok)
    }

    /// Forget everything about the account on this device: sign-in, cloud settings, ledger, team and invites.
    func wipeForAccountDeletion() {
        pendingKick?.cancel()
        endSession(lockJobs: false)
        UserDefaults.standard.removeObject(forKey: Self.jobsLockedKey)
        UserDefaults.standard.removeObject(forKey: Self.teamKey)
        lastTeam = nil
        ledger = SyncLedger()
        imagePaths = [:]
        UserDefaults.standard.removeObject(forKey: Self.dataOwnerKey)
        UserDefaults.standard.removeObject(forKey: Self.dataOwnerEmailKey)
        teamNotice = nil
        teamLoadedAt = nil
        clearPendingInvite()
        setConfig(url: "", anonKey: "")
    }
}

// MARK: - company setup

/// The company's setup in the cloud (PinPlanCore/CompanySetup.swift; the web app's companySettings.ts and
/// companyPreferences.ts): business details in company_settings' columns, the rest in preference sections. Everyone on
/// the team reads; technicians never send; prices are only read and sent by the office.
extension CloudSync {
    static let companyDetailsMarkKey = "pinplan.companySettings"
    static let companyPrefsMarkKey = "pinplan.companyPreferences"

    private static func readMark<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let d = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    private static func writeMark<T: Encodable>(_ value: T, key: String) {
        if let d = try? JSONEncoder().encode(value) { UserDefaults.standard.set(d, forKey: key) }
    }

    private func companyOwner(client: SupabaseClient, token: String) async throws -> String {
        let data: Data = try await client.rpc("my_billing_owner", params: [:], token: token)
        let value: Any = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        guard let id = value as? String, !id.isEmpty else { throw SupabaseClient.Failure(message: "No company") }
        return id
    }

    private func firstRow(_ table: String, columns: String, client: SupabaseClient, token: String) async throws -> [String: Any]? {
        let data: Data = try await client.select(table, query: "select=" + columns, token: token)
        let rows: [[String: Any]] = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        return rows.first
    }

    /// Bring this device and the company's copy in step. Quiet when offline or a migration behind.
    func syncCompanySetup(app: AppModel, client: SupabaseClient, token: String, mayPush: Bool) async {
        // The role decides what may be sent: wait until it is known for this account.
        guard teamKnown, let userId = session?.userId else { return }
        // A settings screen is open with changes it saves when it closes (its save starts another sync): taking the
        // company's copy now would either overwrite them or file them as already saved, so they'd never be sent.
        guard !app.hasUnsavedCompanySettings else { return }
        // Plan by role; while the company is read-only (lapsed billing) nothing is sent, and those parts wait.
        let canWrite: Bool = role != .tech
        let detailColumns = "business_name,phone,email,website,address,terms,logo,logo_image_id,updated_at"
        var row: [String: Any]?
        var hasPreferences = true
        do {
            row = try await firstRow("company_settings", columns: detailColumns + ",preferences", client: client, token: token)
        } catch let e as SupabaseClient.Failure where Self.missingColumn(e) != nil {
            // The cloud database is a migration behind: the business details still sync.
            hasPreferences = false
            do { row = try await firstRow("company_settings", columns: detailColumns, client: client, token: token) } catch { return }
        } catch {
            return
        }
        let rowExists: Bool = row != nil
        await syncCompanyDetails(app: app, row: row, userId: userId, canWrite: canWrite, mayPush: mayPush, client: client, token: token)
        guard hasPreferences else { return }
        // Office sections: only the office reads them (and only once the invoicing settings row exists).
        var office: [String: Any]?
        if role != .tech {
            let officeRow: [String: Any]? = try? await firstRow("document_settings", columns: "preferences", client: client, token: token)
            if let officeRow { office = officeRow["preferences"] as? [String: Any] ?? [:] }
        }
        var shared: [String: Any]?
        if let row { shared = row["preferences"] as? [String: Any] ?? [:] }
        await syncCompanyPrefs(app: app, shared: shared, office: office, rowExists: rowExists, userId: userId, canWrite: canWrite,
                               mayPush: mayPush, client: client, token: token)
    }

    private func syncCompanyDetails(app: AppModel, row: [String: Any]?, userId: String, canWrite: Bool, mayPush: Bool,
                                    client: SupabaseClient, token: String) async {
        let founder: Bool = app.settings.business.brandDefaults != BusinessSettings.neutralMarker
        var mark: CompanyDetailsMark? = Self.readMark(CompanyDetailsMark.self, key: Self.companyDetailsMarkKey)
        if mark?.userId != userId { mark = nil }
        // The company's details as this device would show them (blank fields filled like the settings are on launch).
        var remote: CompanyDetails?
        if let row {
            let fromRow = CompanyDetails(row: row)
            let filled: BusinessSettings = fromRow.applied(to: app.settings.business).withDefaults(founder: founder)
            var details = CompanyDetails(business: filled)
            details.logoImageId = fromRow.logoImageId
            remote = details
        }
        // This app doesn't set a logo image id: carry the company's along so it isn't seen as a change.
        var local = CompanyDetails(business: app.settings.business)
        local.logoImageId = remote?.logoImageId ?? mark?.values.logoImageId
        let remoteAt: String? = row?["updated_at"] as? String
        let action: CompanySyncAction = CompanySync.detailsAction(local: local, localSavedAt: app.settings.updatedAt, mark: mark,
                                                                  remote: remote, remoteUpdatedAt: remoteAt, canWrite: canWrite)
        switch action {
        case .push:
            guard mayPush else { return }
            let at: String = app.settings.updatedAt ?? isoNow()
            do {
                let owner: String = try await companyOwner(client: client, token: token)
                let values: [String: Any] = local.row(ownerId: owner, updatedAt: at)
                try await client.upsert("company_settings", conflict: "owner_id", rows: [values], token: token)
                Self.writeMark(CompanyDetailsMark(userId: userId, updatedAt: at, values: local.forMark), key: Self.companyDetailsMarkKey)
            } catch {
                // Tried again on the next sync.
            }
        case .pull:
            guard let remote, let remoteAt else { return }
            var s: AppSettings = app.settings
            s.business = remote.applied(to: s.business)
            if s != app.settings { app.replaceSettingsFromCloud(s) }
            Self.writeMark(CompanyDetailsMark(userId: userId, updatedAt: remoteAt, values: remote.forMark), key: Self.companyDetailsMarkKey)
        case .none:
            if let remote, let remoteAt {
                Self.writeMark(CompanyDetailsMark(userId: userId, updatedAt: remoteAt, values: remote.forMark), key: Self.companyDetailsMarkKey)
            }
        }
    }

    private func syncCompanyPrefs(app: AppModel, shared: [String: Any]?, office: [String: Any]?, rowExists: Bool, userId: String,
                                  canWrite: Bool, mayPush: Bool, client: SupabaseClient, token: String) async {
        let founder: Bool = app.settings.business.brandDefaults != BusinessSettings.neutralMarker
        let local: CompanyPrefsValues = app.settings.companyPrefs(installPhotoRequired: InstallSettings.photoRequired)
        let previous: CompanyPrefsMark? = Self.readMark(CompanyPrefsMark.self, key: Self.companyPrefsMarkKey)
        var savedAt: [PrefKey: String] = [:]
        if let at = InstallSettings.savedAt { savedAt[.installPhotoRequired] = at }
        var plan: CompanyPrefsPlan = CompanyPrefs.plan(local: local, localSavedAt: app.settings.updatedAt, savedAt: savedAt, mark: previous,
                                                       userId: userId, shared: shared, office: office, canWrite: canWrite, trades: !onTeam)
        if !plan.pulled.isEmpty {
            var s: AppSettings = app.settings
            s.apply(plan.values, sections: plan.pulled)
            // Blank branding shows the defaults; keep the record in the form the settings take on launch.
            s.business = s.business.withDefaults(founder: founder)
            let brandingKey: String = PrefKey.branding.rawValue
            if plan.pulled.contains(.branding), let entry = plan.mark.sections[brandingKey] {
                let filled: CompanyPrefsValues = s.companyPrefs(installPhotoRequired: local.installPhotoRequired)
                let hash: String = CompanyPrefs.fingerprint(CompanyPrefs.json(.branding, filled))
                plan.mark.sections[brandingKey] = CompanyPrefsMark.Entry(updatedAt: entry.updatedAt, hash: hash)
            }
            if s != app.settings { app.replaceSettingsFromCloud(s) }
            if plan.pulled.contains(.installPhotoRequired) { InstallSettings.storeFromCloud(plan.values.installPhotoRequired) }
        }
        var failed: [String] = []
        if !mayPush {
            failed = Array(plan.pushShared.keys) + Array(plan.pushOffice.keys)
        } else if !plan.pushShared.isEmpty || !plan.pushOffice.isEmpty {
            do {
                let owner: String = try await companyOwner(client: client, token: token)
                let filter: String = "owner_id=eq." + owner
                if !plan.pushShared.isEmpty {
                    // A new row is dated 1970, so its blank business details never win over a real save.
                    if !rowExists {
                        let seed: [String: Any] = ["owner_id": owner, "updated_at": "1970-01-01T00:00:00.000Z"]
                        try await client.insertIfMissing("company_settings", conflict: "owner_id", row: seed, token: token)
                    }
                    let values: [String: Any] = ["preferences": plan.pushShared]
                    let n: Int = try await client.updateCounting("company_settings", filter: filter, values: values, select: "owner_id", token: token)
                    if n == 0 { failed += Array(plan.pushShared.keys) }
                }
                if !plan.pushOffice.isEmpty {
                    let values: [String: Any] = ["preferences": plan.pushOffice]
                    let n: Int = try await client.updateCounting("document_settings", filter: filter, values: values, select: "owner_id", token: token)
                    if n == 0 { failed += Array(plan.pushOffice.keys) }
                }
            } catch {
                failed = Array(plan.pushShared.keys) + Array(plan.pushOffice.keys)
            }
        }
        // What didn't go up is tried again next time.
        var before: [String: CompanyPrefsMark.Entry] = [:]
        if let previous, previous.userId == userId { before = previous.sections }
        for key in failed {
            plan.mark.sections[key] = before[key]
        }
        Self.writeMark(plan.mark, key: Self.companyPrefsMarkKey)
    }
}
