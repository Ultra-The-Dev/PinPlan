import SwiftUI
import PinPlanCore

/// Edit several devices at once. Each change is one undo step.
struct BulkInspectorView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var room = ""

    var body: some View {
        let ids = model.multi
        let ms = model.bundle.liveMarkers.filter { ids.contains($0.id) }
        let typeIds = ms.map(\.deviceTypeId).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        let sameCables = ms.allSatisfy { $0.cables == ms.first?.cables }
        let cables = sameCables ? (ms.first?.cables ?? []) : []
        let oneType = typeIds.count == 1 ? typeIds[0] : nil
        let allTentative = !ms.isEmpty && ms.allSatisfy(\.tentative)
        SentenceForm {
            Section {
                ForEach(typeIds, id: \.self) { t in
                    HStack {
                        DeviceSymbol(type: app.type(t), size: 24)
                        Text(app.type(t)?.name ?? t)
                        Spacer()
                        Text("× \(ms.filter { $0.deviceTypeId == t }.quantitySum)").foregroundStyle(.secondary).monospacedDigit()
                    }
                }
                Toggle("Tap devices to add or remove", isOn: Binding(get: { model.multiMode }, set: { model.multiMode = $0 }))
            }
            Section(sentence: String(localized: "Room")) {
                HStack {
                    TextField(Set(ms.map(\.room)).count == 1 ? (ms.first?.room.isEmpty == false ? ms.first!.room : String(localized: "e.g. Kitchen")) : String(localized: "Mixed"), text: $room)
                    Button("Apply") { let r = room.trimmingCharacters(in: .whitespaces); model.bulkEdit(ids) { $0.room = r }; room = "" }
                        .disabled(room.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            if let oneType {
                Section(sentence: String(localized: "Product")) {
                    Menu {
                        Button("Job’s choice") { model.bulkEdit(ids) { $0.productId = nil } }
                        ForEach(app.products.filter { $0.deviceTypeId == oneType && $0.archived != true && $0.deleted != true }) { p in
                            Button(p.title) { model.bulkEdit(ids) { $0.productId = p.id } }
                        }
                    } label: { Label("Set product for all \(ms.count)", systemImage: "tag") }
                }
            }
            Section {
                ForEach(Cables.counts(cables)) { c in
                    Stepper(value: Binding(get: { c.count }, set: { n in let list = Cables.setting(c.type, count: n, in: cables); model.bulkEdit(ids) { $0.setCables(list) } }), in: 0...12) {
                        HStack { Circle().fill(wireColor(c.type)).frame(width: 9, height: 9); Text("\(c.type) × \(c.count)") }
                    }
                }
                Menu {
                    ForEach(Trades.wireTypes(for: app.trades).filter { !cables.contains($0) }, id: \.self) { w in
                        Button(w) { let list = cables + [w]; model.bulkEdit(ids) { $0.setCables(list) } }
                    }
                } label: { Label("Add cable", systemImage: "plus") }
            } header: { Text("Cables").textCase(nil) } footer: {
                Text(sameCables ? "Applies to all \(ms.count) devices." : "Cables differ between these devices — a change replaces each device’s cables.")
            }
            Section(sentence: String(localized: "Home run")) {
                Menu {
                    Button("None") { model.bulkEdit(ids) { $0.closetId = nil } }
                    ForEach(model.bundle.liveClosets) { c in
                        Button("\(c.name) (\(model.sheets.first { $0.id == c.sheetId }?.name ?? ""))") { model.bulkEdit(ids) { $0.closetId = c.id } }
                    }
                } label: { Label("Set closet for all \(ms.count)", systemImage: "square.stack.3d.up") }
                Button {
                    let n = model.homeRuns(for: ids)
                    model.say(n > 0 ? String(localized: "Drew \(n) home runs") : String(localized: "Place an equipment closet first"))
                } label: { Label("Draw home runs", systemImage: "cable.connector") }
            }
            Section {
                Toggle("Optional (?)", isOn: Binding(get: { allTentative }, set: { v in model.bulkEdit(ids) { $0.tentative = v } }))
            }
            Section {
                Button(role: .destructive) { model.bulkDelete(ids) } label: { Label("Delete \(ms.count) devices", systemImage: "trash") }
            }
        }
    }
}

/// Quick ways into a multi-selection from one device.
struct SelectMoreSection: View {
    let model: EditorModel
    let marker: Marker

    var body: some View {
        let all = model.bundle.liveMarkers
        let floor = all.filter { $0.deviceTypeId == marker.deviceTypeId && $0.sheetId == marker.sheetId }.map(\.id)
        let job = all.filter { $0.deviceTypeId == marker.deviceTypeId }.map(\.id)
        let room = marker.room.isEmpty ? [] : all.filter { $0.sheetId == marker.sheetId && $0.room == marker.room }.map(\.id)
        let pick: ([String]) -> Void = { ids in model.selectMany([marker.id] + ids.filter { $0 != marker.id }) }
        Section {
            if floor.count > 1 { Button("All like this on this floor (\(floor.count))") { pick(floor) } }
            if job.count > floor.count { Button("All like this in the job (\(job.count))") { pick(job) } }
            if room.count > 1 { Button("Everything in \(marker.room) (\(room.count))") { pick(room) } }
            Button("Tap to pick several…") { model.multiMode = true }
        } header: { Text("Select more").textCase(nil) } footer: { Text("Then change room, product, cables or closet for all of them at once.") }
    }
}
