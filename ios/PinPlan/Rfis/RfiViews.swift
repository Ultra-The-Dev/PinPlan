import SwiftUI
import PinPlanCore

// RFIs (questions to the GC / architect / owner) in Field › RFIs: the list with status and who has to act ("With us" /
// "With them"), the detail with the answer, and "New RFI" from the field — subject, question, our suggestion, photos
// and a spot on the plan — saved as a draft. Sending, answering and closing stay on the web (docs/rfis.md), so the
// office checks the wording and the recipient first. Rules: FieldParity.RFI (← src/lib/rfis.ts).

extension EditorModel {
    /// Insert or replace an RFI (undoable and synced like every field row).
    func saveRfi(_ rfi: Rfi) {
        edit { b in
            var r = rfi
            r.updatedAt = isoNow()
            if let i = b.rfis.firstIndex(where: { $0.id == r.id }) { b.rfis[i] = r } else { b.rfis.append(r) }
        }
    }

    func rfi(_ id: String) -> Rfi? { bundle.liveRfis.first { $0.id == id } }
}

enum RfiListFilter: String, CaseIterable, Identifiable {
    case open = "Open", them = "With them", all = "All"
    var id: String { rawValue }

    func apply(_ rfis: [Rfi], today: String) -> [Rfi] {
        let out: [Rfi]
        switch self {
        case .open: out = rfis.filter { FieldParity.RFI.isActive($0.status.rawValue) }
        case .them: out = rfis.filter { $0.status == .open && $0.ballInCourt == "them" }
        case .all: out = rfis
        }
        return out.sorted { $0.number > $1.number }
    }
}

