import SwiftUI
import PinPlanCore

/// A job's sections, the same on the web, iPad and iPhone (docs/navigation.md):
/// Overview · Plan (+ manage plans) · Takeoff (+ wiring sheets) · Tasks · Photos · Money (office only) · Field
/// (today, checklists, logs, files, forms, RFIs, schedule, history). The plan is for devices: tasks and photos have
/// sections of their own, and a device's card on the plan links to its photos and tasks (JobNav).
enum ProjectTab: String, CaseIterable, Identifiable {
    case overview, plan, takeoff, tasks, photos, money, field
    var id: String { rawValue }
    var title: String { tr(rawValue.capitalized) }
    var icon: String {
        switch self {
        case .overview: return "house"
        case .plan: return "mappin.and.ellipse"
        case .takeoff: return "list.number"
        case .tasks: return "checklist"
        case .photos: return "photo.on.rectangle"
        case .money: return "dollarsign.circle"
        case .field: return "checklist.checked"
        }
    }

    /// A page inside a section that a link can open straight away.
    enum Page { case managePlans, wiring }

    /// Where a tab id leads. Takes this enum's ids plus the older and web ids (JobSummary's next steps use the web
    /// ids: plan, sheets, photos, field, takeoff, estimate, crew, info). The mapping is PinPlanCore's ProjectTabRoute
    /// (unit tested); this only converts its section and page.
    static func resolve(_ id: String) -> (tab: ProjectTab, page: Page?)? {
        guard let r = ProjectTabRoute.resolve(id), let tab = ProjectTab(rawValue: r.section.rawValue) else { return nil }
        let page: Page?
        switch r.page {
        case .managePlans?: page = .managePlans
        case .wiring?: page = .wiring
        case nil: page = nil
        }
        return (tab, page)
    }
}

/// Requests to move around the open job from deep inside a section (the device card on the plan opens that device's
/// photos or tasks), and the filters they carry. One shared instance, like TaskOverlayState; ProjectView follows it.
@MainActor
@Observable
final class JobNav {
    static let shared = JobNav()
    /// The section to switch to (ProjectView clears it once done).
    var go: ProjectTab?
    /// Photos: only this device's (marker id), until cleared.
    var photoDevice: String?
    /// Tasks: only this device's (marker id), until cleared.
    var taskDevice: String?
    /// Tasks: open this task.
    var openTask: String?

    /// "N photos" on a device card: the Photos section, filtered to the device.
    func photos(device: String) {
        photoDevice = device
        go = .photos
    }

    /// "N tasks" on a device card: the task itself when there is one, else the Tasks section filtered to the device.
    func tasks(device: String, ids: [String]) {
        if ids.count == 1 { openTask = ids[0]; taskDevice = nil } else { taskDevice = device }
        go = .tasks
    }

    /// A different job opened: no filters carried over.
    func reset() {
        go = nil; photoDevice = nil; taskDevice = nil; openTask = nil
    }
}

