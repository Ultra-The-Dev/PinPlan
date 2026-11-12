import SwiftUI
import PinPlanCore

enum ProjectTab: String, CaseIterable, Identifiable {
    case plan, sheets, takeoff, estimate, crew, job
    var id: String { rawValue }
    var title: String { rawValue == "job" ? "Job" : rawValue.capitalized }
    var icon: String {
        switch self {
        case .plan: return "mappin.and.ellipse"
        case .sheets: return "doc.on.doc"
        case .takeoff: return "checklist"
        case .estimate: return "dollarsign.square"
        case .crew: return "wrench.and.screwdriver"
        case .job: return "info.circle"
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
                        ForEach(ProjectTab.allCases) { t in
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
                                    ForEach(ProjectTab.allCases) { t in Label(t.title, systemImage: t.icon).tag(t) }
                                }
                                .pickerStyle(.segmented)
                                .frame(maxWidth: 620)
                            }
                        }
                }
            } else {
                ProgressView()
            }
        }
        .environment(\.exportPlacement, hSize == .compact ? .topBarTrailing : .bottomBar)
        .onAppear {
            if model == nil {
                let m = EditorModel(bundle: bundle, app: app)
                model = m
                if m.sheets.isEmpty { tab = .sheets }
                // Screenshot/automation hook: `--tab estimate` etc.
                let args = ProcessInfo.processInfo.arguments
                if let i = args.firstIndex(of: "--tab"), args.indices.contains(i + 1), let t = ProjectTab(rawValue: args[i + 1]) { tab = t }
                if args.contains("--select-first"), let first = m.bundle.liveMarkers.first(where: { $0.sheetId == m.sheets.dropFirst().first?.id }) {
                    m.focusOn(.marker(first.id))
                }
            }
        }
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
        case .estimate: EstimateView(model: model)
        case .crew: CrewView(model: model)
        case .job: JobView(model: model)
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
