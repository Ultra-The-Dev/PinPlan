import XCTest
@testable import PinPlanCore

// Links from the app to web pages (docs/navigation.md): the jobs list is /jobs (/ is the public home page), and job
// links use the current tabs (Money / Field with their sub-views), not the old ids the web only redirects.
final class WebLinksTests: XCTestCase {
    func testJobsListIsNotTheHomePage() {
        XCTAssertEqual(WebLinks.jobs, "jobs")
        XCTAssertEqual(BillingLogic.webURL(origin: "https://example.test/", path: WebLinks.jobs), "https://example.test/jobs")
    }

    func testJobLinksUseCurrentTabs() {
        XCTAssertEqual(WebLinks.quotes(job: "j1"), "project?id=j1&tab=money&step=quote")
        XCTAssertEqual(WebLinks.invoices(job: "j1"), "project?id=j1&tab=money&step=invoices")
        XCTAssertEqual(WebLinks.changeOrders(job: "j1"), "project?id=j1&tab=money&step=changes")
        XCTAssertEqual(WebLinks.rfis(job: "j1"), "project?id=j1&tab=field&section=rfis")
        XCTAssertEqual(WebLinks.schedule(job: "j1"), "project?id=j1&tab=field&section=schedule")
        XCTAssertEqual(WebLinks.job("a b&c", tab: .plan), "project?id=a%20b%26c&tab=plan")
        // Tasks and Photos are tabs of their own (not Field sections any more).
        XCTAssertEqual(WebLinks.tasks(job: "j1"), "project?id=j1&tab=tasks")
        XCTAssertEqual(WebLinks.tasks(job: "j1", task: "t1"), "project?id=j1&tab=tasks&task=t1")
        XCTAssertEqual(WebLinks.photos(job: "j1"), "project?id=j1&tab=photos")
        XCTAssertEqual(WebLinks.photos(job: "j1", device: "m 1"), "project?id=j1&tab=photos&device=m%201")
        XCTAssertEqual(WebLinks.Tab.allCases.map(\.rawValue), ["overview", "plan", "takeoff", "tasks", "photos", "money", "field"])
        // Every tab id is one the app's own router knows too.
        for t in WebLinks.Tab.allCases { XCTAssertNotNil(ProjectTabRoute.resolve(t.rawValue)) }
    }

    // "Help & tutorials" opens /help on the app's server; a copy that isn't connected opens the public site's Help.
    func testHelpOpensOnTheServerElseThePublicSite() {
        XCTAssertEqual(WebLinks.help, "help")
        XCTAssertEqual(WebLinks.helpGuide("crew"), "help/crew")
        XCTAssertEqual(WebLinks.helpGuide("a b"), "help/a%20b")
        XCTAssertEqual(WebLinks.helpURL(origin: "https://example.test/"), "https://example.test/help")
        XCTAssertEqual(WebLinks.helpURL(origin: "example.test", guide: "offline-sync"), "https://example.test/help/offline-sync")
        XCTAssertEqual(WebLinks.helpURL(origin: "  "), WebLinks.publicHelpURL)
        XCTAssertEqual(WebLinks.helpURL(origin: "", guide: "crew"), WebLinks.publicHelpURL + "/crew")
        XCTAssertTrue(WebLinks.publicHelpURL.hasPrefix("https://"))
    }
}
