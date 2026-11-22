import XCTest
@testable import PinPlanCore

/// A dictionary standing in for UserDefaults.
private final class MemoryDefaults: TutorialDefaults {
    var values: [String: Any] = [:]
    func data(forKey key: String) -> Data? { values[key] as? Data }
    func bool(forKey key: String) -> Bool { values[key] as? Bool ?? false }
    func set(_ value: Any?, forKey key: String) { values[key] = value }
}

// The native tutorial (docs/help-and-tours.md, "Help in the iPad / iPhone app"): tours, steps, progress, the card's
// placement, the launch arguments, and that every word is translated and every anchor exists in the app.
final class TutorialTests: XCTestCase {
    private var iosDir: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../PinPlan").standardized
    }

    // MARK: tours

    func testFirstJobMirrorsTheWebTour() {
        let t = Tutorials.firstJob
        XCTAssertEqual(t.audience, .office)
        XCTAssertEqual(t.steps.map(\.id), ["new-job", "upload", "edit", "place", "find-similar", "sensors", "takeoff", "pricing", "quote"])
        XCTAssertEqual(t.steps.first?.place, .jobs)
        XCTAssertEqual(t.steps.first { $0.id == "takeoff" }?.place, .job(.takeoff))
        // Switch to Edit starts in View (so there is something to switch); placing happens in Edit.
        XCTAssertEqual(t.steps.first { $0.id == "edit" }?.planMode, .view)
        XCTAssertEqual(t.steps.first { $0.id == "place" }?.planMode, .edit)
    }

    func testCrewBasicsCoversTheCrewsDay() {
        let t = Tutorials.crewBasics
        XCTAssertEqual(t.audience, .technician)
        XCTAssertEqual(t.steps.map(\.id), ["open-job", "plan", "device", "tasks", "photos", "offline"])
        XCTAssertTrue(t.steps.allSatisfy { !$0.officeOnly }, "the crew sees every step")
        XCTAssertEqual(t.steps.first { $0.id == "plan" }?.planMode, .view, "the crew reads the plan in View")
        XCTAssertNil(t.steps.last?.place, "the offline step stays where the person is")
        XCTAssertTrue(t.steps.last?.anchors.isEmpty ?? false, "and shows as a centred card")
    }

    func testTechniciansDontGetPriceSteps() {
        let office = Tutorials.firstJob.steps(office: true).map(\.id)
        let tech = Tutorials.firstJob.steps(office: false).map(\.id)
        XCTAssertTrue(office.contains("pricing"))
        XCTAssertFalse(tech.contains("pricing"))
        XCTAssertFalse(tech.contains("quote"))
        XCTAssertFalse(Tutorials.firstJob.steps(office: false).contains { $0.place == .job(.money) }, "no Money tab for technicians")
    }

    func testOfferedToursPutTheirOwnFirst() {
        XCTAssertEqual(Tutorials.available(office: true).map(\.id), [.firstJob, .crewBasics])
        XCTAssertEqual(Tutorials.available(office: false).map(\.id), [.crewBasics, .firstJob])
        XCTAssertEqual(Tutorials.suggested(office: true), .firstJob)
        XCTAssertEqual(Tutorials.suggested(office: false), .crewBasics)
    }

    func testIdsAreUniqueAndTextIsShort() {
        for t in Tutorials.all {
            XCTAssertEqual(Set(t.steps.map(\.id)).count, t.steps.count, "\(t.id) step ids")
            XCTAssertGreaterThanOrEqual(t.steps.count, 2)
            for s in t.steps {
                XCTAssertFalse(s.title.isEmpty)
                // Same limit as the web tours (tests/tour.test.ts): one or two short sentences.
                XCTAssertLessThanOrEqual(s.body.count, 170, "\(t.id)/\(s.id) is too long for the card")
                XCTAssertFalse(s.symbol.isEmpty)
            }
        }
        XCTAssertEqual(Set(Tutorials.welcome.map(\.id)).count, Tutorials.welcome.count)
        XCTAssertGreaterThanOrEqual(Tutorials.welcome.count, 3)
    }

    func testAnchorsDifferPerSizeClass() {
        let place = Tutorials.firstJob.steps.first { $0.id == "place" }!
        XCTAssertEqual(place.anchors(for: .regular), ["plan-palette", "plan-devices"])
        XCTAssertEqual(place.anchors(for: .compact), ["plan-devices"])
        let tasks = Tutorials.crewBasics.steps.first { $0.id == "tasks" }!
        XCTAssertEqual(tasks.anchors(for: .compact), ["tasks-list"], "iPhone's bottom tab bar can't be pointed at")
        let edit = Tutorials.firstJob.steps.first { $0.id == "edit" }!
        XCTAssertEqual(edit.anchors(for: .compact), edit.anchors(for: .regular))
    }

    // MARK: progress

    func testStartNextBackFinish() {
        var p = TutorialPrefs()
        XCTAssertTrue(p.showsFirstRunPrompt)
        p = TutorialLogic.reduce(p, .start(.crewBasics, step: nil), office: true)
        XCTAssertEqual(p.active, TutorialRun(id: .crewBasics, step: 0))
        XCTAssertTrue(p.welcomeSeen, "starting a tour answers the first-run prompt")
        XCTAssertFalse(p.showsFirstRunPrompt)
        p = TutorialLogic.reduce(p, .back, office: true)
        XCTAssertEqual(p.active?.step, 0, "Back stops at the first step")
        p = TutorialLogic.reduce(p, .next, office: true)
        p = TutorialLogic.reduce(p, .next, office: true)
        XCTAssertEqual(p.active?.step, 2)
        p = TutorialLogic.reduce(p, .back, office: true)
        XCTAssertEqual(p.active?.step, 1)
        p = TutorialLogic.reduce(p, .go(99), office: true)
        XCTAssertEqual(p.active?.step, Tutorials.crewBasics.steps.count - 1)
        p = TutorialLogic.reduce(p, .next, office: true)
        XCTAssertNil(p.active, "Next on the last step finishes")
        XCTAssertEqual(p.done, [.crewBasics])
        XCTAssertEqual(TutorialLogic.button(.crewBasics, prefs: p, office: true), .again)
    }

    func testTechnicianCountIsShorter() {
        var p = TutorialLogic.reduce(TutorialPrefs(), .start(.firstJob, step: 99), office: false)
        XCTAssertEqual(p.active?.step, Tutorials.firstJob.steps(office: false).count - 1)
        p = TutorialLogic.reduce(p, .next, office: false)
        XCTAssertEqual(p.done, [.firstJob])
    }

    func testCloseResumesSkipRemembers() {
        var p = TutorialLogic.reduce(TutorialPrefs(), .start(.firstJob, step: 3), office: true)
        p = TutorialLogic.reduce(p, .close, office: true)
        XCTAssertNil(p.active)
        XCTAssertEqual(TutorialLogic.button(.firstJob, prefs: p, office: true), .resume(step: 4, total: 9))
        p = TutorialLogic.reduce(p, .start(.firstJob, step: nil), office: true)
        XCTAssertEqual(p.active?.step, 3, "Start without a step resumes")
        p = TutorialLogic.reduce(p, .skip, office: true)
        XCTAssertNil(p.active)
        XCTAssertEqual(p.skipped, [.firstJob])
        XCTAssertEqual(p.paused, [:])
        XCTAssertEqual(TutorialLogic.button(.firstJob, prefs: p, office: true), .again)
        // Taking it again from the top after a skip.
        p = TutorialLogic.reduce(p, .start(.firstJob, step: nil), office: true)
        XCTAssertEqual(p.active?.step, 0)
        p = TutorialLogic.reduce(p, .go(8), office: true)
        p = TutorialLogic.reduce(p, .next, office: true)
        XCTAssertEqual(p.done, [.firstJob])
        XCTAssertEqual(p.skipped, [], "finishing clears an earlier skip")
    }

    func testDontShowAgainAndReset() {
        var p = TutorialLogic.reduce(TutorialPrefs(), .start(.firstJob, step: nil), office: true)
        p = TutorialLogic.reduce(p, .dontShowAgain, office: true)
        XCTAssertNil(p.active)
        XCTAssertTrue(p.offersOff)
        XCTAssertFalse(p.showsFirstRunPrompt)
        XCTAssertEqual(p.skipped, [.firstJob])
        p = TutorialLogic.reduce(p, .reset, office: true)
        XCTAssertEqual(p, TutorialPrefs())
        XCTAssertTrue(p.showsFirstRunPrompt, "Show tours and tips again brings the prompt back")
        p = TutorialLogic.reduce(p, .answerWelcome, office: true)
        XCTAssertFalse(p.showsFirstRunPrompt)
        XCTAssertNil(p.active)
    }

    func testActionsWithoutATourChangeNothing() {
        let p = TutorialPrefs()
        for a: TutorialAction in [.next, .back, .go(2), .skip, .close] {
            XCTAssertEqual(TutorialLogic.reduce(p, a, office: true), p, "\(a)")
        }
    }

    // MARK: storage

    func testSavedAndLoaded() {
        let d = MemoryDefaults()
        XCTAssertEqual(TutorialStore.load(d), TutorialPrefs())
        var p = TutorialLogic.reduce(TutorialPrefs(), .start(.crewBasics, step: 2), office: true)
        TutorialStore.save(p, d)
        XCTAssertNotNil(d.values[TutorialKeys.prefs] as? Data)
        XCTAssertEqual(d.values[TutorialKeys.legacyTipSeen] as? Bool, true)
        let loaded = TutorialStore.load(d)
        XCTAssertNil(loaded.active, "a tour that was on screen at quit is not reopened")
        XCTAssertEqual(loaded.paused["crew-basics"], 2, "it's offered as Resume")
        p = TutorialLogic.reduce(loaded, .dontShowAgain, office: true)
        TutorialStore.save(p, d)
        XCTAssertTrue(TutorialStore.load(d).offersOff)
        XCTAssertEqual(TutorialKeys.prefs, "pinplan.tutorial.prefs")
    }

    func testEarlierHelpTipCountsAsAnswered() {
        let d = MemoryDefaults()
        d.set(true, forKey: "pinplan.help.tipSeen")
        XCTAssertFalse(TutorialStore.load(d).showsFirstRunPrompt, "people who closed the old Help tip aren't asked again")
    }

    func testResetSurvivesARelaunch() {
        let d = MemoryDefaults()
        d.set(true, forKey: "pinplan.help.tipSeen")
        var p = TutorialLogic.reduce(TutorialStore.load(d), .start(.firstJob, step: nil), office: true)
        p = TutorialLogic.reduce(p, .skip, office: true)
        TutorialStore.save(p, d)
        XCTAssertFalse(TutorialStore.load(d).showsFirstRunPrompt)
        TutorialStore.save(TutorialLogic.reduce(TutorialStore.load(d), .reset, office: true), d)
        XCTAssertTrue(TutorialStore.load(d).showsFirstRunPrompt, "Reset tutorials brings the prompt back after a relaunch")
    }

    func testBadSavedDataStartsFresh() {
        let d = MemoryDefaults()
        d.set(Data("not json".utf8), forKey: TutorialKeys.prefs)
        XCTAssertEqual(TutorialStore.load(d), TutorialPrefs())
    }

    // MARK: card placement

    private let phone = TutorialRect(x: 0, y: 47, width: 390, height: 763)
    private let pad = TutorialRect(x: 0, y: 24, width: 1024, height: 1342)

    func testNoTargetIsCentred() {
        let r = TutorialLayout.place(card: (360, 200), spotlight: nil, container: pad, size: .regular)
        XCTAssertEqual(r.side, .centered)
        XCTAssertEqual(r.frame.midX, pad.midX, accuracy: 0.01)
        XCTAssertEqual(r.frame.midY, pad.midY, accuracy: 0.01)
        let c = TutorialLayout.place(card: (366, 220), spotlight: nil, container: phone, size: .compact)
        XCTAssertEqual(c.side, .centered)
    }

    func testPhoneCardAvoidsTheTarget() {
        let top = TutorialRect(x: 300, y: 60, width: 80, height: 44)
        let a = TutorialLayout.place(card: (366, 220), spotlight: top, container: phone, size: .compact)
        XCTAssertEqual(a.side, .bottom)
        XCTAssertFalse(a.frame.intersects(top))
        let low = TutorialRect(x: 20, y: 700, width: 80, height: 44)
        let b = TutorialLayout.place(card: (366, 220), spotlight: low, container: phone, size: .compact)
        XCTAssertEqual(b.side, .top)
        XCTAssertFalse(b.frame.intersects(low))
    }

    func testPadCardBesideTheTargetInsideTheScreen() {
        let button = TutorialRect(x: 980, y: 40, width: 40, height: 40)
        let r = TutorialLayout.place(card: (380, 220), spotlight: button, container: pad, size: .regular)
        XCTAssertEqual(r.side, .below)
        XCTAssertLessThanOrEqual(r.frame.maxX, pad.maxX - 12 + 0.01, "kept inside the screen")
        XCTAssertGreaterThanOrEqual(r.frame.y, button.maxY)
        let bottom = TutorialRect(x: 400, y: 1300, width: 200, height: 44)
        XCTAssertEqual(TutorialLayout.place(card: (380, 220), spotlight: bottom, container: pad, size: .regular).side, .above)
        // A target filling the screen (the plan): the card goes along the bottom.
        let canvas = TutorialRect(x: 0, y: 24, width: 1024, height: 1342)
        XCTAssertEqual(TutorialLayout.place(card: (380, 220), spotlight: canvas, container: pad, size: .regular).side, .bottom)
    }

    func testPadLandscapeSideways() {
        let land = TutorialRect(x: 0, y: 24, width: 1366, height: 1000)
        let tall = TutorialRect(x: 0, y: 80, width: 290, height: 900)
        let r = TutorialLayout.place(card: (380, 220), spotlight: tall, container: land, size: .regular)
        XCTAssertEqual(r.side, .trailing)
        XCTAssertFalse(r.frame.intersects(tall))
    }

    func testSpotlightAndWidth() {
        XCTAssertNil(TutorialLayout.spotlight(nil, container: phone))
        XCTAssertNil(TutorialLayout.spotlight(TutorialRect(x: -200, y: 0, width: 50, height: 50), container: phone), "off screen")
        XCTAssertNil(TutorialLayout.spotlight(TutorialRect(x: 10, y: 100, width: 0, height: 50), container: phone))
        let s = TutorialLayout.spotlight(TutorialRect(x: 2, y: 100, width: 50, height: 44), container: phone)!
        XCTAssertEqual(s.x, 0)
        XCTAssertEqual(s.width, 58)
        XCTAssertEqual(TutorialLayout.cardWidth(container: phone, size: .compact), 366)
        XCTAssertEqual(TutorialLayout.cardWidth(container: TutorialRect(x: 0, y: 0, width: 844, height: 390), size: .compact), 520)
        XCTAssertEqual(TutorialLayout.cardWidth(container: pad, size: .regular), 380)
    }

    // MARK: launch arguments

    func testLaunchArguments() {
        XCTAssertNil(TutorialLaunch.parse(["--demo", "--tab", "plan"]))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial"]), .welcome(page: 0))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial", "--no-tips"]), .welcome(page: 0))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial", "welcome", "--tutorial-step=3"]), .welcome(page: 2))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial", "welcome", "--tutorial-step=9"]), .welcome(page: 2))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial", "first-job"]), .tour(.firstJob, step: 0))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial=crew-basics", "--tutorial-step=4"]), .tour(.crewBasics, step: 3))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial-step", "2", "--tutorial", "first-job"]), .tour(.firstJob, step: 1))
        XCTAssertEqual(TutorialLaunch.parse(["--tutorial", "first-job", "--tutorial-step=0"]), .tour(.firstJob, step: 0))
        XCTAssertNil(TutorialLaunch.parse(["--tutorial", "nope"]))
    }

    // MARK: the app's files

    /// Every word the tutorial shows from data is in Localizable.xcstrings, translated into every language the
    /// app ships (the app shows them with tr()).
    func testEveryStringIsTranslated() throws {
        let url = iosDir.appendingPathComponent("Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        let langs = ["es", "pl", "pt-BR", "ru", "uk", "vi", "zh-Hans"]
        for key in Tutorials.allStrings {
            guard let entry = strings[key] as? [String: Any], let locs = entry["localizations"] as? [String: Any] else {
                XCTFail("missing from Localizable.xcstrings: \(key)")
                continue
            }
            for lang in langs {
                let unit = (locs[lang] as? [String: Any])?["stringUnit"] as? [String: Any]
                XCTAssertEqual(unit?["state"] as? String, "translated", "\(lang): \(key)")
                XCTAssertFalse((unit?["value"] as? String ?? "").isEmpty, "\(lang): \(key)")
            }
        }
    }

    /// Every anchor a step points at is marked somewhere in the app (`.tutorialAnchor("id")`), and every marked
    /// anchor is one a step uses.
    func testEveryAnchorExistsInTheApp() throws {
        var found = Set<String>()
        let pattern = try NSRegularExpression(pattern: #"\.tutorialAnchor\("([a-z0-9-]+)""#)
        let files = FileManager.default.enumerator(at: iosDir, includingPropertiesForKeys: nil)
        while let f = files?.nextObject() as? URL {
            guard f.pathExtension == "swift", let text = try? String(contentsOf: f, encoding: .utf8) else { continue }
            // Code only: comments may show the modifier as an example.
            for line in text.split(separator: "\n") where !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") {
                let s = String(line)
                for m in pattern.matches(in: s, range: NSRange(s.startIndex..., in: s)) {
                    if let r = Range(m.range(at: 1), in: s) { found.insert(String(s[r])) }
                }
            }
        }
        XCTAssertFalse(found.isEmpty, "no anchors found under \(iosDir.path)")
        for a in Tutorials.allAnchors { XCTAssertTrue(found.contains(a), "no .tutorialAnchor(\"\(a)\") in the app") }
        for a in found { XCTAssertTrue(Tutorials.allAnchors.contains(a), "\(a) is marked but no step uses it") }
    }
}
