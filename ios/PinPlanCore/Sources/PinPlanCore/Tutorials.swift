import Foundation

// The native, offline tutorial of the iPad / iPhone app: a short welcome walkthrough and guided tours with coach marks
// that point at the real controls (docs/help-and-tours.md, "Help in the iPad / iPhone app"). This file is the pure
// part: the tours and their steps, who sees which step, what a tap on Next / Back / Skip does, where the card goes,
// what is remembered in UserDefaults and the screenshot launch arguments. The app draws it (ios/PinPlan/Tutorial).
//
// Words: the web tours' English text (src/lib/tour/tours.ts) wherever it fits the app's screens, so the web
// translations are reused; the rest is written for the app. Every string here is an English key of
// ios/PinPlan/Localizable.xcstrings (shown with `tr()`); TutorialTests checks every one is translated.

/// Who a tour is written for. The office sees every step; technicians don't get the steps about prices.
public enum TutorialAudience: String, Codable, Sendable {
    case office, technician
}

/// A tour's id, also used in the launch arguments (`--tutorial first-job`) and in the saved progress.
public enum TutorialID: String, Codable, CaseIterable, Sendable {
    case firstJob = "first-job"
    case crewBasics = "crew-basics"
}

/// Where a step happens. The app goes there when the step opens (once: if the person wanders off, the card stays).
public enum TutorialPlace: Equatable, Sendable {
    /// The jobs list.
    case jobs
    /// A section of the sample job.
    case job(ProjectTabRoute.Section)
}

/// iPhone (compact width: bottom tab bar, the plan's floating bar) or iPad (regular width: sections in the
/// navigation bar, the device palette beside the plan).
public enum TutorialSizeClass: Sendable {
    case compact, regular
}

public struct TutorialStep: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let body: String
    /// Where the step happens; nil stays where the person is.
    public let place: TutorialPlace?
    /// The controls the step points at, the first one on screen wins (`.tutorialAnchor("id")` in the app). None on
    /// screen (or none named) never blocks: the card shows in the middle of the screen.
    public let anchors: [String]
    /// The same on iPhone, when it differs (nil: `anchors`).
    public let compactAnchors: [String]?
    /// Left out for technicians (prices, quotes).
    public let officeOnly: Bool
    /// The plan opens in this mode for the step (not saved as the person's choice).
    public let planMode: PlanViewerMode?
    /// SF Symbol shown on the card when there is nothing to point at.
    public let symbol: String

    public init(id: String, title: String, body: String, place: TutorialPlace?, anchors: [String], compactAnchors: [String]? = nil,
                officeOnly: Bool = false, planMode: PlanViewerMode? = nil, symbol: String) {
        self.id = id
        self.title = title
        self.body = body
        self.place = place
        self.anchors = anchors
        self.compactAnchors = compactAnchors
        self.officeOnly = officeOnly
        self.planMode = planMode
        self.symbol = symbol
    }

    /// The anchors to look for on this size of screen, in order.
    public func anchors(for size: TutorialSizeClass) -> [String] {
        size == .compact ? (compactAnchors ?? anchors) : anchors
    }
}

public struct Tutorial: Identifiable, Equatable, Sendable {
    public let id: TutorialID
    public let title: String
    public let summary: String
    public let minutes: Int
    public let audience: TutorialAudience
    public let steps: [TutorialStep]

    /// The steps this person sees: technicians skip the office's steps.
    public func steps(office: Bool) -> [TutorialStep] {
        office ? steps : steps.filter { !$0.officeOnly }
    }
}

/// One page of the welcome walkthrough.
public struct TutorialWelcomePage: Identifiable, Equatable, Sendable {
    public let id: String
    public let symbol: String
    public let title: String
    public let body: String
}

