import Foundation
import Security
import UIKit
import Observation
import PinPlanCore

/// Session tokens for the cloud account, kept in the Keychain (never in the documents folder or backups).
enum Keychain {
    private static let service = "app.pinplan.cloud"

    static func save(_ data: Data, account: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(q as CFDictionary)
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load(account: String) -> Data? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    static func delete(account: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary)
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
            case "invalid_credentials": msg = "Wrong email or password. Use the same ones as on the web app."
            case "email_not_confirmed": msg = "This email isn't confirmed yet. Open the confirmation email (check spam), then sign in."
            case "user_already_exists": msg = "This email already has an account — tap Sign in instead."
            case "over_email_send_rate_limit": msg = "Too many emails sent — wait an hour, or sign in if the account already exists."
            default: break
            }
            throw Failure(message: msg ?? "Cloud server returned \(status)", status: status, code: j?["code"] as? String)
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
            throw Failure(message: "If you already have an account with this email, tap Sign in instead (no email is sent). If it's new, open the confirmation email (check spam), then sign in.")
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

    /// One page of rows changed on the server since the cursor (synced_at >= since, oldest first, by id within a stamp).
    func page(_ table: String, cursor: SyncPaging.Cursor, token: String) async throws -> [[String: Any]] {
        let r = request("/rest/v1/\(table)", query: SyncPaging.query(cursor), token: token)
        return (try JSONSerialization.jsonObject(with: try await send(r)) as? [[String: Any]]) ?? []
    }

