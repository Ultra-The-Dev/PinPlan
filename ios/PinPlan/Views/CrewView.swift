import SwiftUI
import PinPlanCore

/// Wiring-only view for the crew (no prices): home-run schedule and wiring PDFs by layer.
struct CrewView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var layers: Set<Layer> = Set(Layer.allCases)
    @State private var share: SharedFile?
    @State private var busy = false

    var body: some View {
        let order = Dictionary(uniqueKeysWithValues: model.sheets.map { ($0.id, $0.order) })
        let rows = model.bundle.liveMarkers.filter { app.type($0.deviceTypeId)?.kind == .device }
            .sorted { (order[$0.sheetId] ?? 0, $0.label) < (order[$1.sheetId] ?? 0, $1.label) }
        let tot = model.takeoff.total
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Layer.allCases) { l in
                            let on = layers.contains(l)
                            Button { if on { layers.remove(l) } else { layers.insert(l) } } label: {
                                Text(Catalog.layerNames[l] ?? l.rawValue).font(.subheadline)
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(on ? Color.brand.opacity(0.14) : Color(.tertiarySystemFill), in: Capsule())
                                    .foregroundStyle(on ? Color.brand : .secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Button { pdf() } label: { Label(busy ? "Building…" : "Wiring PDF (selected layers)", systemImage: "doc.richtext") }.disabled(busy || model.sheets.isEmpty)
                Button { model.autoHomeRuns(sheetOnly: false) } label: { Label("Auto-draw all home runs", systemImage: "cable.connector") }
            } footer: { Text("Where each wire goes and which type — no prices.") }
            if !tot.wireFt.isEmpty {
                Section("Cable") {
                    ForEach(tot.wireFt.keys.sorted(), id: \.self) { w in
                        LabeledContent(w, value: "\((tot.wireFt[w] ?? 0).clean) ft · \(tot.wireRuns[w] ?? 0) runs")
                    }
                }
            }
            Section("Home-run schedule") {
                ForEach(rows) { m in
                    let run = model.bundle.liveRuns.first { $0.kind == .wire && $0.markerId == m.id }
                    Button { model.focusOn(.marker(m.id)) } label: {
                        HStack {
                            DeviceSymbol(type: app.type(m.deviceTypeId), size: 24, tentative: m.tentative)
                            VStack(alignment: .leading) {
                                Text(m.label).bold()
                                Text([model.sheets.first { $0.id == m.sheetId }?.name, m.room.isEmpty ? nil : m.room, m.wireType].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text(model.bundle.liveClosets.first { $0.id == m.closetId }?.name ?? "No closet").font(.caption)
                                Text(run.flatMap(Geometry.runLengthFt).map { "\($0.clean) ft" } ?? "—").font(.caption.bold()).monospacedDigit()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                if rows.isEmpty { Text("No devices placed yet.").foregroundStyle(.secondary) }
            }
        }
        .shareSheet($share)
    }

    private func pdf() {
        busy = true
        let bundle = model.bundle, catalog = app.catalog, store = app.store, sel = layers
        Task.detached(priority: .userInitiated) {
            let data = PDFExporter.planSheets(bundle: bundle, catalog: catalog, crew: true, layers: sel) { store.image($0) }
            let url = PDFExporter.write(data, name: "\(slug(bundle.project.address))-crew-wiring.pdf")
            await MainActor.run { busy = false; share = SharedFile(url: url) }
        }
    }
}