public enum Tutorials {
    /// Office: plans → Edit → place devices → Find similar → alarm sensors → takeoff → pricing → quote. Always on the
    /// sample (demo) job, so nothing of the person's own changes.
    public static let firstJob = Tutorial(
        id: .firstJob,
        title: "Your first job",
        summary: "Plans in, devices placed, doors and windows counted, quote out. Uses a sample plan, so nothing of yours changes.",
        minutes: 2,
        audience: .office,
        steps: [
            TutorialStep(id: "new-job", title: "Start a job",
                         body: "Every job starts here: the address and the client. For this tour we made a sample job for you.",
                         place: .jobs, anchors: ["jobs-new", "jobs-list"], symbol: "plus"),
            TutorialStep(id: "upload", title: "Upload plans and name pages",
                         body: "Add the PDF or phone photos. On Choose and name pages, untick pages you don't need. Names are read from each page, scans too; tap a name to change it.",
                         place: .job(.plan), anchors: ["plan-sheets"], planMode: .view, symbol: "doc.badge.plus"),
            TutorialStep(id: "edit", title: "Switch to Edit",
                         body: "View is for looking around. Edit is for placing devices; the plan gets a blue frame so you know taps change things.",
                         place: .job(.plan), anchors: ["plan-mode"], planMode: .view, symbol: "pencil"),
            TutorialStep(id: "place", title: "Place devices",
                         body: "Tap a device in the list, then tap the plan where it goes. Keep tapping to place more. Tap Done when you're finished.",
                         place: .job(.plan), anchors: ["plan-palette", "plan-devices"], compactAnchors: ["plan-devices"],
                         planMode: .edit, symbol: "hand.tap"),
            TutorialStep(id: "find-similar", title: "Count doors and windows",
                         body: "Find similar: tap one door on the plan and it finds the others like it. Check them, then Accept all.",
                         place: .job(.plan), anchors: ["plan-tools"], planMode: .edit, symbol: "square.on.square.dashed"),
            TutorialStep(id: "sensors", title: "Add alarm sensors",
                         body: "Once doors and windows are counted, Add alarm sensors puts a contact on each one in a single step. Tap one to leave it out.",
                         place: .job(.plan), anchors: ["plan-tools"], planMode: .edit, symbol: "checkmark.shield"),
            TutorialStep(id: "takeoff", title: "Check the takeoff",
                         body: "Every device and wire run, floor by floor. It counts only what's on the plan, so fix a count on the plan, not here.",
                         place: .job(.takeoff), anchors: ["takeoff-table"], symbol: "list.number"),
            TutorialStep(id: "pricing", title: "Price it",
                         body: "Prices come from your Price list. Change a price for this job only, add labor or a markup; the total updates as you go.",
                         place: .job(.money), anchors: ["money-total"], officeOnly: true, symbol: "dollarsign.circle"),
            TutorialStep(id: "quote", title: "Make the quote",
                         body: "Quotes are made, finalized and sent on the web: Quotes & invoices opens them. After a sync they show here too.",
                         place: .job(.money), anchors: ["money-quotes"], officeOnly: true, symbol: "doc.text"),
        ])

    /// The crew: open a job, read the plan in View, tap a device, the job's tasks and photos, working offline.
    public static let crewBasics = Tutorial(
        id: .crewBasics,
        title: "Crew basics",
        summary: "Open a job, read the plan, check a device, the job's tasks and photos, and working with no signal.",
        minutes: 1,
        audience: .technician,
        steps: [
            TutorialStep(id: "open-job", title: "Open a job",
                         body: "Jobs from your office show up here; tap one to open it. This tour uses the demo job, so nothing of yours changes.",
                         place: .jobs, anchors: ["jobs-list"], symbol: "folder"),
            TutorialStep(id: "plan", title: "Read the plan",
                         body: "Pinch to zoom, drag to move. Tap a device to see what it is, its room and its notes. Stay in View so nothing moves by accident.",
                         place: .job(.plan), anchors: ["plan-mode"], planMode: .view, symbol: "eye"),
            TutorialStep(id: "device", title: "Tap a device",
                         body: "Its card shows what it is, the room and the notes, with links to the device's photos and tasks.",
                         place: .job(.plan), anchors: ["plan-canvas"], planMode: .view, symbol: "hand.tap"),
            TutorialStep(id: "tasks", title: "The job's tasks",
                         body: "The Tasks tab (on phones, in the bar at the bottom): everything to do on this job. Open a task to see its spot on the plan, add a photo, mark it done.",
                         place: .job(.tasks), anchors: ["job-sections", "tasks-list"], compactAnchors: ["tasks-list"], symbol: "checklist"),
            TutorialStep(id: "photos", title: "Take photos",
                         body: "Photos is a tab of its own. Take photo saves it to this job with the date and place. No signal? It uploads when you're back online.",
                         place: .job(.photos), anchors: ["photos-add", "photos-list"], symbol: "camera"),
            TutorialStep(id: "offline", title: "Works with no signal",
                         body: "Everything is saved on this device first. Keep working in a basement or a new build: changes sync when you're back online.",
                         place: nil, anchors: [], symbol: "wifi.slash"),
        ])

    public static let all: [Tutorial] = [firstJob, crewBasics]

    public static func find(_ id: TutorialID) -> Tutorial {
        id == .firstJob ? firstJob : crewBasics
    }

