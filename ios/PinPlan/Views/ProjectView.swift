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
                content(model)
                    .navigationTitle(model.bundle.project.address.isEmpty ? "Untitled job" : model.bundle.project.address)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .principal) {
                            Picker("Section", selection: $tab) {
                                ForEach(ProjectTab.allCases) { t in
                                    if hSize == .compact { Image(systemName: t.icon).tag(t) } else { Label(t.title, systemImage: t.icon).tag(t) }
                                }
                            }
                            .pickerStyle(.segmented)
                            .frame(maxWidth: hSize == .compact ? 300 : 620)
                        }
                    }
            } else {
                ProgressView()
            }
        }
        .onAppear {
            if model == nil {
                let m = EditorModel(bundle: bundle, app: app)
                model = m
                if m.sheets.isEmpty { tab = .sheets }
            }
        }
    }

    @ViewBuilder
    private func content(_ model: EditorModel) -> some View {
        switch tab {
        case .plan:
            if model.sheets.isEmpty {
                ContentUnavailableView {
                    Label("No plan sheets yet", systemImage: "doc.badge.plus")
                } description: {
                    Text("Import the plan set (PDF, photos or a scan) to start placing devices.")
                } actions: {
                    Button("Import plans") { tab = .sheets }.buttonStyle(.borderedProminent)
                }
            } else {
                PlanEditorView(model: model)
            }
        case .sheets: SheetsView(model: model) { tab = .plan }
        case .takeoff: TakeoffView(model: model)
        case .estimate: EstimateView(model: model)
        case .crew: CrewView(model: model)
        case .job: JobView(model: model)
        }
    }
}
