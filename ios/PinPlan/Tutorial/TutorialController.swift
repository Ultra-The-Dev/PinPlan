import SwiftUI
import UIKit
import PinPlanCore

// The native tutorial (docs/help-and-tours.md, "Help in the iPad / iPhone app"): a welcome walkthrough and guided
// tours with coach marks on the real screens, offline. The tours, their steps and the saved progress are
// PinPlanCore's Tutorials / TutorialLogic / TutorialStore (unit tested); this file runs them in the app:
//
//  • TutorialController (one shared instance, like JobNav): the running tour and the requests a step makes, "open
//    the sample job on its Plan", "plan in Edit". ProjectsView follows `route` (the jobs list or the sample job),
//    ProjectView takes `pendingTab`, PlanEditorView takes `pendingPlanMode`.
//  • `.tutorialAnchor("id")`: marks a control a step can point at. Frames are reported in window coordinates to
//    TutorialAnchors, so anchors work from toolbars, tab content and the plan's floating chrome alike (SwiftUI anchor
//    preferences don't leave a toolbar item or a tab). A missing anchor never blocks: the card shows centred.
//  • TutorialOverlay (TutorialOverlay.swift): the dimmed screen, the spotlight and the card, over the whole window.

/// What a step asks the jobs screen to show.
enum TutorialRoute: Equatable {
    case jobs
    case job(ProjectTab)
}

/// A section for the open job to switch to: only the demo job the tour opened takes it.
struct TutorialTabRequest: Equatable {
    let jobId: String
    let tab: ProjectTab
}

@MainActor
@Observable
final class TutorialController {
    static let shared = TutorialController()

    /// Progress, saved in UserDefaults on every change (TutorialStore).
    private(set) var prefs: TutorialPrefs
    /// The office sees every step; technicians don't get the steps about prices. Set by the jobs screen from the
    /// person's role (the same rule as the Money tab).
    var office = true
    /// The jobs screen goes here (and clears it).
    var route: TutorialRoute?
    /// The open job switches to this section (ProjectView clears it: on appear for a job just opened, else on change).
    var pendingTab: TutorialTabRequest?
    /// The plan switches to this mode (PlanEditorView clears it). Not saved as the person's choice.
    var pendingPlanMode: PlanViewerMode?
    /// "Tour finished…" / "Tour skipped…", shown for a moment after a tour ends.
    var notice: String?
    /// Bumped on every step change (the card re-measures, VoiceOver hears the new step).
    private(set) var stepToken = 0

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        prefs = TutorialStore.load(defaults)
    }

    // MARK: what's on screen

    var tutorial: Tutorial? { prefs.active.map { Tutorials.find($0.id) } }
    var steps: [TutorialStep] { tutorial?.steps(office: office) ?? [] }
    var stepIndex: Int { prefs.active?.step ?? 0 }
    var step: TutorialStep? {
        let s = steps
        return s.indices.contains(stepIndex) ? s[stepIndex] : nil
    }
    var isRunning: Bool { step != nil }
    var isLastStep: Bool { stepIndex >= steps.count - 1 }
    var showsFirstRunPrompt: Bool { prefs.showsFirstRunPrompt }

    func button(for id: TutorialID) -> TutorialButton { TutorialLogic.button(id, prefs: prefs, office: office) }

    // MARK: actions

    /// Starts (or resumes) a tour and goes to its step.
    func start(_ id: TutorialID, at step: Int? = nil) {
        notice = nil
        apply(.start(id, step: step))
        enterStep()
    }

    func next() {
        let wasRunning = isRunning
        apply(.next)
        if isRunning { enterStep() } else if wasRunning { finished(String(localized: "Tour finished. Take it again any time from Help.")) }
    }

    func back() {
        guard stepIndex > 0 else { return }
        apply(.back)
        enterStep()
    }

    /// Skip: the tour ends and is remembered as skipped.
    func skip() {
        guard isRunning else { return }
        apply(.skip)
        finished(String(localized: "Tour skipped. You'll find it in Help."))
    }

    /// Close (×): the tour ends for now and Tutorials offers Resume.
    func close() {
        guard isRunning else { return }
        apply(.close)
        finished(String(localized: "Tour skipped. You'll find it in Help."))
    }

    /// Don't show again: ends any tour and turns the first-run prompt off.
    func dontShowAgain() {
        let wasRunning = isRunning
        apply(.dontShowAgain)
        if wasRunning { finished(String(localized: "Tour skipped. You'll find it in Help.")) }
    }

    /// The first-run prompt was answered without starting a tour (opened the walkthrough or the list, or closed it).
    func answerWelcome() { apply(.answerWelcome) }

    /// Show tours and tips again.
    func reset() {
        apply(.reset)
        notice = nil
    }

    // MARK: requests for the screens

    /// ProjectView: the section to open in this job, once.
    func takePendingTab(job: String) -> ProjectTab? {
        guard let r = pendingTab, r.jobId == job else { return nil }
        pendingTab = nil
        return r.tab
    }

    /// PlanEditorView: the mode to show, once.
    func takePlanMode() -> PlanViewerMode? {
        defer { pendingPlanMode = nil }
        return pendingPlanMode
    }

    // MARK: private

    private func apply(_ action: TutorialAction) {
        prefs = TutorialLogic.reduce(prefs, action, office: office)
        TutorialStore.save(prefs, defaults)
        stepToken += 1
    }

    /// Goes where the step happens (once: if the person wanders off, the card stays and Next carries on).
    private func enterStep() {
        guard let step else { return }
        pendingPlanMode = step.planMode
        switch step.place {
        case .jobs?: route = .jobs
        case .job(let section)?:
            if let tab = ProjectTab(rawValue: section.rawValue) { route = .job(tab) }
        case nil: break
        }
    }

    private func finished(_ text: String) {
        route = nil
        pendingTab = nil
        pendingPlanMode = nil
        notice = text
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(3))
            if self?.notice == text { self?.notice = nil }
        }
    }
}