    /// The tours offered to this person, theirs first. A tour with fewer than two steps for them isn't offered.
    public static func available(office: Bool) -> [Tutorial] {
        let mine: TutorialAudience = office ? .office : .technician
        let usable = all.filter { $0.steps(office: office).count >= 2 }
        return usable.filter { $0.audience == mine } + usable.filter { $0.audience != mine }
    }

    /// The tour the welcome walkthrough ends on.
    public static func suggested(office: Bool) -> TutorialID {
        office ? .firstJob : .crewBasics
    }

    /// The welcome walkthrough: what the app is for, that it works offline, how the tours work.
    public static let welcome: [TutorialWelcomePage] = [
        TutorialWelcomePage(id: "welcome", symbol: "mappin.and.ellipse", title: "Welcome to Northpin",
                            body: "Pin devices on your plans, count them floor by floor and turn the count into a quote. The crew gets the plan, tasks and photos."),
        TutorialWelcomePage(id: "offline", symbol: "wifi.slash", title: "Made for the job site",
                            body: "Everything is saved on this device first. No signal? Keep working: changes sync when you're back online."),
        TutorialWelcomePage(id: "tour", symbol: "hand.tap", title: "Learn by doing",
                            body: "A short tour points at the real buttons on a demo job, so nothing of yours changes. Replay it any time from Help & tutorials."),
    ]

    /// Every English string the tutorial shows from data (titles, bodies, summaries, welcome pages), for the
    /// translation check.
    public static var allStrings: [String] {
        var out: [String] = []
        for t in all {
            out += [t.title, t.summary]
            for s in t.steps { out += [s.title, s.body] }
        }
        for p in welcome { out += [p.title, p.body] }
        var seen = Set<String>()
        return out.filter { seen.insert($0).inserted }
    }

    /// Every anchor id a step can point at.
    public static var allAnchors: Set<String> {
        Set(all.flatMap { $0.steps.flatMap { $0.anchors + ($0.compactAnchors ?? []) } })
    }
}

// MARK: - progress

/// The tour on screen and its step (an index into `steps(office:)`).
public struct TutorialRun: Codable, Equatable, Sendable {
    public var id: TutorialID
    public var step: Int
    public init(id: TutorialID, step: Int) {
        self.id = id
        self.step = step
    }
}

/// What this device remembers (UserDefaults, `TutorialKeys.prefs`).
public struct TutorialPrefs: Codable, Equatable, Sendable {
    /// Tours finished.
    public var done: [TutorialID] = []
    /// Tours skipped (Skip or Don't show again).
    public var skipped: [TutorialID] = []
    /// Tours closed part way, with the step to resume at.
    public var paused: [String: Int] = [:]
    /// The first-run prompt on the jobs list has been answered (started, opened or closed).
    public var welcomeSeen = false
    /// "Don't show again": no first-run prompt (until Show tours and tips again).
    public var offersOff = false
    /// The tour on screen, if any.
    public var active: TutorialRun?

    public init() {}

    /// The one first-run prompt on the jobs list (the Help tip folded into the tour offer).
    public var showsFirstRunPrompt: Bool { !welcomeSeen && !offersOff && active == nil }
}

public enum TutorialAction: Equatable, Sendable {
    /// Start a tour; nil step resumes where it was closed, else from the top.
    case start(TutorialID, step: Int?)
    case next, back
    case go(Int)
    /// Skip: ends the tour and remembers it was skipped.
    case skip
    /// Close: ends the tour for now; it can be resumed from Tutorials.
    case close
    /// Don't show again: ends the tour and turns the first-run prompt off.
    case dontShowAgain
    /// The first-run prompt was answered (opened or closed) without starting a tour.
    case answerWelcome
    /// Show tours and tips again: forget everything.
    case reset
}

/// What Start in the Tutorials list says.
public enum TutorialButton: Equatable, Sendable {
    case start
    /// Resume at a step (1-based, for the label) of the total.
    case resume(step: Int, total: Int)
    case again
}