struct RfiListView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var filter: RfiListFilter = .open
    @State private var creating: Rfi?

    var body: some View {
        let today = TaskDates.today()
        let all = model.bundle.liveRfis
        let rows = filter.apply(all, today: today)
        List {
            Section {
                Picker("Show", selection: $filter) { ForEach(RfiListFilter.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
            if rows.isEmpty {
                ContentUnavailableView(all.isEmpty ? "No RFIs yet" : "Nothing here",
                                       systemImage: "questionmark.bubble",
                                       description: Text(all.isEmpty
                                                         ? "Something on the plans unclear? Ask with New RFI — add photos and the spot on the plan. The office sends it."
                                                         : "Try another filter."))
                    .listRowBackground(Color.clear)
            }
            ForEach(rows) { r in
                NavigationLink { RfiDetailView(model: model, id: r.id) } label: { RfiRow(rfi: r, today: today) }
            }
        }
        .toolbar {
            if FieldParity.RFI.can(app.cloud.role, "create") {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { creating = newDraft() } label: { Label("New RFI", systemImage: "plus") }
                }
            }
        }
        .sheet(item: $creating) { r in RfiEditor(model: model, rfi: r, isNew: true) }
    }

    private func newDraft() -> Rfi {
        Rfi(projectId: model.bundle.project.id, number: FieldParity.RFI.nextNumber(model.bundle.rfis.map(\.number)), subject: "",
            createdBy: FieldAuthor.name(app))
    }
}

struct RfiRow: View {
    let rfi: Rfi
    let today: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(rfi.label).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary)
                RfiStatusChip(status: rfi.status)
                if let ball = FieldParity.RFI.ballLabel(status: rfi.status.rawValue, ballInCourt: rfi.ballInCourt) { RfiBallChip(text: ball, them: rfi.ballInCourt == "them") }
                Spacer()
                if let due = rfi.due, !due.isEmpty {
                    let late = FieldParity.RFI.isOverdue(status: rfi.status.rawValue, due: due, today: today)
                    Text(late ? "Overdue · \(TaskDates.short(due))" : "Due \(TaskDates.short(due))")
                        .font(.caption).foregroundStyle(late ? Color.red : Color.secondary)
                }
            }
            Text(rfi.subject.isEmpty ? "Untitled question" : rfi.subject).font(.headline).lineLimit(2)
            if !rfi.question.isEmpty { Text(rfi.question).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

struct RfiStatusChip: View {
    let status: RfiStatus
    var body: some View {
        let color: Color = switch status {
        case .draft: .secondary
        case .open: .blue
        case .answered: .green
        case .closed: .secondary
        case .void: .secondary
        }
        Text(FieldParity.RFI.statusLabel(status.rawValue))
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
            .foregroundStyle(color)
    }
}

/// Who has to act next.
struct RfiBallChip: View {
    let text: String
    let them: Bool
    var body: some View {
        Label(text, systemImage: them ? "hourglass" : "arrow.left.arrow.right")
            .labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background((them ? Color.orange : Color.brand).opacity(0.14), in: Capsule())
            .foregroundStyle(them ? Color.orange : Color.brand)
    }
}

// MARK: - detail

struct RfiDetailView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let id: String
    @State private var editing: Rfi?
    @State private var viewer: PhotoViewerItem?

    var body: some View {
        if let r = model.rfi(id) {
            let photos = (r.photoIds ?? []).compactMap(model.photo)
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            RfiStatusChip(status: r.status)
                            if let ball = FieldParity.RFI.ballLabel(status: r.status.rawValue, ballInCourt: r.ballInCourt) { RfiBallChip(text: ball, them: r.ballInCourt == "them") }
                        }
                        Text(r.subject.isEmpty ? "Untitled question" : r.subject).font(.title3.weight(.semibold))
                        Text(byline(r)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section(sentence: "Question") { Text(r.question.isEmpty ? "—" : r.question).textSelection(.enabled) }
                if let s = r.suggestion, !s.isEmpty { Section(sentence: "Our suggestion") { Text(s).textSelection(.enabled) } }
                Section(sentence: "Answer") {
                    if let a = r.answer, !a.isEmpty {
                        Text(a).textSelection(.enabled)
                        if let by = r.answeredBy { Text("From \(by)\(r.answeredAt.map { " · \(TaskDates.short(FieldDocs.localDay($0)))" } ?? "")").font(.caption).foregroundStyle(.secondary) }
                    } else {
                        Text(r.status == .draft ? "Not sent yet. The office sends it from the web." : "No answer yet.").foregroundStyle(.secondary)
                    }
                }
                if let sid = r.sheetId, let sheet = model.bundle.liveSheets.first(where: { $0.id == sid }) {
                    Section(sentence: "On the plan") {
                        PlanSpotPreview(sheet: sheet, x: r.x, y: r.y).frame(height: 200)
                        Text(sheet.name).font(.subheadline)
                    }
                }
                if !photos.isEmpty {
                    Section(sentence: "Photos") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(photos) { p in
                                    Button { viewer = PhotoViewerItem(ids: photos.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 80) }.buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                if r.status == .draft {
                    Section {
                        WebOnlyLink(title: "Send it from the web", path: "project?id=\(model.bundle.project.id)&tab=field&section=rfis")
                    } footer: {
                        Text("The office checks the wording and who it goes to, then sends it.")
                    }
                }
            }
            .navigationTitle(r.label)
            .toolbar {
                if FieldParity.RFI.canEdit(app.cloud.role, status: r.status.rawValue) {
                    ToolbarItem(placement: .topBarTrailing) { Button("Edit") { editing = r } }
                }
            }
            .sheet(item: $editing) { e in RfiEditor(model: model, rfi: e, isNew: false) }
            .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
        } else {
            ContentUnavailableView("RFI deleted", systemImage: "questionmark.bubble")
        }
    }

    private func byline(_ r: Rfi) -> String {
        var parts: [String] = []
        if let by = r.createdBy, !by.isEmpty { parts.append("Raised by \(by)") }
        if let s = r.sentAt { parts.append("sent \(TaskDates.short(FieldDocs.localDay(s)))") }
        if let d = r.due, !d.isEmpty { parts.append("answer needed by \(TaskDates.short(d))") }
        return parts.isEmpty ? "Draft" : parts.joined(separator: " · ")
    }
}

// MARK: - new / edit draft

struct RfiEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    @State var rfi: Rfi
    let isNew: Bool
    @State private var picking = false
    @State private var viewer: PhotoViewerItem?

    var body: some View {
        NavigationStack {
            SentenceForm {
                Section(sentence: "Question") {
                    TextField("Subject (e.g. Fire panel location)", text: $rfi.subject)
                    TextField("What do you need to know?", text: $rfi.question, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    TextField("What would you do? (optional)", text: Binding(get: { rfi.suggestion ?? "" }, set: { rfi.suggestion = $0.isEmpty ? nil : $0 }), axis: .vertical)
                        .lineLimit(2...6)
                } header: {
                    SentenceHeader(title: "Our suggestion")
                } footer: {
                    Text("A suggested answer gets a quicker reply.")
                }
                Section(sentence: "Photos") {
                    let photos = (rfi.photoIds ?? []).compactMap(model.photo)
                    if !photos.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(photos) { p in
                                    PhotoThumb(photo: p, size: 72)
                                        .onTapGesture { viewer = PhotoViewerItem(ids: photos.map(\.id), start: p.id) }
                                        .contextMenu { Button("Remove from this RFI", role: .destructive) { rfi.photoIds?.removeAll { $0 == p.id } } }
                                }
                            }
                        }
                    }
                    PhotoAddMenu(model: model, extra: { $0.caption = $0.caption ?? (rfi.subject.isEmpty ? nil : rfi.subject) }, onAdded: { added in
                        rfi.photoIds = (rfi.photoIds ?? []) + added.map(\.id)
                    }) {
                        Label("Add photo", systemImage: "camera")
                    }
                }
                Section(sentence: "Spot on the plan") {
                    if let sid = rfi.sheetId, let sheet = model.bundle.liveSheets.first(where: { $0.id == sid }) {
                        PlanSpotPreview(sheet: sheet, x: rfi.x, y: rfi.y).frame(height: 160)
                        Button("Change spot") { picking = true }
                        Button("Remove spot", role: .destructive) { rfi.sheetId = nil; rfi.x = nil; rfi.y = nil }
                    } else if model.bundle.liveSheets.isEmpty {
                        Text("No plans on this job yet.").foregroundStyle(.secondary)
                    } else {
                        Button { picking = true } label: { Label("Pick a spot", systemImage: "mappin.and.ellipse") }
                    }
                }
            }
            .navigationTitle(isNew ? "New RFI" : rfi.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save draft") { save() }
                        .disabled(!FieldParity.RFI.draftIsSavable(subject: rfi.subject, question: rfi.question))
                }
            }
            .sheet(isPresented: $picking) {
                PlanSpotPicker(model: model, sheetId: rfi.sheetId ?? model.activeSheet?.id, x: rfi.x, y: rfi.y) { sid, x, y in
                    rfi.sheetId = sid; rfi.x = x; rfi.y = y
                }
            }
            .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
        }
    }

    private func save() {
        var r = rfi
        r.subject = FieldParity.RFI.subject(r.subject, question: r.question)
        r.question = r.question.trimmingCharacters(in: .whitespacesAndNewlines)
        if isNew {
            // Numbered when saved (another device may have added one meanwhile).
            r.number = FieldParity.RFI.nextNumber(model.bundle.rfis.map(\.number))
            r.status = .draft
            r.ballInCourt = "us"
        }
        model.saveRfi(r)
        model.say(isNew ? "\(r.label) saved as a draft — the office sends it" : "\(r.label) saved")
        dismiss()
    }
}

