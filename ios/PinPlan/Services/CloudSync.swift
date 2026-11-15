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
    struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }

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
            let msg = (j?["error_description"] ?? j?["msg"] ?? j?["message"] ?? j?["error"]) as? String
            throw Failure(message: msg ?? "Cloud server returned \(status)")
        }
        return data
    }

    // MARK: auth

    private func session(from data: Data) throws -> Session {
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = j["access_token"] as? String, let refresh = j["refresh_token"] as? String,
              let user = j["user"] as? [String: Any], let uid = user["id"] as? String else {
            throw Failure(message: "Check your email to confirm the account, then sign in.")
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

    func signUp(email: String, password: String) async throws -> Session {
        var r = request("/auth/v1/signup", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
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

    /// Rows changed on the server after `watermark` (the server's synced_at), oldest first.
    func changes(_ table: String, after watermark: String, limit: Int, token: String) async throws -> [[String: Any]] {
        let wm = watermark.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? watermark
        let r = request("/rest/v1/\(table)", query: "select=*&synced_at=gt.\(wm)&order=synced_at.asc&limit=\(limit)", token: token)
        return (try JSONSerialization.jsonObject(with: try await send(r)) as? [[String: Any]]) ?? []
    }

    // MARK: storage

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

    @ObservationIgnored private weak var app: AppModel?
    @ObservationIgnored private var ledger = SyncLedger()
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var pendingKick: Task<Void, Never>?

    private static let configKey = "pinplan.cloud.config"
    private static let sessionAccount = "session"

    init() {
        if let d = UserDefaults.standard.data(forKey: Self.configKey) { config = try? JSONDecoder().decode(SupabaseClient.Config.self, from: d) }
        if let d = Keychain.load(account: Self.sessionAccount) {
            let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
            session = try? dec.decode(SupabaseClient.Session.self, from: d)
        }
    }

    var signedIn: Bool { session != nil && config != nil }
    private var client: SupabaseClient? { config.map { SupabaseClient(config: $0) } }

    func attach(_ app: AppModel) {
        self.app = app
        loadLedger()
        startLoop()
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
            throw SupabaseClient.Failure(message: "Cloud sync isn't set up on that server yet (add the Supabase keys in Vercel).")
        }
        setConfig(url: url, anonKey: key)
    }

    func signIn(email: String, password: String, create: Bool) async throws {
        guard let client else { throw SupabaseClient.Failure(message: "Connect a cloud project first.") }
        let s = create ? try await client.signUp(email: email, password: password) : try await client.signIn(email: email, password: password)
        if let old = session, old.userId != s.userId { ledger = SyncLedger() }
        store(s)
        loadLedger()
        await syncNow()
    }

    func signOut() {
        session = nil
        Keychain.delete(account: Self.sessionAccount)
        lastSync = nil
        lastSummary = nil
    }

    private func store(_ s: SupabaseClient.Session) {
        session = s
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        if let d = try? enc.encode(s) { Keychain.save(d, account: Self.sessionAccount) }
    }

    private func token() async throws -> String {
        guard let client, var s = session else { throw SupabaseClient.Failure(message: "Not signed in") }
        if s.expiresAt < Date() {
            do { s = try await client.refresh(s); store(s) } catch {
                signOut()
                throw SupabaseClient.Failure(message: "Signed out — please sign in again.")
            }
        }
        return s.accessToken
    }

    // MARK: ledger

    private var ledgerURL: URL? { app.map { $0.store.root.appendingPathComponent("sync-\(session?.userId ?? "none").json") } }
    private func loadLedger() {
        guard let url = ledgerURL, let d = try? Data(contentsOf: url), let l = try? JSONDecoder().decode(SyncLedger.self, from: d) else { ledger = SyncLedger(); return }
        ledger = l
    }
    private func saveLedger() {
        guard let url = ledgerURL, let d = try? JSONEncoder().encode(ledger) else { return }
        try? d.write(to: url, options: .atomic)
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
        pendingKick?.cancel()
        pendingKick = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        guard signedIn, !syncing, let app, let client else { return }
        syncing = true
        defer { syncing = false }
        do {
            let token = try await token()
            let pushed = try await push(app: app, client: client, token: token)
            let pulled = try await pull(app: app, client: client, token: token)
            try await images(app: app, client: client, token: token)
            saveLedger()
            lastSync = Date()
            lastError = nil
            lastSummary = pushed + pulled == 0 ? "Up to date" : "Sent \(pushed), received \(pulled) change\(pushed + pulled == 1 ? "" : "s")"
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            saveLedger()
        }
    }

    private func state(_ app: AppModel) -> SyncState { SyncState(bundles: app.projects, catalog: app.catalog, products: app.products) }

    private func push(app: AppModel, client: SupabaseClient, token: String) async throws -> Int {
        let s = state(app)
        let changed = s.changes(since: ledger)
        let now = isoNow()
        for t in SyncMap.pushOrder {
            let rows = changed.filter { $0.table == t }
            guard !rows.isEmpty, let spec = SyncMap.specs[t] else { continue }
            for chunk in stride(from: 0, to: rows.count, by: 200).map({ Array(rows[$0..<min($0 + 200, rows.count)]) }) {
                let payload = chunk.map { r -> [String: Any] in
                    var row = SyncMap.toRemote(t, r.json)
                    row["updated_at"] = now   // newer than any copy elsewhere, so other devices take this edit
                    return row
                }
                try await client.upsert(spec.remote, conflict: spec.conflict, rows: payload, token: token)
                s.markSynced(chunk, ledger: &ledger)
            }
        }
        // Jobs deleted on this device.
        let removed = s.removedProjects(since: ledger)
        for id in removed {
            try await client.patch("projects", filter: "id=eq.\(id)", values: ["deleted": true, "updated_at": now], token: token)
            for k in ledger.hashes.keys where k == SyncLedger.key(.projects, id) { ledger.hashes.removeValue(forKey: k) }
        }
        return changed.count + removed.count
    }

    private func pull(app: AppModel, client: SupabaseClient, token: String) async throws -> Int {
        // Fetch first (async), then merge into whatever is current on the main actor, so edits made meanwhile are kept.
        var fetched: [(SyncTable, [String: Any])] = []
        var marks: [String: String] = [:]
        for t in SyncMap.pushOrder {
            guard let spec = SyncMap.specs[t] else { continue }
            var wm = ledger.watermarks[t.rawValue] ?? "1970-01-01T00:00:00Z"
            while true {
                let rows = try await client.changes(spec.remote, after: wm, limit: 1000, token: token)
                fetched += rows.map { (t, $0) }
                guard let last = rows.last?["synced_at"] as? String else { break }
                wm = last
                marks[t.rawValue] = last
                if rows.count < 1000 { break }
            }
        }
        guard !fetched.isEmpty else { return 0 }
        var s = state(app)
        let before = s
        var applied = 0
        for (t, row) in fetched {
            let r = s.merge(t, remote: row, ledger: &ledger)
            if r == .applied || r == .removedProject { applied += 1 }
            if t == .sheets, let path = row["image_path"] as? String, let id = row["image_id"] as? String { imagePaths[id] = path }
        }
        for (k, v) in marks { ledger.watermarks[k] = v }
        app.applySync(from: before, to: s)
        return applied
    }

    @ObservationIgnored private var imagePaths: [String: String] = [:]

    /// Upload plan images this device has that the cloud doesn't; download ones it is missing.
    private func images(app: AppModel, client: SupabaseClient, token: String) async throws {
        for b in app.projects {
            let pid = b.project.id
            for s in b.liveSheets where !ledger.uploadedImages.contains(s.imageId) {
                guard let data = app.store.imageData(s.imageId) else { continue }
                let path = "\(pid)/\(s.imageId)"
                try await client.upload(path: path, data: data, token: token)
                try await client.patch("sheets", filter: "image_id=eq.\(s.imageId)", values: ["image_path": path], token: token)
                ledger.uploadedImages.insert(s.imageId)
            }
            for m in b.liveMarkers {
                guard let id = m.photoId, !ledger.uploadedImages.contains(id), let data = app.store.imageData(id) else { continue }
                try await client.upload(path: "\(pid)/\(id)", data: data, token: token)
                ledger.uploadedImages.insert(id)
            }
        }
        for b in app.projects {
            for s in b.liveSheets where app.store.imageData(s.imageId) == nil {
                let path = imagePaths[s.imageId] ?? "\(b.project.id)/\(s.imageId)"
                guard let data = try? await client.download(path: path, token: token) else { continue }   // may still be uploading elsewhere
                _ = app.store.saveImageData(data, id: s.imageId)
                ledger.uploadedImages.insert(s.imageId)
            }
        }
    }
}