public enum TutorialLogic {
    /// Every change to the progress goes through here (pure; the app saves the result).
    public static func reduce(_ prefs: TutorialPrefs, _ action: TutorialAction, office: Bool) -> TutorialPrefs {
        var p = prefs
        func count(_ id: TutorialID) -> Int { Tutorials.find(id).steps(office: office).count }
        func end(_ run: TutorialRun, as list: WritableKeyPath<TutorialPrefs, [TutorialID]>) {
            p.paused[run.id.rawValue] = nil
            if !p[keyPath: list].contains(run.id) { p[keyPath: list].append(run.id) }
            p.active = nil
        }
        switch action {
        case .start(let id, let step):
            let n = count(id)
            guard n > 0 else { return p }
            let at = step ?? p.paused[id.rawValue] ?? 0
            p.active = TutorialRun(id: id, step: min(max(at, 0), n - 1))
            p.paused[id.rawValue] = nil
            p.welcomeSeen = true
        case .next:
            guard let run = p.active else { return p }
            if run.step + 1 >= count(run.id) {
                end(run, as: \.done)
                p.skipped.removeAll { $0 == run.id }
            } else {
                p.active?.step = run.step + 1
            }
        case .back:
            guard let run = p.active else { return p }
            p.active?.step = max(0, run.step - 1)
        case .go(let i):
            guard let run = p.active else { return p }
            p.active?.step = min(max(i, 0), count(run.id) - 1)
        case .skip:
            guard let run = p.active else { return p }
            end(run, as: \.skipped)
        case .close:
            guard let run = p.active else { return p }
            p.paused[run.id.rawValue] = run.step
            p.active = nil
        case .dontShowAgain:
            if let run = p.active { end(run, as: \.skipped) }
            p.offersOff = true
            p.welcomeSeen = true
        case .answerWelcome:
            p.welcomeSeen = true
        case .reset:
            p = TutorialPrefs()
        }
        return p
    }

    /// Start, Resume (step n of N) or Take it again.
    public static func button(_ id: TutorialID, prefs: TutorialPrefs, office: Bool) -> TutorialButton {
        let total = Tutorials.find(id).steps(office: office).count
        if let at = prefs.paused[id.rawValue], at > 0, at < total { return .resume(step: at + 1, total: total) }
        if prefs.done.contains(id) || prefs.skipped.contains(id) { return .again }
        return .start
    }
}

// MARK: - storage

/// The UserDefaults the tutorial uses (a protocol so the tests use a dictionary).
public protocol TutorialDefaults: AnyObject {
    func data(forKey key: String) -> Data?
    func bool(forKey key: String) -> Bool
    func set(_ value: Any?, forKey key: String)
}

extension UserDefaults: TutorialDefaults {}

public enum TutorialKeys {
    /// The progress (`TutorialPrefs` as JSON).
    public static let prefs = "pinplan.tutorial.prefs"
    /// The one-time Help tip of earlier versions: answered there counts as answered here.
    public static let legacyTipSeen = "pinplan.help.tipSeen"
}

public enum TutorialStore {
    /// The saved progress. A tour that was on screen when the app quit is offered as Resume, not reopened. The
    /// earlier Help tip counts only until this progress is first saved (after that, Reset tutorials brings the prompt
    /// back).
    public static func load(_ defaults: TutorialDefaults) -> TutorialPrefs {
        let saved = defaults.data(forKey: TutorialKeys.prefs).flatMap { try? JSONDecoder().decode(TutorialPrefs.self, from: $0) }
        var p = saved ?? TutorialPrefs()
        if saved == nil && defaults.bool(forKey: TutorialKeys.legacyTipSeen) { p.welcomeSeen = true }
        if let run = p.active {
            p.paused[run.id.rawValue] = run.step
            p.active = nil
        }
        return p
    }

    public static func save(_ prefs: TutorialPrefs, _ defaults: TutorialDefaults) {
        if let data = try? JSONEncoder().encode(prefs) { defaults.set(data, forKey: TutorialKeys.prefs) }
        // Earlier versions read this to show their Help tip.
        if prefs.welcomeSeen { defaults.set(true, forKey: TutorialKeys.legacyTipSeen) }
    }
}

// MARK: - card placement

/// A rectangle in points (CoreGraphics-free, so the placement is tested on any platform).
public struct TutorialRect: Equatable, Sendable {
    public var x: Double, y: Double, width: Double, height: Double
    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x; self.y = y; self.width = width; self.height = height
    }
    public var maxX: Double { x + width }
    public var maxY: Double { y + height }
    public var midX: Double { x + width / 2 }
    public var midY: Double { y + height / 2 }
    public var isEmpty: Bool { width <= 0 || height <= 0 }

    public func intersects(_ o: TutorialRect) -> Bool {
        x < o.maxX && o.x < maxX && y < o.maxY && o.y < maxY
    }
}

public enum TutorialLayout {
    public enum Side: Equatable, Sendable { case below, above, trailing, leading, centered, top, bottom }

    /// The card's width: the screen's width less the margins on iPhone (at most 520 in landscape), 380 on iPad.
    public static func cardWidth(container: TutorialRect, size: TutorialSizeClass, margin: Double = 12) -> Double {
        let room = max(0, container.width - 2 * margin)
        return size == .compact ? min(room, 520) : min(room, 380)
    }

