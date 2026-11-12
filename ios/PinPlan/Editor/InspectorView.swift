import SwiftUI
import PhotosUI
import PinPlanCore

/// Edit the selected device, run or closet.
struct InspectorView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let selection: Selection

    var body: some View {
        Form {
            switch selection {
            case .marker(let id): if let m = model.bundle.liveMarkers.first(where: { $0.id == id }) { MarkerForm(model: model, marker: m) }
            case .run(let id): if let r = model.bundle.liveRuns.first(where: { $0.id == id }) { RunForm(model: model, run: r) }
            case .closet(let id): if let c = model.bundle.liveClosets.first(where: { $0.id == id }) { ClosetForm(model: model, closet: c) }
            }
        }
    }
}

private struct MarkerForm: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let marker: Marker
    @State private var photo: PhotosPickerItem?

    private func update(_ change: @escaping (inout Marker) -> Void) {
        model.edit { $0.updateMarker(marker.id, pricing: model.pricing, change) }
    }

    var body: some View {
        let type = app.type(marker.deviceTypeId)
        Section {
            HStack(spacing: 12) {
                DeviceSymbol(type: type, size: 40, tentative: marker.tentative)
                VStack(alignment: .leading) {
                    Text(marker.label).font(.headline)
                    Text([type?.name, marker.room.isEmpty ? nil : marker.room].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
            }
            Picker("Device", selection: Binding(get: { marker.deviceTypeId }, set: { v in update { $0.deviceTypeId = v } })) {
                ForEach(app.liveCatalog.filter { $0.kind == .device }) { Text($0.name).tag($0.id) }
            }
            Toggle(isOn: Binding(get: { marker.tentative }, set: { v in update { $0.tentative = v } })) {
                VStack(alignment: .leading) { Text("Tentative (?)"); Text("Listed separately; optional on the estimate").font(.caption).foregroundStyle(.secondary) }
            }
            .tint(.orange)
        }
        Section {
            LabeledContent("Label") { CommitField(title: "Label", value: marker.label) { v in update { $0.label = v } }.multilineTextAlignment(.trailing) }
            LabeledContent("Room") { CommitField(title: "Room", value: marker.room, prompt: "e.g. Kitchen") { v in update { $0.room = v } }.multilineTextAlignment(.trailing) }
            Picker("Mount", selection: Binding(get: { marker.mount }, set: { v in update { $0.mount = v } })) {
                ForEach(Mount.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
            }
            Picker("Wire", selection: Binding(get: { marker.wireType }, set: { v in update { $0.wireType = v } })) {
                ForEach(Array(Set(Catalog.wireTypes + [marker.wireType])).sorted(), id: \.self) { Text($0).tag($0) }
            }
        }
        Section("Home run") {
            Picker("Closet", selection: Binding(get: { marker.closetId ?? "" }, set: { v in update { $0.closetId = v.isEmpty ? nil : v } })) {
                Text("None").tag("")
                ForEach(model.bundle.liveClosets) { c in Text("\(c.name) (\(model.sheets.first { $0.id == c.sheetId }?.name ?? ""))").tag(c.id) }
            }
            if marker.closetId != nil {
                let run = model.bundle.liveRuns.first { $0.kind == .wire && $0.markerId == marker.id }
                LabeledContent("Cable", value: run.flatMap(Geometry.runLengthFt).map { "\($0.clean) ft" } ?? "not drawn")
                Button(run == nil ? "Draw home run" : "Redraw home run") {
                    let cat = app.catalog
                    model.edit { $0.autoHomeRuns(catalog: cat, pricing: model.pricing, markerId: marker.id) }
                }
            }
        }
        Section("Notes") {
            CommitField(title: "Notes", value: marker.notes, prompt: "Notes for the crew") { v in update { $0.notes = v } }
        }
        Section("Photo") {
            if let id = marker.photoId, let img = app.store.image(id) {
                Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 180).clipShape(RoundedRectangle(cornerRadius: 10))
            }
            PhotosPicker(selection: $photo, matching: .images) { Label(marker.photoId == nil ? "Add photo" : "Replace photo", systemImage: "camera") }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    let small = PlanImporter.normalized(img)
                    if let id = app.store.saveImage(small, quality: 0.8) { update { $0.photoId = id } }
                }
                photo = nil
            }
        }
        Section {
            Button {
                let m = marker
                var newId = ""
                if let t = app.type(m.deviceTypeId) {
                    model.edit { b in
                        newId = b.addMarker(type: t, sheetId: m.sheetId, x: m.x + 0.015, y: m.y + 0.015, room: m.room, tentative: m.tentative).id
                        b.updateMarker(newId, pricing: model.pricing) { $0.mount = m.mount; $0.wireType = m.wireType; $0.closetId = m.closetId }
                    }
                    model.selection = .marker(newId)
                }
            } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete device", systemImage: "trash") }
        }
    }
}

