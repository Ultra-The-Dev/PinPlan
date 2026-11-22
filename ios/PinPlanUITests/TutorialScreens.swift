import XCTest

// Screenshots of the native tutorial on any simulator (.github/workflows/ios-sim-screens.yml, suite "tutorial"): the
// welcome walkthrough page by page, then every step of "Your first job" and "Crew basics" (the card, the spotlight
// on the real control, or the centred card when the control isn't on screen), plus one step in landscape.
//
// The Debug app runs on its demo job (the tours open it themselves; local data only: no server, no sign-in, no
// secrets). `--tutorial <id>` starts a tour, `--tutorial-step=N` at step N (TutorialLaunch in PinPlanCore). The
// workflow picks the device and the language (SHOT_LANG); SHOT_DEVICE names the device in the file names. Each
// screen is kept as a test attachment and, when SHOT_DIR is set, written there as PNG:
// `<lang>-<device>-tutorial-<nn>-<name>.png`. Misses are recorded but never stop the run: the screenshots are the point.
final class TutorialScreens: XCTestCase {
    private var env: [String: String] { ProcessInfo.processInfo.environment }
    private var lang: String { env["SHOT_LANG"].flatMap { $0.isEmpty ? nil : $0 } ?? "en" }
    private var device: String {
        let raw = env["SHOT_DEVICE"].flatMap { $0.isEmpty ? nil : $0 } ?? "simulator"
        return raw.lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
    }

    override func setUp() {
        continueAfterFailure = true
        XCUIDevice.shared.orientation = .portrait
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

    @discardableResult
    private func wait(_ app: XCUIApplication, _ id: String, _ seconds: TimeInterval = 60) -> Bool {
        let found = element(app, id).waitForExistence(timeout: seconds)
        if !found { XCTFail("\(id) didn't appear (\(lang), \(device))") }
        return found
    }

    private func shot(_ name: String, _ app: XCUIApplication) {
        // Let the card move to its control and the plan's tiles settle.
        Thread.sleep(forTimeInterval: 2)
        let s = XCUIScreen.main.screenshot()
        let file = "\(lang)-\(device)-tutorial-\(name)"
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

    /// Every step of a tour: a shot, then Next, until the card goes (the last Next is Done).
    private func walk(_ tour: String, prefix: String) {
        let app = launch(["--tutorial", tour])
        // The first launch draws the demo job: give it time.
        guard wait(app, "tutorial-card", 120) else { return }
        var step = 1
        while step <= 15 && element(app, "tutorial-card").exists {
            shot(String(format: "%@-%02d", prefix, step), app)
            let next = element(app, "tutorial-next")
            guard next.exists else { XCTFail("no Next on step \(step) of \(tour)"); return }
            next.tap()
            step += 1
            // The next step may open another section of the demo job.
            _ = element(app, "tutorial-card").waitForExistence(timeout: 10)
        }
        shot("\(prefix)-end", app)
    }

    func test01Welcome() {
        let app = launch(["--demo-list", "--tutorial", "welcome"])
        guard wait(app, "welcome-next") else { return }
        shot("00-welcome-1", app)
        element(app, "welcome-next").tap()
        shot("00-welcome-2", app)
        if element(app, "welcome-next").exists { element(app, "welcome-next").tap() }
        wait(app, "welcome-start", 10)
        shot("00-welcome-3", app)
    }

    /// The jobs list's first-run prompt (a fresh install shows it once).
    func test02FirstRunPrompt() {
        let app = launch(["--demo-list"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 40)
        Thread.sleep(forTimeInterval: 3)
        if wait(app, "tutorial-banner", 20) { shot("00-prompt", app) }
    }

    func test03FirstJob() {
        walk("first-job", prefix: "first-job")
    }

    func test04CrewBasics() {
        walk("crew-basics", prefix: "crew")
    }

    /// Straight to a step (`--tutorial-step=N`): placing devices, in portrait and landscape.
    func test05StepInLandscape() {
        let app = launch(["--tutorial", "first-job", "--tutorial-step=4"])
        guard wait(app, "tutorial-card", 120) else { return }
        shot("first-job-04-direct-portrait", app)
        XCUIDevice.shared.orientation = .landscapeLeft
        shot("first-job-04-direct-landscape", app)
        XCUIDevice.shared.orientation = .portrait
    }

    /// Tutorials, the replay list (More › Help & tutorials on the jobs list).
    func test06TutorialsList() {
        let app = launch(["--demo-list"])
        _ = app.navigationBars.firstMatch.waitForExistence(timeout: 40)
        let more = element(app, "jobs-more")
        guard more.waitForExistence(timeout: 20) else { XCTFail("no More menu (\(lang))"); return }
        more.tap()
        let help = element(app, "jobs-help")
        if help.waitForExistence(timeout: 5) { help.tap() } else { XCTFail("no Help & tutorials in More (\(lang))") }
        if wait(app, "tutorial-start-first-job", 20) { shot("00-list", app) }
    }
}
