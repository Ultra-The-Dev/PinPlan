import Foundation

/// When the iPhone/iPad app offers a newer TestFlight build (docs/testflight.md). The server's /api/ios/latest says
/// the newest build number; the app compares it with its own CFBundleVersion.
public enum AppUpdateLogic {
    /// How often the app asks the server.
    public static let checkEvery: TimeInterval = 6 * 3600

    /// The build to offer, or nil: only a newer build than this one, not one the person already dismissed, and only
    /// when updating is possible from here (the app came from TestFlight).
    public static func offer(current: Int, latest: Int?, dismissed: Int, eligible: Bool) -> Int? {
        guard eligible, let latest, latest > current, latest > dismissed else { return nil }
        return latest
    }

    /// Whether it's time to ask the server again.
    public static func shouldCheck(last: Date?, now: Date, every: TimeInterval = checkEvery) -> Bool {
        guard let last else { return true }
        return now.timeIntervalSince(last) >= every || now < last
    }

    /// The build number in the server's answer (`{"build": 42}`; null or anything else is nil).
    public static func parse(_ data: Data) -> Int? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let n = obj["build"] as? Int, n > 0 { return n }
        return nil
    }
}
