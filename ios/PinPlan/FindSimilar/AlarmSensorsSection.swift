import SwiftUI
import PinPlanCore

// Add sensors (docs/find-similar.md, "Alarm sensors from openings"), inside the Find similar card: for the doors and
// windows on this plan, a door contact on each door, a window contact on each window and / or one glass-break per room
// with windows. The counts show first; a tap on a door or window on the plan leaves it out (FindSimilarOverlays); the
// plan shows where each sensor will go. Placing is one undo step (EditorModel.addMarkers). The maths is PinPlanCore's
// AlarmSensors (same as the web, tested with `swift test`).
struct AlarmSensorsSection: View {
    let model: EditorModel
    let sheet: Sheet
    let draft: FindSimilarUI.SensorsDraft

    private struct Option: Identifiable {
        let kind: AlarmSensors.SensorKind
        let label: LocalizedStringKey
        var id: String { kind.rawValue }
    }

    private var options: [Option] {
        [Option(kind: .door, label: "Door contact on each door"),
         Option(kind: .window, label: "Window contact on each window"),
         Option(kind: .glass, label: "Glass-break detector per room with windows")]
    }

    var body: some View {
        let ui = FindSimilarUI.shared
        let openings = ui.openings(model, sheet: sheet)
        // Count pins (Window ×12) count as their count.
        let doors: Int = AlarmSensors.openingCount(openings.filter { $0.kind == .door })
        let windows: Int = AlarmSensors.openingCount(openings.filter { $0.kind == .window })
        let all = ui.sensorPlan(model, sheet: sheet, kinds: Set(AlarmSensors.SensorKind.allCases))
        let plan = ui.sensorPlan(model, sheet: sheet)
        let missing = AlarmSensors.missingTypes(model.app.catalog)
        let n: Int = plan.placements.reduce(0) { $0 + $1.count }
        VStack(alignment: .leading, spacing: 8) {
            Label("Add alarm sensors", systemImage: "checkmark.shield").font(.subheadline.weight(.semibold))
            if openings.isEmpty {
                Text("No doors or windows on this floor yet. Count them first: Find similar, counted as Door, then as Window.")
                    .font(.footnote)
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Doors: \(doors) · Windows: \(windows)")
                    .font(.caption).monospacedDigit().foregroundStyle(Color.secondary)
                    .accessibilityIdentifier("alarm-openings")
                ForEach(options) { o in
                    let off = missing.contains(o.kind)
                    Button { ui.toggleKind(o.kind) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: !off && draft.kinds.contains(o.kind) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(off ? Color.secondary : Color.brand)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(o.label).foregroundStyle(Color.primary)
                                if o.kind == .glass {
                                    Text("Rooms come from each window’s room; windows without one are grouped by distance.")
                                        .font(.caption2).foregroundStyle(Color.secondary)
                                }
                                if off {
                                    Text("Not in your price list").font(.caption2).foregroundStyle(Color.secondary)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                            Text(verbatim: off ? "—" : "\(all.count(o.kind))").font(.subheadline.weight(.semibold)).monospacedDigit()
                        }
                        .font(.subheadline)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(off)
                    .accessibilityAddTraits(!off && draft.kinds.contains(o.kind) ? .isSelected : [])
                    .accessibilityIdentifier("alarm-kind-\(o.kind.rawValue)")
                }
                summary(plan)
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                    .accessibilityIdentifier("alarm-summary")
                let left = draft.excluded.filter { id in openings.contains { $0.id == id } }.count
                let covered = draft.kinds.reduce(0) { $0 + (plan.covered[$1] ?? 0) }
                VStack(alignment: .leading, spacing: 2) {
                    if left > 0 {
                        Text("Left out: \(left). Tap one again to take it back.")
                    } else {
                        Text("Tap a door or window on the plan to leave it out.")
                    }
                    if covered > 0 { Text("Already have their sensor: \(covered)") }
                }
                .font(.caption).foregroundStyle(Color.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Button { ui.placeSensors(model: model, sheet: sheet) } label: {
                    Label("Place sensors (\(n))", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.brand)
                .disabled(n == 0)
                .accessibilityIdentifier("alarm-place")
                Button("Cancel") { ui.closeSensors() }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("alarm-cancel")
            }
            .controlSize(.small)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("alarm-sensors")
    }

    /// "Door contacts: 14 · Window contacts: 22 · Glass-breaks: 6" (only what will be placed).
    private func summary(_ plan: AlarmSensors.Plan) -> Text {
        var parts: [String] = []
        if plan.count(.door) > 0 { parts.append(String(localized: "Door contacts: \(plan.count(.door))")) }
        if plan.count(.window) > 0 { parts.append(String(localized: "Window contacts: \(plan.count(.window))")) }
        if plan.count(.glass) > 0 { parts.append(String(localized: "Glass-breaks: \(plan.count(.glass))")) }
        return parts.isEmpty ? Text("Nothing to add") : Text(verbatim: parts.joined(separator: " · "))
    }
}
