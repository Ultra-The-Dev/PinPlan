import Foundation
import UIKit
import PinPlanCore

/// Talks to the hosted PinPlan server (the web app's API) for Billdu, account tools and AI scan.
/// Billdu credentials and the Anthropic key live only on that server.
///
/// Who is asking: when signed in, every call carries the user's own session (`Authorization: Bearer …`), so Billdu
/// uses their company's connection. Only when signed out does a self-hosted server's access code go along instead.
struct APIClient {
    let baseURL: URL
    let accessCode: String

    init?(settings: AppSettings) {
        let raw = settings.serverURL.trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty, let url = URL(string: raw.hasPrefix("http") ? raw : "https://\(raw)") else { return nil }
        baseURL = url
        accessCode = settings.accessCode
    }

    struct APIError: LocalizedError {
        let message: String
        /// HTTP status when the server answered (0 otherwise).
        var status: Int = 0
        var errorDescription: String? { message }
    }

    // MARK: who is asking

    /// Hands out the signed-in user's access token (renewed first when it is about to run out), or nil when signed
    /// out. Installed by `CloudSync.prepareAtLaunch(settings:)`.
    @MainActor static var sessionToken: (@MainActor () async -> String?)?

    @MainActor private static func currentSessionToken() async -> String? { await sessionToken?() }