private struct RunForm: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let run: Run

    private func update(_ change: @escaping (inout Run) -> Void) { model.edit { $0.updateRun(run.id, change) } }

    var body: some View {
        let len = Geometry.runLengthFt(run)
        Section {
            LabeledContent(run.kind == .wire ? "Wire run" : run.kind == .stair ? "Stair LED" : "LED run", value: len.map { "\($0.clean) \(run.kind == .wire ? "ft" : "LF")" } ?? "no length")
            if run.kind != .wire {
                Picker("LED type", selection: Binding(get: { run.deviceTypeId ?? "" }, set: { v in update { $0.deviceTypeId = v } })) {
                    ForEach(app.liveCatalog.filter { $0.kind == .led }) { Text($0.name).tag($0.id) }
                }
                LabeledContent("Zone #") { CommitField(title: "Zone", value: run.zone ?? "", keyboard: .numberPad) { v in update { $0.zone = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Switch") { CommitField(title: "Switch", value: run.switchLabel ?? "", prompt: "S21") { v in update { $0.switchLabel = v } }.multilineTextAlignment(.trailing) }
            }
            if run.kind == .stair {
                LabeledContent("Steps") { CommitField(title: "Steps", value: run.steps.map(String.init) ?? "", keyboard: .numberPad) { v in update { $0.steps = Int(v) } }.multilineTextAlignment(.trailing) }
                LabeledContent("LF per step") { CommitField(title: "LF per step", value: run.lfPerStep.map { $0.clean } ?? "", keyboard: .decimalPad) { v in update { $0.lfPerStep = Geometry.parseFeet(v) } }.multilineTextAlignment(.trailing) }
            } else {
                LabeledContent(run.kind == .wire ? "Length override (ft)" : "Typed LF") {
                    CommitField(title: "Length", value: run.typedFt.map { $0.clean } ?? "", prompt: run.measuredFt.map { "measured \($0.clean)" } ?? "type LF", keyboard: .decimalPad) { v in
                        update { $0.typedFt = v.isEmpty ? nil : Geometry.parseFeet(v) }
                    }.multilineTextAlignment(.trailing)
                }
                if let m = run.measuredFt { Text("\(run.kind == .wire ? "Estimated" : "Measured") \(m.clean) ft\(run.typedFt != nil ? " — typed value wins" : "")").font(.caption).foregroundStyle(.secondary) }
            }
            if run.kind == .wire {
                Picker("Wire", selection: Binding(get: { run.wireType ?? "Cat6" }, set: { v in update { $0.wireType = v } })) {
                    ForEach(Catalog.wireTypes, id: \.self) { Text($0).tag($0) }
                }
            }
            Toggle("Tentative (?)", isOn: Binding(get: { run.tentative == true }, set: { v in update { $0.tentative = v } })).tint(.orange)
        } footer: { Text("Drag the white handles on the plan to reshape the run.") }
        Section {
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete run", systemImage: "trash") }
        }
    }
}

private struct ClosetForm: View {
    let model: EditorModel
    let closet: Closet

    var body: some View {
        Section {
            LabeledContent("Name") {
                CommitField(title: "Name", value: closet.name) { v in model.edit { $0.updateCloset(closet.id, pricing: model.pricing) { $0.name = v } } }.multilineTextAlignment(.trailing)
            }
            Picker("Kind", selection: Binding(get: { closet.kind }, set: { v in model.edit { $0.updateCloset(closet.id, pricing: model.pricing) { $0.kind = v } } })) {
                ForEach(Catalog.closetKinds, id: \.id) { Text($0.name).tag($0.id) }
            }
            LabeledContent("Devices home-run here", value: "\(model.bundle.liveMarkers.filter { $0.closetId == closet.id }.count)")
        }
        Section {
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete closet", systemImage: "trash") }
        }
    }
}
