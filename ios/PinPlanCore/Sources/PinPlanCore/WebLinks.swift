import Foundation

/// Paths of the Northpin web app pages the iPad/iPhone app opens in Safari (joined to the server with
/// `BillingLogic.webURL`). Mirrors docs/navigation.md: `/` is the public home page and the app's jobs list is `/jobs`;
/// a job is `/project?id=…&tab=…` with the five tabs and their sub-views (`src/lib/tabRoutes.ts`). Old tab ids
/// (`billing`, `changes`, `estimate`…) still redirect on the web, but links from the app use the current ones.
public enum WebLinks {
    /// The web app's jobs list. Never "" or "/": that is the marketing home page now.
    public static let jobs = "jobs"

    /// The five job tabs (`JOB_TABS` in src/lib/tabRoutes.ts).
    public enum Tab: String, CaseIterable, Sendable { case overview, plan, takeoff, money, field }

    /// `project?id=<id>&tab=<tab>&<params…>`, the id percent-encoded.
    public static func job(_ id: String, tab: Tab, _ params: [(String, String)] = []) -> String {
        var q = [("id", id), ("tab", tab.rawValue)] + params
        q = q.map { ($0.0, encode($0.1)) }
        return "project?" + q.map { "\($0.0)=\($0.1)" }.joined(separator: "&")
    }

    /// Money › Quote (quotes and invoices start from the approved quote).
    public static func quotes(job id: String) -> String { job(id, tab: .money, [("step", "quote")]) }
    /// Money › Invoices.
    public static func invoices(job id: String) -> String { job(id, tab: .money, [("step", "invoices")]) }
    /// Money › Change orders.
    public static func changeOrders(job id: String) -> String { job(id, tab: .money, [("step", "changes")]) }
    /// Field › RFIs.
    public static func rfis(job id: String) -> String { job(id, tab: .field, [("section", "rfis")]) }
    /// Field › Schedule.
    public static func schedule(job id: String) -> String { job(id, tab: .field, [("section", "schedule")]) }

    /// The Help center: short guides and tours (`/help`, public, works offline on the web; docs/help-and-tours.md).
    public static let help = "help"
    /// One guide: `help/<id>` (ids are `GUIDES` in src/lib/help/guides.ts, e.g. "crew", "offline-sync").
    public static func helpGuide(_ id: String) -> String { help + "/" + encode(id) }
    /// Help on the public site, for a copy of the app that isn't connected to a server.
    public static let publicHelpURL = "https://northpin.app/help"
    /// Where "Help & tutorials" goes: Help on the app's own server, else the public site's.
    public static func helpURL(origin: String, guide: String? = nil) -> String {
        if let s = BillingLogic.webURL(origin: origin, path: guide.map { helpGuide($0) } ?? help) { return s }
        guard let guide else { return publicHelpURL }
        return publicHelpURL + "/" + encode(guide)
    }

    private static let allowed: CharacterSet = {
        var s = CharacterSet.alphanumerics
        s.insert(charactersIn: "-._~")
        return s
    }()

    private static func encode(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s }
}
