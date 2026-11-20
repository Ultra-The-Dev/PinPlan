import SwiftUI
import PinPlanCore

/// A job's five sections, the same on the web, iPad and iPhone (docs/ux-audit.md):
/// Overview · Plan (+ manage plans) · Takeoff (+ wiring sheets) · Money (office only) · Field (photos, checklists, logs).
enum ProjectTab: String, CaseIterable, Identifiable {
    case overview, plan, takeoff, money, field
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .overview: return "house"
        case .plan: return "mappin.and.ellipse"
        case .takeoff: return "list.number"
        case .money: return "dollarsign.circle"
        case .field: return "checklist.checked"
        }
    }

    /// A page inside a section that a link can open straight away.
    enum Page { case managePlans, wiring, photos }

    /// Where a tab id leads. Takes this enum's ids plus the older and web ids (JobSummary's next steps use the web
    /// ids: plan, sheets, photos, field, takeoff, estimate, crew, info).
    static func resolve(_ id: String) -> (tab: ProjectTab, page: Page?)? {
        if let t = ProjectTab(rawValue: id) { return (t, nil) }
        switch id {
        case "info", "job": return (.overview, nil)
        case "sheets": return (.plan, .managePlans)
        case "crew", "wiring": return (.takeoff, .wiring)
        case "estimate", "billing", "pricing": return (.money, nil)
        case "photos": return (.field, .photos)
        default: return nil
        }
    }
}

struct ProjectView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    let bundle: ProjectBundle
    @State private var model: EditorModel?
    @State private var tab: ProjectTab = .overview
    @State private var showWiring = false
    @State private var showPhotos = false

    var body: some View {
        Group {
            if let model {
                if hSize == .compact {
                    // iPhone: native bottom tab bar (five sections at most, so nothing hides under "More").
                    TabView(selection: $tab) {
                        ForEach(tabs) { t in
                            content(model, t)
                                .tabItem { Label(t.title, systemImage: t.icon) }
                                .tag(t)
                        }
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
                                Picker("Section", selection: $tab) {
                                    ForEach(tabs) { t in Text(t.title).tag(t) }   // words, not icon-only segments
                                }
                                .pickerStyle(.segmented)
                                .frame(maxWidth: 560)
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
        // Every plan deleted from "Add or manage plans": the plan section is the import screen again, so don't let
        // the closed sheet pop back up after the next import.
        .onChange(of: model?.sheets.isEmpty ?? false) { _, empty in if empty { model?.showManagePlans = false } }
        .onAppear {
            if model == nil {
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
        model.bundle.project.address.isEmpty ? "Untitled job" : model.bundle.project.address
    }

    /// The job's sections for this user: technicians don't get Money (prices stay with the office).
    private var tabs: [ProjectTab] {
        app.cloud.can(.prices) ? ProjectTab.allCases : ProjectTab.allCases.filter { $0 != .money }
    }

    /// Opens a section (and a page inside it) by id. Used by the Overview's next step and the screenshot hooks.
    private func open(_ id: String, model: EditorModel) {
        guard let r = ProjectTab.resolve(id), tabs.contains(r.tab) else { return }
        tab = r.tab
        switch r.page {
        case .managePlans: if !model.sheets.isEmpty { model.showManagePlans = true }
        case .wiring: showWiring = true
        case .photos: showPhotos = true
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
        case .money:
            if app.cloud.can(.prices) { MoneyView(model: model) } else { OfficeOnlyView(what: "Quotes, invoices") }
        case .field: JobFieldView(model: model, photos: $showPhotos)
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
                if let url = serverPageURL(app.settings, "project?id=\(model.bundle.project.id)&tab=billing") {
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

/// Field: photos, plus checklists, daily logs, files, forms, tasks and history.
struct JobFieldView: View {
    let model: EditorModel
    @Binding var photos: Bool

    var body: some View {
        VStack(spacing: 0) {
            Picker("Field", selection: $photos) {
                Text("Checklists & logs").tag(false)
                Text("Photos").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal).padding(.top, 8)
            .frame(maxWidth: 520)
            if photos { PhotosView(model: model) } else { FieldView(model: model) }
        }
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
