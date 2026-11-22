import SwiftUI
import PinPlanCore

/// The welcome walkthrough: a few pages (PinPlanCore's Tutorials.welcome), Skip at any time, and on the last page
/// the tour for this person (Your first job for the office, Crew basics for technicians). Offered by the first-run
/// prompt on the jobs list (HelpTipBanner) and from Tutorials.
struct TutorialWelcomeView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 64
    @State private var page: Int
    /// Start the suggested tour (the caller closes this sheet).
    let onStart: () -> Void
    /// Don't show again (the caller closes this sheet).
    let onDontShow: () -> Void

    private let pages = Tutorials.welcome
    private var lastPage: Bool { page >= pages.count - 1 }

    init(page: Int = 0, onStart: @escaping () -> Void, onDontShow: @escaping () -> Void) {
        _page = State(initialValue: min(max(page, 0), Tutorials.welcome.count - 1))
        self.onStart = onStart
        self.onDontShow = onDontShow
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TabView(selection: $page) {
                    ForEach(Array(pages.enumerated()), id: \.element.id) { i, p in
                        pageView(p).tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                dots.padding(.vertical, 8)
                controls
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
                    .frame(maxWidth: 520)
            }
            .frame(maxWidth: .infinity)
            .background(Color.paper)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !lastPage {
                        Button("Skip") { dismiss() }
                            .accessibilityIdentifier("welcome-skip")
                    }
                }
            }
        }
    }

    private func pageView(_ p: TutorialWelcomePage) -> some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: p.symbol)
                    .font(.system(size: iconSize))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(Color.brand)
                    .frame(height: iconSize * 1.4)
                    .accessibilityHidden(true)
                Text(tr(p.title))
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(tr(p.body))
                    .font(.body)
                    .foregroundStyle(Color.pencil)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 32)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("welcome-page-\(p.id)")
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(pages.indices, id: \.self) { i in
                Circle()
                    .fill(i == page ? Color.brand : Color.secondary.opacity(0.35))
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Page \(page + 1) of \(pages.count)"))
    }

    @ViewBuilder private var controls: some View {
        if lastPage {
            VStack(spacing: 6) {
                Button(action: onStart) {
                    Text("Start the tour").frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityIdentifier("welcome-start")
                Button("Not now") { dismiss() }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("welcome-not-now")
                Button("Don't show again", action: onDontShow)
                    .font(.footnote)
                    .foregroundStyle(Color.secondary)
                    .frame(minHeight: 44)
            }
        } else {
            HStack {
                Button("Back") { go(page - 1) }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(page == 0)
                    .opacity(page == 0 ? 0 : 1)
                    .accessibilityHidden(page == 0)
                Spacer()
                Button("Next") { go(page + 1) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("welcome-next")
            }
        }
    }

    private func go(_ p: Int) {
        let target = min(max(p, 0), pages.count - 1)
        if reduceMotion { page = target } else { withAnimation(.easeInOut(duration: 0.3)) { page = target } }
    }
}

/// Tutorials: the guided tours (Start / Resume / Take it again), the welcome again, the Help center on the web, and
/// a way to start over. From the jobs list (More › Help & tutorials, the first-run prompt) and Settings › About.
struct TutorialsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// Presented as its own sheet (a Done button), not pushed in Settings.
    var asSheet = false
    @State private var showWelcome = false
    @State private var webPage: InAppPage?
    @State private var didReset = false

    private var tour: TutorialController { .shared }

    var body: some View {
        List {
            Section {
                ForEach(Tutorials.available(office: tour.office)) { t in tourRow(t) }
            } header: {
                Text("Guided tours").textCase(nil)
            } footer: {
                Text("Tours run on the demo job and work offline, so nothing of yours changes.")
            }
            Section {
                Button { showWelcome = true } label: {
                    row(icon: "sparkles", title: String(localized: "Welcome to Northpin"),
                        subtitle: String(localized: "What the app does, in three short pages."))
                }
                .accessibilityIdentifier("tutorial-welcome")
            }
            Section {
                Button {
                    if let url = app.settings.helpURL() { webPage = InAppPage(url: url) }
                } label: {
                    row(icon: "safari", title: String(localized: "Help center on the web"),
                        subtitle: String(localized: "Short guides with screenshots. Needs a connection."), external: true)
                }
            }
            Section {
                Button("Reset tutorials") {
                    tour.reset()
                    didReset = true
                }
                .frame(minHeight: 44)
            } footer: {
                Text(didReset ? "Tours and tips will show again"
                              : "Forgets finished and skipped tours, and shows the welcome tip on the jobs list again.")
            }
        }
        .navigationTitle("Tutorials")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if asSheet {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .sheet(isPresented: $showWelcome) {
            TutorialWelcomeView(onStart: {
                showWelcome = false
                start(Tutorials.suggested(office: tour.office))
            }, onDontShow: {
                showWelcome = false
                tour.dontShowAgain()
            })
        }
        .sheet(item: $webPage) { p in SafariView(url: p.url).ignoresSafeArea() }
    }

    /// Starting closes the sheets above the jobs screen (ProjectsView follows the tour's route).
    private func start(_ id: TutorialID) {
        tour.start(id)
        if asSheet { dismiss() }
    }

    private func tourRow(_ t: Tutorial) -> some View {
        Button { start(t.id) } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: t.audience == .office ? "building.2" : "wrench.and.screwdriver")
                    .font(.title3)
                    .foregroundStyle(Color.brand)
                    .frame(width: 30)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr(t.title)).font(.headline).foregroundStyle(Color.primary)
                    Text(tr(t.summary)).font(.subheadline).foregroundStyle(Color.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Text(action(t)).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                        Text("\(t.minutes) min").font(.caption).foregroundStyle(Color.secondary)
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tutorial-start-\(t.id.rawValue)")
    }

    private func action(_ t: Tutorial) -> String {
        switch tour.button(for: t.id) {
        case .start: return String(localized: "Start the tour")
        case .resume(let step, let total): return String(localized: "Resume (step \(step) of \(total))")
        case .again: return String(localized: "Take it again")
        }
    }

    private func row(icon: String, title: String, subtitle: String, external: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.title3).foregroundStyle(Color.brand).frame(width: 30).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(Color.primary)
                Text(subtitle).font(.caption).foregroundStyle(Color.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Image(systemName: external ? "arrow.up.right" : "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.secondary)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}
