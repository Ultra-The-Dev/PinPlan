import SwiftUI
import PinPlanCore

/// Electrical panel schedule for the crew: each panel's circuits with breaker, what they feed, device count, wire and
/// load. Worked out from the plan (PanelSchedule.swift, same rules as the web's panel schedule). No prices.
struct PanelScheduleView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?

    var body: some View {
        let panels = PanelSchedule.build(model.bundle, catalog: app.catalog)
        SentenceList {
            if panels.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("No panels yet").font(.headline)
                        Text("Place a panel on the plan, then connect devices to it and give them circuit numbers.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section {
                    Button { shareCSV(panels) } label: { Label("Share CSV", systemImage: "tablecells") }
                } footer: { Text("Worked out from the plan: circuits, breakers, devices, wire and load. No prices.") }
                ForEach(panels, id: \.closetId) { p in
                    Section {
                        ForEach(Array(p.circuits.enumerated()), id: \.offset) { _, c in CircuitRow(circuit: c) }
                        LabeledContent {
                            Text(PanelSchedule.totalLine(p)).monospacedDigit()
                        } label: { Text("Total").bold() }
                    } header: {
                        SentenceHeader(title: p.floor.isEmpty ? p.name : "\(p.name) · \(p.floor)")
                    }
                }
            }
        }
        .navigationTitle("Panel schedule")
        .shareSheet($share)
    }

    private func shareCSV(_ panels: [PanelSchedule.Panel]) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(model.bundle.project.address))-panel-schedule.csv")
        try? PanelSchedule.csv(panels).write(to: url, atomically: true, encoding: .utf8)
        share = SharedFile(url: url)
    }
}

private struct CircuitRow: View {
    let circuit: PanelSchedule.Circuit

    var body: some View {
        let c = circuit
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(c.numberLabel).font(.body.weight(.semibold)).monospacedDigit().frame(minWidth: 44, alignment: .leading)
                .foregroundStyle(c.number == PanelSchedule.unassigned ? Color.orange : Color.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.description.isEmpty ? "—" : c.description)
                Text(details).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(c.breakerLabel + (c.breakerGuessed ? "?" : "")).monospacedDigit()
                Text("\(PanelSchedule.number(c.va)) VA").font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
        }
        .opacity(c.tentative ? 0.6 : 1)
        .accessibilityElement(children: .combine)
    }

    private var details: String {
        var parts: [String] = []
        // "2 × Receptacle, 1 × Light" already counts them; otherwise just the number.
        parts.append(circuit.devicesText.isEmpty ? "\(circuit.devices) device\(circuit.devices == 1 ? "" : "s")" : circuit.devicesText)
        if !circuit.wire.isEmpty { parts.append(circuit.wire + (circuit.wireFt.map { " · \(PanelSchedule.number($0)) ft" } ?? "")) }
        return parts.joined(separator: " · ")
    }
}