// MARK: - plan spot

/// The plan with a pin on the spot (read-only).
struct PlanSpotPreview: View {
    @Environment(AppModel.self) private var app
    let sheet: Sheet
    let x: Double?
    let y: Double?
    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geo in
            let fit = PlanSpot.fitRect(image: CGSize(width: sheet.width, height: sheet.height), in: geo.size)
            ZStack(alignment: .topLeading) {
                Color.white
                if let image { Image(uiImage: image).resizable().interpolation(.medium).frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY) }
                if let x, let y { PlanSpotPin().position(x: fit.minX + fit.width * x, y: fit.minY + fit.height * y) }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .task(id: sheet.imageId) { image = await PlanSpot.preview(sheet, store: app.store) }
        .accessibilityLabel(x == nil ? sheet.name : "Spot on \(sheet.name)")
    }
}

/// Pick a plan and tap the spot the question is about.
struct PlanSpotPicker: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    @State var sheetId: String?
    @State var x: Double?
    @State var y: Double?
    let onPick: (String, Double, Double) -> Void
    @State private var image: UIImage?

    var body: some View {
        let sheets = model.bundle.liveSheets
        let sheet = sheets.first { $0.id == sheetId } ?? sheets.first
        NavigationStack {
            VStack(spacing: 8) {
                if sheets.count > 1 {
                    Picker("Plan", selection: Binding(get: { sheet?.id ?? "" }, set: { sheetId = $0; x = nil; y = nil })) {
                        ForEach(sheets) { s in Text(s.name).tag(s.id) }
                    }
                    .pickerStyle(.menu)
                }
                if let sheet {
                    GeometryReader { geo in
                        let fit = PlanSpot.fitRect(image: CGSize(width: sheet.width, height: sheet.height), in: geo.size)
                        ZStack(alignment: .topLeading) {
                            Color(.secondarySystemBackground)
                            if let image { Image(uiImage: image).resizable().interpolation(.medium).frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY) }
                            if let x, let y { PlanSpotPin().position(x: fit.minX + fit.width * x, y: fit.minY + fit.height * y) }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { p in
                            guard fit.contains(p) else { return }
                            x = Double((p.x - fit.minX) / fit.width)
                            y = Double((p.y - fit.minY) / fit.height)
                            Haptics.tap()
                        }
                    }
                    .task(id: sheet.imageId) { image = await PlanSpot.preview(sheet, store: app.store) }
                    Text(x == nil ? "Tap the spot the question is about." : "Tap again to move it.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding()
            .navigationTitle("Spot on the plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        if let sheet, let x, let y { onPick(sheet.id, x, y) }
                        dismiss()
                    }
                    .disabled(x == nil)
                }
            }
        }
    }
}