struct ProjectView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    let bundle: ProjectBundle
    @State private var model: EditorModel?
    @State private var tab: ProjectTab = .overview
    /// iPhone: the section last opened under More (shown again when More is tapped).
    @State private var lastMore: ProjectTab = .overview
    @State private var showWiring = false

    /// iPhone tab bar slots: four sections and More.
    private enum PhoneSlot: Hashable { case section(ProjectTab), more }

    var body: some View {
        Group {
            if let model {
                if hSize == .compact {
                    // iPhone: Plan · Tasks · Photos · Money (technicians: Field) · More (the other sections, with a
                    // section switch on top). ProjectTabRoute.phoneTabs, the same as the web's phone bar.
                    TabView(selection: phoneSlot) {
                        ForEach(phoneBar) { t in
                            content(model, t)
                                .tabItem { Label(t.title, systemImage: t.icon) }
                                .tag(PhoneSlot.section(t))
                        }
                        moreSection(model)
                            .tabItem { Label("More", systemImage: "ellipsis.circle") }
                            .tag(PhoneSlot.more)
                    }
                    .navigationTitle(title(model))
                    .navigationBarTitleDisplayMode(.inline)
                } else {
                    // iPad: section picker in the navigation bar.
                    content(model, tab)
                        .navigationTitle(title(model))
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .principal) {
                                // Words, not icon-only segments — unless a narrow window (iPad mini portrait, Split
                                // View, Stage Manager) or a long language leaves no room for them.
                                ViewThatFits(in: .horizontal) {
                                    Picker("Section", selection: $tab) {
                                        ForEach(tabs) { t in Text(t.title).tag(t) }
                                    }
                                    .pickerStyle(.segmented)
                                    Picker("Section", selection: $tab) {
                                        ForEach(tabs) { t in Image(systemName: t.icon).accessibilityLabel(t.title).tag(t) }
                                    }
                                    .pickerStyle(.segmented)
                                }
                                .frame(maxWidth: 700)
                            }
                        }
                }
            } else {
                ProgressView()
            }
        }
        // Trial ending, needs attention or read-only: say so in the job too.
        .safeAreaInset(edge: .top, spacing: 0) { JobBillingBanner() }
        // A change refused because the job is read-only (lapsed subscription or ended trial): say why, once.
        .alert("This job is read-only", isPresented: Binding(get: { model?.readOnlyNotice != nil },
                                                             set: { if !$0 { model?.readOnlyNotice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model?.readOnlyNotice ?? "")
        }
        .environment(\.exportPlacement, hSize == .compact ? .topBarTrailing : .bottomBar)
        // A technician has no Money tab (also when the role arrives with a sync while the job is open).
        .onChange(of: app.cloud.can(.prices)) { _, ok in if !ok && tab == .money { tab = .overview } }
        // The device card on the plan asks for its photos or tasks.
        .onChange(of: JobNav.shared.go) { _, go in
            guard let go else { return }
            if tabs.contains(go) { tab = go }
            JobNav.shared.go = nil
        }
        .onChange(of: tab) { _, t in if phoneMore.contains(t) { lastMore = t } }
        // Every plan deleted from "Add or manage plans": the plan section is the import screen again, so don't let
        // the closed sheet pop back up after the next import.
        .onChange(of: model?.sheets.isEmpty ?? false) { _, empty in if empty { model?.showManagePlans = false } }
        .onAppear {
            if model == nil {
                JobNav.shared.reset()
                let m = EditorModel(bundle: bundle, app: app)
                model = m
                // A new job starts on its plan (the import screen until the first plan is in).
                if m.sheets.isEmpty { tab = .plan }
                // Plans shared from another app open on the plan's import screen.
                if app.pendingImport?.projectId == bundle.project.id { tab = .plan; if !m.sheets.isEmpty { m.showManagePlans = true } }
                #if DEBUG
                // Screenshot/automation hook: `--tab plan` etc. (older ids such as `sheets`, `crew`, `estimate` still work).
                let args = ProcessInfo.processInfo.arguments
                if let i = args.firstIndex(of: "--tab"), args.indices.contains(i + 1) { open(args[i + 1], model: m) }
                if args.contains("--select-first"), let first = m.bundle.liveMarkers.first(where: { $0.sheetId == m.sheets.dropFirst().first?.id }) {
                    m.focusOn(.marker(first.id))
                }
                #endif
            }
        }
    }

    private func title(_ model: EditorModel) -> String {
        model.bundle.project.address.isEmpty ? String(localized: "Untitled job") : model.bundle.project.address
    }

    /// The job's sections for this user: technicians don't get Money (prices stay with the office).
    private var tabs: [ProjectTab] {
        app.cloud.can(.prices) ? ProjectTab.allCases : ProjectTab.allCases.filter { $0 != .money }
    }

    /// iPhone: the sections in the tab bar, and the ones under More.
    private var phoneBar: [ProjectTab] {
        ProjectTabRoute.phoneTabs(office: app.cloud.can(.prices)).bar.compactMap { ProjectTab(rawValue: $0.rawValue) }
    }
    private var phoneMore: [ProjectTab] {
        ProjectTabRoute.phoneTabs(office: app.cloud.can(.prices)).more.compactMap { ProjectTab(rawValue: $0.rawValue) }
    }

    /// The tab bar's selection, read from and written to `tab`: a More section selects More.
    private var phoneSlot: Binding<PhoneSlot> {
        Binding(get: { phoneBar.contains(tab) ? .section(tab) : .more }, set: { slot in
            switch slot {
            case .section(let t): tab = t
            case .more: if !phoneMore.contains(tab) { tab = phoneMore.contains(lastMore) ? lastMore : (phoneMore.first ?? .overview) }
            }
        })
    }

    /// iPhone More: a section switch (Overview · Takeoff · Field) over the chosen section.
    @ViewBuilder
    private func moreSection(_ model: EditorModel) -> some View {
        let more = phoneMore
        let shown = more.contains(tab) ? tab : (more.contains(lastMore) ? lastMore : (more.first ?? .overview))
        VStack(spacing: 0) {
            Picker("Section", selection: Binding(get: { shown }, set: { tab = $0 })) {
                ForEach(more) { t in Text(t.title).tag(t) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal).padding(.vertical, 8)
            .background(Color(.systemBackground))
            content(model, shown)
        }
    }

    /// Opens a section (and a page inside it) by id. Used by the Overview's next step and the screenshot hooks.
    private func open(_ id: String, model: EditorModel) {
        guard let r = ProjectTab.resolve(id), tabs.contains(r.tab) else { return }
        tab = r.tab
        switch r.page {
        case .managePlans: if !model.sheets.isEmpty { model.showManagePlans = true }
        case .wiring: showWiring = true
        case nil: break
        }
    }

    @ViewBuilder
    private func content(_ model: EditorModel, _ tab: ProjectTab) -> some View {
        switch tab {
        case .overview:
            JobView(model: model) { id in open(id, model: model) }
        case .plan:
            if model.sheets.isEmpty {
                // No plans yet: the plan section is the import screen until the first one is in.
                SheetsView(model: model) {}
            } else {
                PlanEditorView(model: model)
            }
        case .takeoff: TakeoffView(model: model, showWiring: $showWiring)
        case .tasks: TaskListView(model: model).background(Color.paper)
        case .photos: PhotosView(model: model).background(Color.paper)
        case .money:
            if app.cloud.can(.prices) { MoneyView(model: model) } else { OfficeOnlyView(what: String(localized: "Quotes, invoices")) }
        case .field: JobFieldView(model: model)
        }
    }
}

/// Money: the job's pricing (EstimateView) with the way to its quotes and invoices.
struct MoneyView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel

    var body: some View {
        EstimateView(model: model)
            .safeAreaInset(edge: .top, spacing: 0) {
                if let url = serverPageURL(app.settings, WebLinks.quotes(job: model.bundle.project.id)) {
                    QuotesAndInvoicesLink(url: url)
                }
            }
    }
}

