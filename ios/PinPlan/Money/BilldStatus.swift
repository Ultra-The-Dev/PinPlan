import Foundation
import PinPlanCore

/// Whether the PinPlan server has Billdu connected for this company (`GET /api/billdu/credentials`, the same call the
/// web app's Settings → Connected apps makes). The Billdu card on the estimate shows only when the server says so.
enum BilldStatus: Equatable {
    /// Not asked yet, or the server couldn't be reached (offline): show nothing new, keep what was known.
    case unknown
    /// Billdu is connected: sending works.
    case configured
    /// The server answered: Billdu isn't connected for this company (or not for this person) — connect it on the web.
    case connectOnWeb
    /// No PinPlan server set in this app.
    case noServer

    static let connectText = String(localized: "Connect Billdu on the web: Settings → Connected apps")
}

extension APIClient {
    /// Ask the server whether Billdu is connected. Sends the cloud sign-in when there is one (team / company keys);
    /// 403 / 404 (office only, or a server without the route) read as "connect it on the web".
    func billduStatus(token: String?) async -> BilldStatus {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/billdu/credentials"))
        if !accessCode.isEmpty { req.setValue(accessCode, forHTTPHeaderField: "x-pinplan-access") }
        // The sign-in only goes to the built-in server or one the person confirmed (APIClient.mayCarrySession).
        if let token, mayCarrySession { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.timeoutInterval = 20
        guard let (data, resp) = try? await URLSession.shared.data(for: req) else { return .unknown }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        return Self.billduStatus(httpStatus: status, body: data)
    }

    /// The answer read: configured only when the server says `configured: true`.
    static func billduStatus(httpStatus: Int, body: Data) -> BilldStatus {
        switch httpStatus {
        case 200..<300:
            let j = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
            return (j?["configured"] as? Bool) == true ? .configured : .connectOnWeb
        case 401, 403, 404, 501: return .connectOnWeb
        default: return .unknown
        }
    }
}