struct PlanSpotPin: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.brand.opacity(0.25)).frame(width: 30, height: 30)
            Circle().fill(Color.brand).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 2))
        }
        .accessibilityHidden(true)
    }
}

enum PlanSpot {
    /// The image's rect when fitted (aspect) inside `size`, centred.
    static func fitRect(image: CGSize, in size: CGSize) -> CGRect {
        guard image.width > 0, image.height > 0, size.width > 0, size.height > 0 else { return CGRect(origin: .zero, size: size) }
        let s = min(size.width / image.width, size.height / image.height)
        let w = image.width * s, h = image.height * s
        return CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h)
    }

    @MainActor static func preview(_ sheet: Sheet, store: Store) async -> UIImage? {
        guard store.hasImage(sheet.imageId) else { return nil }
        return await PlanTileStore.shared.preview(imageId: sheet.imageId, source: PlanTileStore.sourceURL(imageId: sheet.imageId, store: store))
    }
}

// MARK: - web-only

/// A quiet row that opens a page of the PinPlan web app in Safari (the server set in Settings). Hidden when no server
/// is set up.
struct WebOnlyLink: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    let title: String
    let path: String

    var body: some View {
        if let url = serverPageURL(app.settings, path) {
            Button { openURL(url) } label: {
                HStack {
                    Text(title)
                    Spacer()
                    Image(systemName: "arrow.up.right.square").foregroundStyle(.secondary)
                }
            }
        }
    }
}