    /// The session when signed in; otherwise the access code (if one is set under Advanced).
    private func identify(_ req: inout URLRequest, token: String? = nil) async {
        var tok = token
        if tok == nil { tok = await Self.currentSessionToken() }
        if let tok, !tok.isEmpty {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        } else if !accessCode.isEmpty {
            req.setValue(accessCode, forHTTPHeaderField: "x-pinplan-access")
        }
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any], as: T.Type) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        await identify(&req)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 300
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(message: msg ?? (status == 401 ? String(localized: "Sign in first (Settings › Account and cloud sync).") : String(localized: "Server returned \(status)")), status: status)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// POST JSON to the server and decode the reply (used by the photo AI helpers).
    func postJSON<T: Decodable>(_ path: String, body: [String: Any], as type: T.Type) async throws -> T {
        try await post(path, body: body, as: type)
    }

    // MARK: Connection check

    /// What the server reports about itself; feature flags only arrive once the caller is accepted (signed in, or
    /// the access code on a self-hosted server).
    struct Health: Decodable {
        let ok: Bool
        let app: String?
        let authMode: String?
        let authorized: Bool
        let ai: Bool?
        let billdu: Bool?
    }

    func health() async throws -> Health {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/health"))
        await identify(&req)
        req.timeoutInterval = 20
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        // 503 with a PinPlan body means "up, but some production settings (Stripe, email…) aren't set yet": the
        // server works for signing in and syncing, so accept it.
        guard (200..<300).contains(status) || status == 503, let h = try? JSONDecoder().decode(Health.self, from: data), h.app == "pinplan" else {
            throw APIError(message: status == 404 ? String(localized: "That address isn't a PinPlan server (or it needs the latest version deployed).") : String(localized: "The server answered \(status). Check the address."))
        }
        return h
    }

    // MARK: Signed-in calls (the cloud sign-in's access token proves who is asking)

    /// Send a request with the user's access token. Returns the status and body; only no answer at all throws.
    private func authed(_ method: String, _ path: String, body: [String: Any]?, token: String) async throws -> (Int, Data) {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        await identify(&req, token: token)
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        req.timeoutInterval = 60
        let (data, resp) = try await URLSession.shared.data(for: req)
        return ((resp as? HTTPURLResponse)?.statusCode ?? 0, data)
    }

    private static func errorText(_ data: Data) -> String? {
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard let m = j?["error"] as? String, !m.isEmpty else { return nil }
        return m
    }

    /// The support page on this server ("https://…/support").
    var supportURL: String { baseURL.absoluteString.hasSuffix("/") ? baseURL.absoluteString + "support" : baseURL.absoluteString + "/support" }

    // Account deletion (DELETE /api/account) is CloudSync.deleteAccount(api:confirmEmail:): it sends the typed email
    // and reads the server's 403 reauth_required through PinPlanCore's AccountDeletionResult.

    /// Can this server send email (team invites)? False when it can't, or can't be reached.
    func emailConfigured() async -> Bool {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/email/status"))
        await identify(&req)
        req.timeoutInterval = 20
        guard let res = try? await URLSession.shared.data(for: req),
              let status = (res.1 as? HTTPURLResponse)?.statusCode, (200..<300).contains(status),
              let j = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any] else { return false }
        return (j["configured"] as? Bool) == true
    }

    /// Email a team invite (owner or admin; `POST /api/team/invite-email`).
    func sendInviteEmail(code: String, email: String, name: String, token: String) async throws {
        var body: [String: Any] = ["code": code, "email": email]
        if !name.isEmpty { body["name"] = name }
        let (status, data) = try await authed("POST", "api/team/invite-email", body: body, token: token)
        if (200..<300).contains(status) { return }
        if status == 501 {
            throw APIError(message: Self.errorText(data) ?? String(localized: "Email isn't set up on this server. Share the invite with the buttons above instead."), status: status)
        }
        throw APIError(message: Self.errorText(data) ?? String(localized: "Couldn't send the email (\(status)). Try again."), status: status)
    }

    // MARK: Billdu

    /// The caller's own Billdu connection (`GET /api/billdu/credentials`): signed in, that is their company's keys
    /// (entered on the web, Settings › Billdu). Never contains the secret.
    struct BillduStatus: Decodable, Equatable {
        /// "team", "solo" (signed in, not on a team) or "single_company" (a self-hosted server with one shared key).
        let mode: String?
        let teamName: String?
        let configured: Bool
    }

    func billduStatus() async throws -> BillduStatus {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/billdu/credentials"))
        await identify(&req)
        req.timeoutInterval = 20
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let fallback: String
            switch status {
            case 401: fallback = String(localized: "Sign in to see your company's Billdu connection.")
            case 403: fallback = String(localized: "Billdu is handled by the office. Ask an admin on your team.")
            default: fallback = String(localized: "Couldn't check Billdu (\(status)). Try again in a moment.")
            }
            throw APIError(message: Self.errorText(data) ?? fallback, status: status)
        }
        do { return try JSONDecoder().decode(BillduStatus.self, from: data) } catch {
            throw APIError(message: String(localized: "This PinPlan server needs the latest version to show the Billdu connection."), status: status)
        }
    }

    struct SendResult: Decodable {
        struct Doc: Decodable { let id: Int; let type: String; let serial: String?; let amount: Double; let percent: Double?; let updated: Bool? }
        let clientId: Int
        let doc: Doc
    }

    func sendToBilldu(project: Project, docType: String, estimate: Estimate, pricing: PricingSettings, depositPct: Double?, existingDocId: Int?, plansUrl: String? = nil, products: [Product] = []) async throws -> SendResult {
        var lines: [[String: Any]] = (try JSONSerialization.jsonObject(with: JSONEncoder().encode(estimate.lines)) as? [[String: Any]]) ?? []
        // Item code in Billdu = the product's SKU when there is one (same as the web app).
        for i in lines.indices {
            if let key = lines[i]["key"] as? String, let sku = ProductAssignment.lineSku(key, project: project, products: products) { lines[i]["sku"] = sku }
        }
        var p: [String: Any] = ["id": project.id, "clientName": project.clientName, "address": project.address]
        if let v = project.clientEmail { p["clientEmail"] = v }
        if let v = project.clientPhone { p["clientPhone"] = v }
        if let v = project.billduClientId { p["billduClientId"] = v }
        var body: [String: Any] = ["project": p, "docType": docType, "lines": lines, "taxPct": pricing.taxPct, "currency": pricing.currency]
        if let depositPct { body["depositPct"] = depositPct }
        if let existingDocId { body["existingDocId"] = existingDocId }
        if let plansUrl { body["plansUrl"] = plansUrl }
        return try await post("api/billdu/send", body: body, as: SendResult.self)
    }

    // MARK: Plan reader

    struct Explanation: Decodable {
        struct Room: Decodable, Hashable { let name: String; let size: String?; let x: Double; let y: Double }
        struct Dimension: Decodable, Hashable { let text: String; let feet: Double?; let describes: String?; let x: Double; let y: Double }
        struct Note: Decodable, Hashable { let text: String; let category: String; let x: Double; let y: Double }
        let sheetTitle: String
        let sheetType: String
        let scale: String?
        let summary: String
        let rooms: [Room]
        let dimensions: [Dimension]
        let notes: [Note]
        let verify: [String]
    }

    struct Answer: Decodable, Hashable {
        struct Point: Decodable, Hashable { let label: String; let x: Double; let y: Double }
        let answer: String
        let points: [Point]
    }

    private func planImage(_ image: UIImage) throws -> String {
        // A sharper image than the scan suggestions use: plan text must stay legible.
        let small = image.downscaled(maxSide: 2400)
        guard let jpeg = small.jpegData(compressionQuality: 0.88) else { throw APIError(message: String(localized: "Couldn't encode the sheet image.")) }
        return jpeg.base64EncodedString()
    }

    func explain(image: UIImage, sheet: Sheet) async throws -> Explanation {
        var body: [String: Any] = ["imageBase64": try planImage(image), "mime": "image/jpeg", "mode": "explain", "sheetName": sheet.name]
        if let s = sheet.scaleLabel, sheet.pxPerFt != nil { body["knownScale"] = s }
        return try await post("api/plan/read", body: body, as: Explanation.self)
    }

    func ask(_ question: String, image: UIImage, sheet: Sheet) async throws -> Answer {
        var body: [String: Any] = ["imageBase64": try planImage(image), "mime": "image/jpeg", "mode": "ask", "question": question, "sheetName": sheet.name]
        if let s = sheet.scaleLabel, sheet.pxPerFt != nil { body["knownScale"] = s }
        return try await post("api/plan/read", body: body, as: Answer.self)
    }

    // MARK: AI scan

    struct ScanResult: Decodable {
        struct Callout: Decodable { let zone: String?; let lf: Double?; let switchLabel: String?; let x: Double; let y: Double; let confidence: Double }
        struct Symbol: Decodable, Identifiable {
            let deviceTypeId: String?; let symbolText: String?; let x: Double; let y: Double; let confidence: Double; let tentative: Bool?
            var id: String { "\(x)-\(y)-\(symbolText ?? "")" }
        }
        let floorName: String?
        let ledCallouts: [Callout]?
        let symbols: [Symbol]?
    }

    func scan(image: UIImage, catalog: [DeviceType], titleOnly: Bool = false) async throws -> ScanResult {
        // Claude vision works best at ≤1568 px on the long side.
        let px = image.pixelSize
        let k = min(1, 1568 / max(px.width, px.height))
        let size = CGSize(width: floor(px.width * k), height: floor(px.height * k))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = small.jpegData(compressionQuality: 0.85) else { throw APIError(message: String(localized: "Couldn't encode the sheet image.")) }
        let cat = catalog.map { ["id": $0.id, "name": $0.name, "symbol": $0.symbol, "category": $0.category.rawValue] }
        return try await post("api/scan", body: ["imageBase64": jpeg.base64EncodedString(), "mime": "image/jpeg", "catalog": cat, "mode": titleOnly ? "title" : "full"], as: ScanResult.self)
    }
}