    /// The spotlight around a target: a little larger than it, inside the screen. Nil when the target is off screen.
    public static func spotlight(_ target: TutorialRect?, container: TutorialRect, padding: Double = 6) -> TutorialRect? {
        guard let t = target, !t.isEmpty, t.intersects(container) else { return nil }
        let x = max(container.x, t.x - padding), y = max(container.y, t.y - padding)
        let maxX = min(container.maxX, t.maxX + padding), maxY = min(container.maxY, t.maxY + padding)
        guard maxX > x, maxY > y else { return nil }
        return TutorialRect(x: x, y: y, width: maxX - x, height: maxY - y)
    }

    /// Where the card goes (its frame), next to the spotlight and inside the container (the safe area).
    /// No target: the middle of the screen. iPhone: along the bottom, or the top when the target is in the lower
    /// half. iPad: below the target, else above, after it, before it; when none fits, the bottom.
    public static func place(card: (width: Double, height: Double), spotlight: TutorialRect?, container: TutorialRect,
                             size: TutorialSizeClass, margin: Double = 12, gap: Double = 12) -> (frame: TutorialRect, side: Side) {
        let w = min(card.width, max(0, container.width - 2 * margin))
        let h = min(card.height, max(0, container.height - 2 * margin))
        func clampX(_ x: Double) -> Double { min(max(x, container.x + margin), container.maxX - margin - w) }
        func clampY(_ y: Double) -> Double { min(max(y, container.y + margin), container.maxY - margin - h) }
        guard let s = spotlight else {
            return (TutorialRect(x: container.midX - w / 2, y: container.midY - h / 2, width: w, height: h), .centered)
        }
        if size == .compact {
            let x = container.midX - w / 2
            if s.midY > container.midY {
                return (TutorialRect(x: x, y: container.y + margin, width: w, height: h), .top)
            }
            return (TutorialRect(x: x, y: container.maxY - margin - h, width: w, height: h), .bottom)
        }
        if s.maxY + gap + h <= container.maxY - margin {
            return (TutorialRect(x: clampX(s.midX - w / 2), y: s.maxY + gap, width: w, height: h), .below)
        }
        if s.y - gap - h >= container.y + margin {
            return (TutorialRect(x: clampX(s.midX - w / 2), y: s.y - gap - h, width: w, height: h), .above)
        }
        if s.maxX + gap + w <= container.maxX - margin {
            return (TutorialRect(x: s.maxX + gap, y: clampY(s.midY - h / 2), width: w, height: h), .trailing)
        }
        if s.x - gap - w >= container.x + margin {
            return (TutorialRect(x: s.x - gap - w, y: clampY(s.midY - h / 2), width: w, height: h), .leading)
        }
        return (TutorialRect(x: container.midX - w / 2, y: container.maxY - margin - h, width: w, height: h), .bottom)
    }
}

// MARK: - launch arguments

/// Screenshot / automation hooks (Debug builds): `--tutorial` (the welcome walkthrough), `--tutorial welcome`,
/// `--tutorial first-job`, `--tutorial crew-basics` (or `--tutorial=<id>`), with `--tutorial-step=N` / `--tutorial-step N`
/// (1-based: the step of the tour, or the page of the walkthrough).
public enum TutorialLaunch: Equatable, Sendable {
    /// The welcome walkthrough at a page (0-based).
    case welcome(page: Int)
    /// A tour at a step (0-based).
    case tour(TutorialID, step: Int)

    public static func parse(_ args: [String]) -> TutorialLaunch? {
        var name: String?
        var found = false
        var step = 1
        for (i, a) in args.enumerated() {
            if a == "--tutorial" {
                found = true
                if i + 1 < args.count, !args[i + 1].hasPrefix("-") { name = args[i + 1] }
            } else if a.hasPrefix("--tutorial=") {
                found = true
                name = String(a.dropFirst("--tutorial=".count))
            } else if a.hasPrefix("--tutorial-step=") {
                step = Int(a.dropFirst("--tutorial-step=".count)) ?? 1
            } else if a == "--tutorial-step", i + 1 < args.count {
                step = Int(args[i + 1]) ?? 1
            }
        }
        guard found else { return nil }
        let index = max(step, 1) - 1
        if let name, let id = TutorialID(rawValue: name) { return .tour(id, step: index) }
        if name == nil || name == "welcome" {
            return .welcome(page: min(index, Tutorials.welcome.count - 1))
        }
        return nil
    }
}