    /// Rows by id (rows a pull couldn't apply before).
    func rows(_ table: String, ids: [String], token: String) async throws -> [[String: Any]] {
        guard !ids.isEmpty else { return [] }
        let r = request("/rest/v1/\(table)", query: SyncPaging.byIdQuery(ids), token: token)
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

    /// The team's subscription has lapsed (or the database refused a push as "PinPlan subscription inactive"): this
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
            let whose = previousEmail.map { "another account (\($0))" } ?? "another account"
            return "This device has \(jobs) job\(jobs == 1 ? "" : "s") from \(whose). To sync this account, remove them from this device first (they stay in the other account's cloud), or sign out."
        }
    }
    /// Cloud tables the database doesn't have yet (the latest migration hasn't been run): their rows wait.
    private(set) var missingTables: [String] = []

    @ObservationIgnored private weak var app: AppModel?
    @ObservationIgnored private var ledger = SyncLedger()
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var pendingKick: Task<Void, Never>?

    private static let configKey = "pinplan.cloud.config"
    private static let sessionAccount = "session"
    /// The account the jobs on this device were last synced with (and its email, for the prompt).
    private static let dataOwnerKey = "pinplan.cloud.dataOwner"
    private static let dataOwnerEmailKey = "pinplan.cloud.dataOwnerEmail"

    init() {
        if let d = UserDefaults.standard.data(forKey: Self.configKey) { config = try? JSONDecoder().decode(SupabaseClient.Config.self, from: d) }
        if let d = Keychain.load(account: Self.sessionAccount) {
            let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
            session = try? dec.decode(SupabaseClient.Session.self, from: d)
        }
        loadTeamCache()
    }

    var signedIn: Bool { session != nil && config != nil }
    private var client: SupabaseClient? { config.map { SupabaseClient(config: $0) } }

    func attach(_ app: AppModel) {
        self.app = app
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

    func setConfig(url: String, anonKey: String) {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines), k = anonKey.trimmingCharacters(in: .whitespacesAndNewlines)
        config = (u.isEmpty || k.isEmpty) ? nil : .init(url: u.hasPrefix("http") ? u : "https://\(u)", anonKey: k)
        if let config, let d = try? JSONEncoder().encode(config) { UserDefaults.standard.set(d, forKey: Self.configKey) } else { UserDefaults.standard.removeObject(forKey: Self.configKey) }
    }

    /// Fetch the cloud settings from the PinPlan server (they are public values: project URL + anon key).
    func configure(from api: APIClient) async throws {
        var req = URLRequest(url: api.baseURL.appendingPathComponent("api/config"))
        req.timeoutInterval = 20
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any], let url = j["supabaseUrl"] as? String, let key = j["supabaseAnonKey"] as? String,
              !url.isEmpty, !key.isEmpty else {
            throw SupabaseClient.Failure(message: "Cloud sync isn't switched on for that PinPlan server yet.")
        }
        setConfig(url: url, anonKey: key)
    }

    func signIn(email: String, password: String, create: Bool) async throws {
        guard let client else { throw SupabaseClient.Failure(message: "Connect a cloud project first.") }
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
            case .signedIn: return "Account created."
            case .confirmEmail(let e):
                return "Check \(e.isEmpty ? "your inbox" : e) for the confirmation email (and spam), tap the link, then come back and sign in. If this email already has an account, just sign in."
            }
        }
    }

    /// Create an account (`POST /auth/v1/signup`). True when it signed straight in; false when the email has to be
    /// confirmed first. Any invite code remembered with `rememberPendingInvite` is used after the next sign-in.
    @discardableResult
    func createAccount(email: String, password: String) async throws -> Bool {
        guard let client else { throw SupabaseClient.Failure(message: "Connect a cloud project first.") }
        guard let s = try await client.signUp(email: email, password: password) else { return false }
        await begin(s)
        return true
    }

    /// A new sign-in: switch ledgers, learn the team (and finish a remembered invite), then sync.
    private func begin(_ s: SupabaseClient.Session) async {
        if let old = session, old.userId != s.userId { ledger = SyncLedger(); team = nil; soloBilling = nil; soloUserId = nil }
        store(s)
        loadLedger()
        loadTeamCache()
        await loadTeam()
        await finishPendingInvite()
        await syncNow()
    }

    func signOut() {
        session = nil
        accountSwitch = nil
        missingTables = []
        Keychain.delete(account: Self.sessionAccount)
        lastSync = nil
        lastSummary = nil
        uploadBacklogs = [:]
        team = nil
        teamNeedsMigration = false
        teamError = nil
        readOnly = false
        pendingChanges = 0
        readOnlyUntil = nil
        soloBilling = nil
        soloUserId = nil
        UserDefaults.standard.removeObject(forKey: Self.teamKey)
        UserDefaults.standard.removeObject(forKey: Self.soloKey)
    }

    private func store(_ s: SupabaseClient.Session) {
        session = s
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        if let d = try? enc.encode(s) { Keychain.save(d, account: Self.sessionAccount) }
    }

    @ObservationIgnored private var refreshing: Task<SupabaseClient.Session, Error>?

    /// A valid access token. Renews the sign-in a few minutes before it runs out; stays signed in when offline
    /// (renewal is retried later) and only signs out if the server rejects the saved sign-in.
    private func token() async throws -> String {
        guard let client, let s = session else { throw SupabaseClient.Failure(message: "Not signed in") }
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
            signOut()
            throw SupabaseClient.Failure(message: "Your sign-in ended — please sign in again.")
        } catch {
            // Offline or the server didn't answer: keep the sign-in and try again on the next sync.
            if s.expiresAt > Date() { return s.accessToken }
            throw SupabaseClient.Failure(message: "Can't reach the cloud right now — will retry.")
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
        let decision = AccountSwitch.decide(dataOwner: owner, signingIn: uid, hasLocalJobs: !app.projects.isEmpty,
                                            otherAccountLedgers: others, ownLedger: ownFile)
        guard decision == .proceed else {
            accountSwitch = AccountSwitchPrompt(jobs: app.projects.count, previousEmail: owner == nil ? nil : defaults.string(forKey: Self.dataOwnerEmailKey))
            lastError = accountSwitch?.message
            return false
        }
        if owner != uid {
            // The jobs are gone (removed by hand) but the catalog and products are still the other account's: keep
            // them here without sending them into this account.
            if AccountSwitch.isOtherAccount(dataOwner: owner, signingIn: uid, otherAccountLedgers: others, ownLedger: ownFile) {
                AccountSwitch.keepWithoutSending(app.catalog, products: app.products, in: &ledger)
                saveLedger()
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
        let before = state(app)
        var after = before
        after.bundles = [:]
        app.applySync(from: before, to: after)
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
            await self?.syncNow()
        }
    }

    /// `force` (the Sync now button) also retries pushing right away after a "subscription inactive" refusal.
    func syncNow(force: Bool = false) async {
        guard signedIn, !syncing, let app, let client else { return }
        // Another account's jobs on this device: nothing syncs until the person chooses.
        guard checkAccount(app) else { return }
        syncing = true
        defer { syncing = false; refreshUploadBacklogs() }
        do {
            let token = try await token()
            // Know the role (and the team's billing) before pushing, so this device never sends what the database
            // would refuse.
            await loadTeam(maxAge: 50)
            applyTeamTrades(app)
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
            try await images(app: app, client: client, token: token, uploads: !blocked)
            saveLedger()
            pendingChanges = blocked ? countPending(app) : 0
            lastSync = Date()
            func text(_ e: Error) -> String { (e as? LocalizedError)?.errorDescription ?? e.localizedDescription }
            lastError = refused.map { "Some changes weren't accepted by the cloud (they'll be tried again): " + text($0) }
                ?? pullError.map { "Some changes couldn't be received (they'll be tried again): " + text($0) }
                ?? (missingTables.isEmpty ? nil : "The cloud isn't up to date yet, so some job data doesn't sync (" + missingTables.joined(separator: ", ") + "). Everything else is synced.")
            if blocked {
                lastSummary = BillingLogic.readOnlyStatus(pending: pendingChanges, device: UIDevice.current.model)
            } else {
                lastSummary = pushed + pulled == 0 ? "Up to date" : "Sent \(pushed), received \(pulled) change\(pushed + pulled == 1 ? "" : "s")"
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
        guard let client else { throw SupabaseClient.Failure(message: "Cloud sync isn't connected.") }
        let data = try await client.select("proposals", query: "select=*&project_id=eq.\(projectId)&order=created_at.desc", token: try await token())
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
        guard let client, let uid = session?.userId else { throw SupabaseClient.Failure(message: "Sign in to cloud sync first.") }
        let tok = try await token()
        // The job must be on the server first (proposals belong to a synced job).
        await syncAndWait()
        var urls: [String: String] = [:]
        for (i, (sheetId, data)) in images.sorted(by: { $0.key < $1.key }).enumerated() {
            progress("Uploading plan \(i + 1) of \(images.count)…")
            let path = "\(uid)/\(link)/\(sheetId).jpg"
            try await client.upload(bucket: "proposals", path: path, data: data, token: tok)
            urls[sheetId] = client.publicURL(bucket: "proposals", path: path)
        }
        progress("Publishing…")
        let snap = build(urls)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(snap))
        _ = try await client.insert("proposals", row: ["id": link, "project_id": projectId, "snapshot": json, "valid_until": snap.validUntil.map { $0 as Any } ?? NSNull()], token: tok)
        // Earlier open links are withdrawn only now that the new one exists (a failed publish leaves the client's link working).
        for id in withdraw { try? await client.patch("proposals", filter: "id=eq.\(id)", values: ["status": "revoked", "updated_at": isoNow()], token: tok) }
    }

    /// Upload a file anyone with the link can open (under this account's folder) and return its address.
    func uploadPublic(path: String, data: Data, contentType: String) async throws -> String {
        guard let client, let uid = session?.userId else { throw SupabaseClient.Failure(message: "Sign in to cloud sync first.") }
        let full = "\(uid)/\(path)"
        try await client.upload(bucket: "proposals", path: full, data: data, token: try await token(), contentType: contentType)
        return client.publicURL(bucket: "proposals", path: full)
    }

    /// Save a photo report the client can open at /r?t=<token> (photos already uploaded with `uploadPublic`).
    func publishPhotoReport(token link: String, projectId: String, snapshot: [String: Any]) async throws {
        guard let client else { throw SupabaseClient.Failure(message: "Sign in to cloud sync first.") }
        await syncAndWait()   // the report belongs to a synced job
        do {
            _ = try await client.insert("photo_reports", row: ["id": link, "project_id": projectId, "snapshot": snapshot], token: try await token())
        } catch {
            let m = error.localizedDescription
            if m.contains("does not exist") || m.contains("schema cache") {
                throw SupabaseClient.Failure(message: "Photo reports aren't switched on for this PinPlan server yet. Try again once it's updated.")
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
        var refused: Error?
        var sent = 0
        for t in SyncMap.pushOrder {
            let rows = changed.filter { $0.table == t }
            guard !rows.isEmpty, let spec = SyncMap.specs[t] else { continue }
            // Technicians can't write prices (the database refuses): drop those edits instead of retrying forever.
            guard TeamLogic.mayPush(t, role: role) else {
                s.markSynced(rows, ledger: &ledger)
                continue
            }
            func payload(_ chunk: [SyncState.Row]) -> [[String: Any]] {
                chunk.map { r -> [String: Any] in
                    var row = SyncMap.toRemote(t, r.json)
                    row["updated_at"] = now   // newer than any copy elsewhere, so other devices take this edit
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
                        noteRefusal(e, rows: chunk, role: role, refused: &refused)
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
                            noteRefusal(one, rows: [r], role: role, refused: &refused)
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
                    teamNotice = "Only the office can delete a job, so it's back on this device."
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
        case .salesDocs: return "quotes & invoices"
        case .salesPayments: return "payments"
        case .rfis: return "RFIs"
        case .scheduleItems: return "schedule"
        case .measurements: return "saved measurements"
        case .sheetLinks: return "plan links"
        case .planMarkups: return "markups"
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
        var marks: [String: String] = [:]
        var askedAgain: [SyncTable: Set<String>] = [:]
        var failure: Error?
        var parentsFailed = false
        var missing: [String] = []
        let role = self.role
        tables: for t in SyncMap.pushOrder {
            guard let spec = SyncMap.specs[t], TeamLogic.mayPull(t, role: role) else { continue }
            do {
                var cur = SyncPaging.Cursor(since: SyncPaging.pullStart(ledger.watermarks[t.rawValue]))
                while true {
                    let rows = try await client.page(spec.remote, cursor: cur, token: token)
                    fetched += rows.map { (t, $0) }
                    let next = SyncPaging.next(cur, rows: rows)
                    cur = next.cursor
                    if !rows.isEmpty { marks[t.rawValue] = cur.since }
                    if next.done { break }
                }
                let waiting = ledger.retry[t.rawValue] ?? []
                for i in stride(from: 0, to: waiting.count, by: 100) {
                    let ids = Array(waiting[i..<min(i + 100, waiting.count)])
                    fetched += try await client.rows(spec.remote, ids: ids, token: token).map { (t, $0) }
                    askedAgain[t, default: []].formUnion(ids)
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
            for (t, row) in fetched {
                let r = s.merge(t, remote: row, ledger: &ledger)
                if r == .applied || r == .removedProject { applied += 1 }
                if let id = row["id"] as? String {
                    if SyncState.needsRetry(r, parentsFailed: parentsFailed) { again[t, default: []].append(id) } else { settled[t, default: []].insert(id) }
                }
                // Only a path that names this image (a new revision's row can arrive before its image_path moves on).
                if t == .sheets, let path = row["image_path"] as? String, let id = row["image_id"] as? String, path.hasSuffix("/\(id)") { imagePaths[id] = path }
            }
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
                try await attempt(d.fileId) { try await client.upload(bucket: "plans", path: "\(pid)/\(d.fileId)", data: data, token: token, contentType: d.mime) }
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

    /// My role, or nil when working alone (full access) or signed out.
    var role: TeamRole? {
        guard signedIn, let t = team, t.userId == session?.userId, t.team != nil else { return nil }
        return t.role
    }
    /// What this user may do. Solo users (no team) can do everything.
    func can(_ action: TeamAction) -> Bool { TeamLogic.can(role, action) }
    var onTeam: Bool { role != nil }
    /// My row on the team.
    var teamMe: TeamMember? { role == nil ? nil : team?.me }
    /// Everyone on the team, owner first.
    var teamMembers: [TeamMember] { role == nil ? [] : TeamLogic.sortMembers(team?.members ?? []) }

    func loadTeamCache() {
        loadSoloCache()
        guard let uid = session?.userId, let d = UserDefaults.standard.data(forKey: Self.teamKey),
              let snap = try? JSONDecoder().decode(TeamSnapshot.self, from: d), snap.userId == uid else { return }
        if team == nil { team = snap }
    }

    private func saveTeam(_ snap: TeamSnapshot) {
        team = snap
        teamLoadedAt = Date()
        if let d = try? JSONEncoder().encode(snap) { UserDefaults.standard.set(d, forKey: Self.teamKey) }
        // Joining or changing teams (create, invite, another device): pull everything again once.
        if snap.userId == session?.userId, ledger.noteTeam(snap.team?.id) { saveLedger() }
    }

    private static let teamTradesSeenKey = "pinplan.team.tradesSeen"

    /// Follow the team's trades (set by the office on the web or another device). A change made on this device stands
    /// until the team's trades change again. Catalog packs are added only for people who may change the catalog.
    func applyTeamTrades(_ app: AppModel) {
        guard role != nil, let t = team?.team else { return }
        let key = "\(Self.teamTradesSeenKey).\(t.id)"
        let seen = UserDefaults.standard.stringArray(forKey: key)
        if let next = Team.tradesToAdopt(team: t.trades, seen: seen, local: app.trades) {
            app.setTrades(next, addPacks: can(.editCatalog))
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
        guard signedIn, role == nil, let uid = session?.userId, soloUserId == uid else { return nil }
        if ProcessInfo.processInfo.arguments.contains("--billing-banner") { return nil }
        return soloBilling
    }

    /// The team's subscription as last loaded. Nil when working alone (never locked).
    /// Screenshot hook: `--billing-banner` shows a read-only team, `--billing-banner trial` a trial about to end.
    var billing: TeamBilling? {
        guard role != nil else { return nil }
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
    var canWork: Bool { BillingLogic.allowsWork(onTeam: role != nil, billing: billing, solo: solo) }
    /// Jobs may be changed on this device (a lapsed team, or an ended personal trial, is read-only: view and export
    /// only, like the web app).
    var canEdit: Bool { BillingLogic.canEdit(onTeam: role != nil, billing: billing, solo: solo) }
    /// Why changes are blocked, for an alert (nil when they're allowed).
    var editBlockedMessage: String? { BillingLogic.editBlockedMessage(onTeam: role != nil, billing: billing, solo: solo, role: role) }
    /// The notice for the Projects screen and the job view, if any.
    var billingBanner: BillingBanner? { role != nil ? BillingLogic.banner(billing, role: role) : BillingLogic.soloBanner(solo) }
    /// Plan status line for Settings › Team.
    var billingStatus: BillingStatusLine? { billing.map { BillingLogic.statusLine($0) } }

    /// Run a team call with a friendly message on failure (missing migration, signed out…).
    private func teamCall<T>(_ work: (SupabaseClient, String) async throws -> T) async throws -> T {
        guard let client else { throw SupabaseClient.Failure(message: "Connect cloud sync first.") }
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
        guard let id = team?.team?.id else { throw SupabaseClient.Failure(message: "Start your team first.") }
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
        throw SupabaseClient.Failure(message: "Couldn't make an invite code. Try again.")
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
        guard let client else { throw SupabaseClient.Failure(message: "Connect cloud sync first.") }
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
    }

    var pendingInvite: PendingInvite? {
        guard let d = UserDefaults.standard.data(forKey: Self.pendingInviteKey) else { return nil }
        return try? JSONDecoder().decode(PendingInvite.self, from: d)
    }

    func rememberPendingInvite(code: String, name: String) {
        let p = PendingInvite(code: TeamLogic.normalizeCode(code), name: name.trimmingCharacters(in: .whitespaces))
        if let d = try? JSONEncoder().encode(p) { UserDefaults.standard.set(d, forKey: Self.pendingInviteKey) }
    }

    func clearPendingInvite() { UserDefaults.standard.removeObject(forKey: Self.pendingInviteKey) }

    /// Call after sign-in: joins the team from a remembered invite, if any.
    func finishPendingInvite() async {
        guard let p = pendingInvite, signedIn else { return }
        do {
            let r = try await acceptInvite(p.code, name: p.name)
            clearPendingInvite()
            teamNotice = "You joined \(r.team.isEmpty ? "the team" : r.team) as \(r.role.name)."
        } catch let e as SupabaseClient.Failure where e.status != 0 {
            // A dead code won't start working later; a network error might.
            clearPendingInvite()
            teamNotice = "Couldn't join with the saved invite code: \(e.message)"
        } catch {
            // Offline: try again after the next sign-in.
        }
    }
}

// MARK: - account

/// Password reset, account deletion and the signed-in calls to the PinPlan web server.
extension CloudSync {
    /// A valid access token for calls to the PinPlan web server (account deletion, invite emails).
    func accessToken() async throws -> String { try await token() }

    /// Email a password-reset link. `serverURL` is the PinPlan web server; its /reset page sets the new password.
    func sendPasswordReset(email: String, serverURL: String) async throws {
        guard let client else { throw SupabaseClient.Failure(message: "Connect a cloud project first.") }
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard e.contains("@") else { throw SupabaseClient.Failure(message: "Enter your email address first.") }
        try await client.recover(email: e, redirectTo: BillingLogic.webURL(origin: serverURL, path: "reset"))
    }

    /// Delete the account on the server (`DELETE /api/account`). The caller wipes this device after `.deleted`.
    /// Unless the sign-in is fresh (the last 5 minutes), the server wants the account's email typed again
    /// (`confirmEmail`) and answers 403 `reauth_required` without it: `.needsEmail`, so the screen asks for it.
    func deleteAccount(api: APIClient, confirmEmail: String? = nil) async throws -> AccountDeletionResult {
        guard signedIn else { throw SupabaseClient.Failure(message: "Sign in first.") }
        let tok = try await token()
        var req = URLRequest(url: api.baseURL.appendingPathComponent("api/account"))
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        if let body = AccountDeletionResult.body(confirmEmail: confirmEmail) {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        req.timeoutInterval = 60
        let (data, resp) = try await URLSession.shared.data(for: req)
        return AccountDeletionResult.from(status: (resp as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }

    /// Email a team invite through the PinPlan web server.
    func emailInvite(api: APIClient, code: String, email: String, name: String) async throws {
        let tok = try await token()
        try await api.sendInviteEmail(code: TeamLogic.normalizeCode(code), email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                                      name: name.trimmingCharacters(in: .whitespaces), token: tok)
    }

    /// Forget everything about the account on this device: sign-in, cloud settings, ledger, team and invites.
    func wipeForAccountDeletion() {
        pendingKick?.cancel()
        signOut()
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
