import SwiftUI
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
/// a control that goes away (another tab, another screen) removes itself.
@MainActor
@Observable
final class TutorialAnchors {
    static let shared = TutorialAnchors()

    private(set) var frames: [String: CGRect] = [:]
    /// Which view reported each frame, so a view leaving doesn't remove the same id reported by the one replacing it.
    @ObservationIgnored private var owners: [String: UUID] = [:]

    func report(_ id: String, _ frame: CGRect, owner: UUID) {
        owners[id] = owner
        if frames[id] != frame { frames[id] = frame }
    }

    func remove(_ id: String, owner: UUID) {
        guard owners[id] == owner else { return }
        owners[id] = nil
        frames[id] = nil
    }

    /// The first of these ids that is on screen.
    func frame(for ids: [String]) -> CGRect? {
        for id in ids { if let f = frames[id], f.width > 0, f.height > 0 { return f } }
        return nil
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
    func tutorialAnchor(_ id: String) -> some View {
        modifier(TutorialAnchorModifier(id: id))
    }
}
