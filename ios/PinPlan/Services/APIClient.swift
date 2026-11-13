import Foundation
import UIKit
import PinPlanCore

/// Talks to the hosted PinPlan server (the web app's API) for Billdu and AI scan.
/// Billdu credentials and the Anthropic key live only on that server.
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
        var errorDescription: String? { message }
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any], as: T.Type) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !accessCode.isEmpty { req.setValue(accessCode, forHTTPHeaderField: "x-pinplan-access") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 300
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(message: msg ?? "Server returned \(status)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: Connection check

    /// What the server reports about itself; feature flags only arrive once the access code is accepted.
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
        if !accessCode.isEmpty { req.setValue(accessCode, forHTTPHeaderField: "x-pinplan-access") }
        req.timeoutInterval = 20
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status), let h = try? JSONDecoder().decode(Health.self, from: data), h.app == "pinplan" else {
            throw APIError(message: status == 404 ? "That address isn't a PinPlan server (or it needs the latest version deployed)." : "The server answered \(status). Check the address.")
        }
        return h
    }

    // MARK: Billdu

    struct SendResult: Decodable {
        struct Doc: Decodable { let id: Int; let type: String; let serial: String?; let amount: Double; let percent: Double? }
        let clientId: Int
        let doc: Doc
    }

    func sendToBilldu(project: Project, docType: String, estimate: Estimate, pricing: PricingSettings, depositPct: Double?, existingDocId: Int?) async throws -> SendResult {
        let lines = try JSONSerialization.jsonObject(with: JSONEncoder().encode(estimate.lines))
        var p: [String: Any] = ["id": project.id, "clientName": project.clientName, "address": project.address]
        if let v = project.clientEmail { p["clientEmail"] = v }
        if let v = project.clientPhone { p["clientPhone"] = v }
        if let v = project.billduClientId { p["billduClientId"] = v }
        var body: [String: Any] = ["project": p, "docType": docType, "lines": lines, "taxPct": pricing.taxPct, "currency": pricing.currency]
        if let depositPct { body["depositPct"] = depositPct }
        if let existingDocId { body["existingDocId"] = existingDocId }
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
        guard let jpeg = small.jpegData(compressionQuality: 0.88) else { throw APIError(message: "Couldn't encode the sheet image.") }
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
        guard let jpeg = small.jpegData(compressionQuality: 0.85) else { throw APIError(message: "Couldn't encode the sheet image.") }
        let cat = catalog.map { ["id": $0.id, "name": $0.name, "symbol": $0.symbol, "category": $0.category.rawValue] }
        return try await post("api/scan", body: ["imageBase64": jpeg.base64EncodedString(), "mime": "image/jpeg", "catalog": cat, "mode": titleOnly ? "title" : "full"], as: ScanResult.self)
    }
}
