import XCTest

// Screenshots of Find similar on an iPad simulator (.github/workflows/ios-sim-screens.yml). Launches the Debug app on
// the demo job (`--demo --tab plan`, local data only, no server or sign-in) and opens the tool, in the language given
// by SHOT_LANG (en, es…). Each screen is kept as a test attachment and, when SHOT_DIR is set, written there as PNG.
// The tests check that each screen appears, but never stop on a miss: the screenshots are the point.
final class FindSimilarScreens: XCTestCase {
    private var lang: String { ProcessInfo.processInfo.environment["SHOT_LANG"] ?? "en" }

    override func setUp() {
        continueAfterFailure = true
    }

    private func launch(_ args: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        let locale = lang == "en" ? "en_US" : lang.replacingOccurrences(of: "-", with: "_")
        app.launchArguments = ["--no-tips", "--demo", "--tab", "plan"] + args + ["-AppleLanguages", "(\(lang))", "-AppleLocale", locale]
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    @discardableResult
    private func wait(_ app: XCUIApplication, _ id: String, _ seconds: TimeInterval = 30) -> Bool {
        let found = element(app, id).waitForExistence(timeout: seconds)
        if !found { XCTFail("\(id) didn't appear (\(lang))") }
        return found
    }

    private func shot(_ name: String, _ app: XCUIApplication) {
        // Let animations and the plan's tiles settle.
        Thread.sleep(forTimeInterval: 2)
        let s = XCUIScreen.main.screenshot()
        let a = XCTAttachment(screenshot: s)
        a.name = "\(lang)-\(name)"
        a.lifetime = .keepAlways
        add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty {
            let url = URL(fileURLWithPath: dir, isDirectory: true)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? s.pngRepresentation.write(to: url.appendingPathComponent("\(lang)-\(name).png"))
        }
    }

    /// The real path: plan → Tools → Find similar.
    func test01OpenFromToolsMenu() {
        let app = launch([])
        let tools = element(app, "plan-tools")
        if tools.waitForExistence(timeout: 40) {
            tools.tap()
            let item = element(app, "find-similar-menu")
            if item.waitForExistence(timeout: 10) { item.tap() } else { XCTFail("no Find similar in Tools (\(lang))") }
        } else {
            XCTFail("no Tools menu (\(lang))")
        }
        wait(app, "find-similar")
        shot("01-open", app)
    }

    /// Match a symbol: a box around one of the demo's door swings; ghosts on the plan, the result card.
    func test02MatchASymbol() {
        let app = launch(["--find-similar", "match"])
        wait(app, "find-count", 60)
        shot("02-match", app)
        let slider = element(app, "find-sensitivity")
        if slider.exists {
            slider.adjust(toNormalizedSliderPosition: 0.9)
            shot("03-match-more", app)
        }
    }

    /// Review one by one: zoomed to the first find, Keep / Reject.
    func test03ReviewOneByOne() {
        let app = launch(["--find-similar", "review"])
        wait(app, "find-review-bar", 60)
        shot("04-review", app)
        let reject = element(app, "find-reject")
        if reject.exists {
            reject.tap()
            shot("05-review-rejected", app)
        }
    }

    /// Read tags: the demo's door tags (D1, D2, D3) from the plan's PDF text.
    func test04ReadTags() {
        let app = launch(["--find-similar", "tags"])
        wait(app, "find-count", 60)
        shot("06-tags", app)
    }

    /// Accept all: the finds become devices (one undo step) and the floor count goes up.
    func test05AcceptAll() {
        let app = launch(["--find-similar", "tags"])
        guard wait(app, "find-accept-all", 60) else { return }
        element(app, "find-accept-all").tap()
        shot("07-accepted", app)
    }
}
