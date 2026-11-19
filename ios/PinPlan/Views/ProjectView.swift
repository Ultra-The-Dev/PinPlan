import SwiftUI
import PinPlanCore

enum ProjectTab: String, CaseIterable, Identifiable {
    case plan, photos, field, sheets, takeoff, estimate, crew, job
    var id: String { rawValue }
    var title: String { rawValue == "job" ? "Job" : rawValue.capitalized }
    var icon: String {
        switch self {
        case .plan: return "mappin.and.ellipse"
        case .sheets: return "doc.on.doc"
        case .takeoff: return "list.number"
        case .estimate: return "dollarsign.square"
        case .crew: return "wrench.and.screwdriver"
        case .job: return "info.circle"
        case .photos: return "camera"
        case .field: return "checklist.checked"
        }
    }
}

struct ProjectView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    let bundle: ProjectBundle
    @State private var model: EditorModel?
    @State private var tab: ProjectTab = .plan

    var body: some View {
        Group {
            if let model {
                if hSize == .compact {
                    // iPhone: native bottom tab bar.
                    TabView(selection: $tab) {
                        ForEach(tabs) { t in
                            content(model, t)
                                .tabItem { Label(t.title, systemImage: t.icon) }
                                .tag(t)
                        }
                    }
                    .navigationTitle(model.bundle.project.address.isEmpty ? "Untitled job" : model.bundle.project.address)
                    .navigationBarTitleDisplayMode(.inline)
                } else {
                    // iPad: section picker in the navigation bar.
                    content(model, tab)
                        .navigationTitle(model.bundle.project.address.isEmpty ? "Untitled job" : model.bundle.project.address)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .principal) {
                                Picker("Section", selection: $tab) {
                                    ForEach(tabs) { t in Text(t.title).tag(t) }   // words, not icon-only segments
                                }
                                .pickerStyle(.segmented)
                                .frame(maxWidth: 760)
                            }
                        }
                }
            } else {
                ProgressView()
            }
        }
        // Trial ending, needs attention or read-only: say so in the job too.
        .safeAreaInset(edge: .top, spacing: 0) { JobBillingBanner() }
        .environment(\.exportPlacement, hSize == .compact ? .topBarTrailing : .bottomBar)
        // A technician has no Estimate tab (also when the role arrives with a sync while the job is open).
        .onChange(of: app.cloud.can(.prices)) { _, ok in if !ok && tab == .estimate { tab = .plan } }
        .onAppear {
            if model == nil {
                let m = EditorModel(bundle: bundle, app: app)
                model = m
                if m.sheets.isEmpty { tab = .sheets }
                if app.pendingImport?.projectId == bundle.project.id { tab = .sheets }
                // Screenshot/automation hook: `--tab estimate` etc.
                let args = ProcessInfo.processInfo.arguments
                if let i = args.firstIndex(of: "--tab"), args.indices.contains(i + 1), let t = ProjectTab(rawValue: args[i + 1]), tabs.contains(t) { tab = t }
                if args.contains("--select-first"), let first = m.bundle.liveMarkers.first(where: { $0.sheetId == m.sheets.dropFirst().first?.id }) {
                    m.focusOn(.marker(first.id))
                }
            }
        }
    }

    /// The job's sections for this user: technicians don't get the Estimate tab (prices stay with the office).
    private var tabs: [ProjectTab] {
        app.cloud.can(.prices) ? ProjectTab.allCases : ProjectTab.allCases.filter { $0 != .estimate }
    }

    @ViewBuilder
    private func content(_ model: EditorModel, _ tab: ProjectTab) -> some View {
        switch tab {
        case .plan:
            if model.sheets.isEmpty {
                ContentUnavailableView {
                    Label("No plan sheets yet", systemImage: "doc.badge.plus")
                } description: {
                    Text("Import the plan set (PDF, photos or a scan) to start placing devices.")
                } actions: {
                    Button("Import plans") { self.tab = .sheets }.buttonStyle(.borderedProminent)
                }
            } else {
                PlanEditorView(model: model)
            }
        case .sheets: SheetsView(model: model) { self.tab = .plan }
        case .takeoff: TakeoffView(model: model)
        case .estimate:
            if app.cloud.can(.prices) { EstimateView(model: model) } else { OfficeOnlyView(what: "The estimate") }
        case .crew: CrewView(model: model)
        case .job: JobView(model: model) { self.tab = $0 }
        case .photos: PhotosView(model: model)
        case .field: FieldView(model: model)
        }
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