// MARK: - anchors

/// The frames of the controls marked with `.tutorialAnchor`, in window coordinates. Only what's on screen is here:
/// a control that goes away (another tab, another screen) removes itself. The same id can be reported by more than
/// one view (a toolbar copy and an on-screen copy); the latest frame that is actually on screen wins.
@MainActor
@Observable
final class TutorialAnchors {
    static let shared = TutorialAnchors()

    private struct Report: Equatable { var frame: CGRect; var seq: Int }
    private var reports: [String: [UUID: Report]] = [:]
    @ObservationIgnored private var seq = 0

    func report(_ id: String, _ frame: CGRect, owner: UUID) {
        if reports[id]?[owner]?.frame == frame { return }
        seq += 1
        reports[id, default: [:]][owner] = Report(frame: frame, seq: seq)
    }

    func remove(_ id: String, owner: UUID) {
        reports[id]?[owner] = nil
        if reports[id]?.isEmpty == true { reports[id] = nil }
    }

    /// The window's bounds (the overlay covers the whole window).
    private var screen: CGRect {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return (windows.first { $0.isKeyWindow } ?? windows.first)?.bounds ?? .zero
    }

    /// The first of these ids that is on screen. Toolbar buttons don't always report a usable frame from SwiftUI, so
    /// the right-most bar button stands in for the ones listed in `trailingBarButtons`.
    func frame(for ids: [String]) -> CGRect? {
        let bounds = screen
        func usable(_ f: CGRect) -> Bool {
            guard f.width > 1, f.height > 1 else { return false }
            if bounds.isEmpty { return true }
            // On screen, and not the whole window (a frame reported before layout).
            return bounds.intersects(f) && !(f.width >= bounds.width * 0.98 && f.height >= bounds.height * 0.9)
        }
        for id in ids {
            if let r = reports[id]?.values.filter({ usable($0.frame) }).max(by: { $0.seq < $1.seq }) { return r.frame }
            if let f = Self.barFrame(id), usable(f) { return f }
        }
        return nil
    }

    /// Controls that are the last (right-most) button of the navigation bar. SwiftUI can turn toolbar buttons into
    /// native bar buttons, which drops the anchor's GeometryReader, so these are found in the bar itself.
    private static let trailingBarButtons: Set<String> = ["jobs-new", "photos-add"]

    /// The right-most button in the visible navigation bar, in window coordinates.
    private static func barFrame(_ id: String) -> CGRect? {
        guard trailingBarButtons.contains(id) else { return nil }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else { return nil }
        var bars: [UINavigationBar] = []
        func collect(_ v: UIView) {
            if let bar = v as? UINavigationBar, !bar.isHidden, bar.alpha > 0.01, bar.window != nil { bars.append(bar); return }
            for sub in v.subviews where !sub.isHidden { collect(sub) }
        }
        collect(window)
        // The bar nearest the top that is on screen (a pushed screen's bar replaces the one below it).
        guard let bar = bars.map({ ($0, $0.convert($0.bounds, to: window)) })
            .filter({ $0.1.width > 0 && $0.1.minY >= -1 && window.bounds.intersects($0.1) })
            .max(by: { $0.1.width < $1.1.width })?.0 else { return nil }
        var best: CGRect?
        func scan(_ v: UIView) {
            let name = String(describing: type(of: v))
            let f = v.convert(v.bounds, to: window)
            if name.contains("Button"), !v.isHidden, v.alpha > 0.01, f.width >= 20, f.width <= 220, f.height >= 20, f.height <= 70 {
                if best == nil || f.maxX > best!.maxX + 1 { best = f }
                return
            }
            for sub in v.subviews where !sub.isHidden && sub.alpha > 0.01 { scan(sub) }
        }
        scan(bar)
        // Only a button on the trailing side (never the back button when the bar has no trailing items).
        let barRect = bar.convert(bar.bounds, to: window)
        guard let b = best, b.midX > barRect.midX else { return nil }
        return b
    }
}

private struct TutorialAnchorModifier: ViewModifier {
    let id: String
    @State private var owner = UUID()

    func body(content: Content) -> some View {
        content.background {
            GeometryReader { g in
                Color.clear
                    .onAppear { TutorialAnchors.shared.report(id, g.frame(in: .global), owner: owner) }
                    .onChange(of: g.frame(in: .global)) { _, f in TutorialAnchors.shared.report(id, f, owner: owner) }
                    .onDisappear { TutorialAnchors.shared.remove(id, owner: owner) }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

extension View {
    /// Marks a control a tutorial step can point at (ids: PinPlanCore's Tutorials; TutorialTests checks each id a
    /// step uses is marked somewhere in the app).
    /// `enabled: false` leaves the view unmarked (e.g. a toolbar copy of a control that is elsewhere on this screen size).
    @ViewBuilder
    func tutorialAnchor(_ id: String, enabled: Bool = true) -> some View {
        if enabled { modifier(TutorialAnchorModifier(id: id)) } else { self }
    }
}
