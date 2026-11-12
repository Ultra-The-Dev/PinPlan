import SwiftUI
import PinPlanCore

/// AI scan assist via the PinPlan server: suggestions are reviewed here and only counted once accepted.
struct ScanSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let sheet: Sheet
    @State private var busy = false
    @State private var error: String?
    @State private var result: APIClient.ScanResult?
    @State private var accepted: Set<String> = []
    @State private var types: [String: String] = [:]
    @State private var threshold = 0.6

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Claude reads the sheet and suggests devices and LED callouts. Nothing is counted until you accept it.")
                        .font(.callout).foregroundStyle(.secondary)
                    Button { run(titleOnly: false) } label: { Label(busy ? "Scanning…" : "Scan this sheet", systemImage: "sparkles") }.disabled(busy)
                    Button { run(titleOnly: true) } label: { Label("Detect sheet name", systemImage: "textformat") }.disabled(busy)
                    if APIClient(settings: app.settings) == nil {
                        Text("Set your PinPlan server address in Settings to use AI scan.").font(.caption).foregroundStyle(.orange)
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                if let r = result {
                    if let name = r.floorName, !name.isEmpty {
                        Section("Sheet name") {
                            HStack {
                                Text(name)
                                Spacer()
                                Button("Use") {
                                    model.edit { b in if let i = b.sheets.firstIndex(where: { $0.id == sheet.id }) { b.sheets[i].name = name } }
                                }
                            }
                        }
                    }
                    let symbols = r.symbols ?? []
                    if !symbols.isEmpty {
                        Section {
                            Slider(value: $threshold, in: 0...1) { Text("Confidence") }
                            Button("Select all ≥ \(Int(threshold * 100))%") { accepted = Set(symbols.filter { $0.confidence >= threshold }.map(\.id)) }
                            ForEach(symbols) { s in
                                HStack {
                                    Image(systemName: accepted.contains(s.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(accepted.contains(s.id) ? Color.brand : .secondary)
                                        .onTapGesture { toggle(s.id) }
                                    Picker(s.symbolText ?? "?", selection: Binding(get: { types[s.id] ?? s.deviceTypeId ?? "" }, set: { types[s.id] = $0 })) {
                                        Text("Choose device").tag("")
                                        ForEach(app.liveCatalog.filter { $0.kind == .device }) { Text($0.name).tag($0.id) }
                                    }
                                    Text("\(Int(s.confidence * 100))%").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                    if s.tentative == true { Chip(text: "?", tint: .orange) }
                                }
                            }
                        } header: { Text("Devices (\(symbols.count))") }
                    }
                    let callouts = r.ledCallouts ?? []
                    if !callouts.isEmpty {
                        Section("LED callouts (\(callouts.count))") {
                            ForEach(Array(callouts.enumerated()), id: \.offset) { i, c in
                                let key = "led-\(i)"
                                HStack {
                                    Image(systemName: accepted.contains(key) ? "checkmark.circle.fill" : "circle").foregroundStyle(accepted.contains(key) ? Color.brand : .secondary)
                                    Text(["Zone \(c.zone ?? "?")", c.lf.map { "\($0.clean) LF" }, c.switchLabel].compactMap { $0 }.joined(separator: " · "))
                                    Spacer()
                                    Text("\(Int(c.confidence * 100))%").font(.caption).foregroundStyle(.secondary)
                                }
                                .contentShape(Rectangle())
                                .onTapGesture { toggle(key) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("AI scan · \(sheet.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Accept \(accepted.count)") { accept() }.disabled(accepted.isEmpty) }
            }
        }
    }

    private func toggle(_ id: String) { if accepted.contains(id) { accepted.remove(id) } else { accepted.insert(id) } }

    private func run(titleOnly: Bool) {
        guard let client = APIClient(settings: app.settings) else { error = "Set your PinPlan server address in Settings."; return }
        guard let image = app.store.image(sheet.imageId) else { return }
        busy = true
        error = nil
        Task {
            do {
                let r = try await client.scan(image: image, catalog: app.liveCatalog, titleOnly: titleOnly)
                result = r
                accepted = Set((r.symbols ?? []).filter { $0.confidence >= threshold && $0.deviceTypeId != nil }.map(\.id))
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func accept() {
        guard let r = result else { return }
        let catalog = app.catalog
        var n = 0
        model.edit { b in
            for s in r.symbols ?? [] where accepted.contains(s.id) {
                guard let id = types[s.id] ?? s.deviceTypeId, let t = catalog.first(where: { $0.id == id }) else { continue }
                b.addMarker(type: t, sheetId: sheet.id, x: s.x, y: s.y, tentative: s.tentative == true || (s.symbolText ?? "").contains("?"))
                n += 1
            }
            for (i, c) in (r.ledCallouts ?? []).enumerated() where accepted.contains("led-\(i)") {
                b.addRun(Run(projectId: b.project.id, sheetId: sheet.id, kind: .led, deviceTypeId: "led-ceiling",
                             points: [max(0, c.x - 0.02), c.y, min(1, c.x + 0.02), c.y], typedFt: c.lf, zone: c.zone, switchLabel: c.switchLabel))
                n += 1
            }
        }
        model.say("Accepted \(n) suggestion\(n == 1 ? "" : "s")")
        dismiss()
    }
}