/// "Quotes & invoices" row above the pricing. Finalizing, sending and payments live on the web app for now.
private struct QuotesAndInvoicesLink: View {
    let url: URL
    var body: some View {
        Link(destination: url) {
            HStack(spacing: 12) {
                Image(systemName: "doc.text").font(.body.weight(.semibold)).foregroundStyle(Color.primary)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Quotes & invoices").font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                    Text("Finalize, send and record payments on the web").font(.caption).foregroundStyle(Color.pencil)
                }
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.right").font(.caption.weight(.semibold)).foregroundStyle(Color.pencil)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
        .accessibilityHint("Opens the job's quotes and invoices on the web")
    }
}

/// Field: today, checklists, daily logs, files, forms, RFIs, schedule and history (tasks and photos are sections of
/// their own).
struct JobFieldView: View {
    let model: EditorModel

    var body: some View {
        FieldView(model: model)
            .background(Color.paper)
    }
}

/// The billing notice above a job's content (only when there is one).
private struct JobBillingBanner: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        if app.cloud.billingBanner != nil {
            BillingBannerView(compact: true, outer: EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                .background(Color(.systemBackground))
        }
    }
}

private struct ExportPlacementKey: EnvironmentKey {
    static let defaultValue: ToolbarItemPlacement = .bottomBar
}

extension EnvironmentValues {
    /// Where export buttons go: bottom bar on iPad, top bar on iPhone (the tab bar owns the bottom).
    var exportPlacement: ToolbarItemPlacement {
        get { self[ExportPlacementKey.self] }
        set { self[ExportPlacementKey.self] = newValue }
    }
}
