import XCTest

// Layout screenshots of the field-crew screens on any simulator (.github/workflows/ios-sim-screens.yml, suite
// "layouts"): jobs list, plan (View), plan (Edit, with the device palette), takeoff, a checklist, photos, daily logs
// and settings — each in portrait and in landscape — so layouts can be reviewed on an iPhone SE, a standard iPhone
// and an iPad side by side, in a long language (pl) and in Dark Mode.
//
// The Debug app runs on its demo job (`--demo`, local data only: no server, no sign-in, no secrets). The workflow
// picks the device, the language (SHOT_LANG) and the appearance (`simctl ui … appearance`, named by SHOT_STYLE);
// SHOT_DEVICE names the device in the file names. Each screen is kept as a test attachment and, when SHOT_DIR is
// set, written there as PNG: `<lang>[-dark]-<device>-<nn>-<screen>-<portrait|landscape>.png`.
// Misses are recorded but never stop the run: the screenshots are the point.
final class LayoutScreens: XCTestCase {
    private var env: [String: String] { ProcessInfo.processInfo.environment }
    private var lang: String { env["SHOT_LANG"].flatMap { $0.isEmpty ? nil : $0 } ?? "en" }
    private var style: String { env["SHOT_STYLE"] == "dark" ? "-dark" : "" }
    private var device: String {
        let raw = env["SHOT_DEVICE"].flatMap { $0.isEmpty ? nil : $0 } ?? "simulator"
        return raw.lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
    }

    override func setUp() {
        continueAfterFailure = true
    }

    private func launch(_ args: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        let locale = lang == "en" ? "en_US" : lang.replacingOccurrences(of: "-", with: "_")
        app.launchArguments = ["--no-tips"] + args + ["-AppleLanguages", "(\(lang))", "-AppleLocale", locale]
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func shot(_ name: String, _ app: XCUIApplication) {
        // Let animations, sheets and the plan's tiles settle.
        Thread.sleep(forTimeInterval: 2.5)
        let s = XCUIScreen.main.screenshot()
        let file = "\(lang)\(style)-\(device)-\(name)"
        let a = XCTAttachment(screenshot: s)
        a.name = file
        a.lifetime = .keepAlways
        add(a)
        if let dir = env["SHOT_DIR"], !dir.isEmpty {
            let url = URL(fileURLWithPath: dir, isDirectory: true)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? s.pngRepresentation.write(to: url.appendingPathComponent("\(file).png"))
        }
    }

    /// The screen in portrait, then turned to landscape (and back to portrait for the next test).
    private func bothOrientations(_ name: String, _ app: XCUIApplication) {
        XCUIDevice.shared.orientation = .portrait
        shot("\(name)-portrait", app)
        XCUIDevice.shared.orientation = .landscapeLeft
        shot("\(name)-landscape", app)
        XCUIDevice.shared.orientation = .portrait
    }

    /// Waits for the app to show something with this identifier or label; records a miss without stopping.
    @discardableResult
    private func wait(_ app: XCUIApplication, for id: String, _ seconds: TimeInterval = 40) -> Bool {
        let found = element(app, id).waitForExistence(timeout: seconds)
        if !found { XCTFail("\(id) didn't appear (\(lang)\(style), \(device))") }
        return found
    }

    func test01JobsList() {
        let app = launch(["--demo-list"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 40)
        // The demo job is drawn on first launch: give it time to appear on the list.
        Thread.sleep(forTimeInterval: 4)
        bothOrientations("01-jobs", app)
    }

    func test02PlanEditWithPalette() {
        let app = launch(["--demo", "--tab", "plan"])
        wait(app, for: "plan-tools", 60)
        // iPad: the palette is the left panel in Edit mode. iPhone: it opens as a sheet from Devices.
        let devices = element(app, "plan-devices")
        if devices.waitForExistence(timeout: 5) { devices.tap() }
        bothOrientations("02-plan-edit", app)
    }

    func test03PlanView() {
        let app = launch(["--demo", "--tab", "plan", "--view-mode"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 60)
        Thread.sleep(forTimeInterval: 3)
        bothOrientations("03-plan-view", app)
    }

    func test04Takeoff() {
        let app = launch(["--demo", "--tab", "takeoff"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 60)
        bothOrientations("04-takeoff", app)
    }

    func test05Checklist() {
        let app = launch(["--demo", "--tab", "field", "--checklist"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 60)
        bothOrientations("05-checklist", app)
    }

    func test06Photos() {
        let app = launch(["--demo", "--tab", "photos"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 60)
        bothOrientations("06-photos", app)
    }

    func test07DailyLogs() {
        let app = launch(["--demo", "--tab", "field", "--field", "logs"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 60)
        bothOrientations("07-daily-logs", app)
    }

    func test08Settings() {
        let app = launch(["--demo-list", "--settings"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 40)
        Thread.sleep(forTimeInterval: 2)
        bothOrientations("08-settings", app)
    }
}
