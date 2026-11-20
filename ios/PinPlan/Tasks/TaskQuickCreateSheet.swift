import SwiftUI
import PinPlanCore

/// New task: one title (quick entry: "Loose cover @P1 @Mike #lobby"), where it is (a sheet and, optionally, a device
/// picked from a list; a device puts the task at the device), big chips, a camera, Save. Opened from the Tasks section.
struct TaskQuickCreateSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let draft: TaskDraft
    @State private var text = ""
    @State private var status: TaskStatus = .open
    // Explicit picks win over what the title says; nil = follow the title.
    @State private var priority: Int??
    @State private var category: String??
    @State private var assignee: String??
    @State private var photoIds: [String] = []
    // Where: explicit picks win over the draft; nil = follow the draft.
    @State private var pickedSheet: String??
    @State private var pickedMarker: String??
    @State private var saved = false
    @FocusState private var titleFocused: Bool

    private var parsed: QuickEntry { TaskLogic.parseQuickEntry(text, categories: model.taskCategories, people: model.taskPeople) }
    private var pr: Int? { priority ?? parsed.priority }
    private var cat: String? { category ?? parsed.category }
    private var who: String? { assignee ?? parsed.assignee }
    private var placeSheet: String? { pickedSheet ?? draft.sheetId }
    private var placeMarker: Marker? { (pickedMarker ?? draft.markerId).flatMap { id in model.bundle.liveMarkers.first { $0.id == id } } }
    /// The draft with the picks applied: a device puts the task at the device; the spot picked on the plan stays while
    /// its sheet does.
    private var placed: TaskDraft {
        if let m = placeMarker { return TaskDraft(sheetId: m.sheetId, x: m.x, y: m.y, room: m.room.isEmpty ? draft.room : m.room, markerId: m.id) }
        if placeSheet == draft.sheetId { return TaskDraft(sheetId: draft.sheetId, x: draft.x, y: draft.y, room: draft.room) }
        return TaskDraft(sheetId: placeSheet)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    titleField
                    placeRow
                    statusRow
                    priorityRow
                    peopleRow
                    categoryRow
                    photosRow
                }
                .padding()
            }
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.fontWeight(.semibold) }
            }
            .safeAreaInset(edge: .bottom) {
                Button { save() } label: {
                    Text("Save task").font(.headline).frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal).padding(.bottom, 8)
            }
        }
        .presentationDetents([.large])
        .onAppear { titleFocused = true }
    }

    private var navTitle: String {
        let sheet = model.sheets.first { $0.id == placeSheet }
        return sheet.map { String(localized: "New task · \($0.name)") } ?? String(localized: "New task")
    }

    private var titleField: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("What's wrong?  @P1 @Mike #lobby", text: $text, axis: .vertical)
                .font(.title3)
                .focused($titleFocused)
                .submitLabel(.done)
                .onSubmit { save() }
                .padding(12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            if !parsed.tags.isEmpty || parsed.priority != nil || parsed.category != nil || parsed.assignee != nil {
                Text("“\(parsed.title.isEmpty ? "…" : parsed.title)”" + (parsed.tags.isEmpty ? "" : "  " + parsed.tags.map { "#\($0)" }.joined(separator: " ")))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let room = placed.room, !room.isEmpty {
                Label(room, systemImage: "door.left.hand.open").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    /// Sheet and device, each picked from a list.
    private var placeRow: some View {
        let devices = model.bundle.liveMarkers.filter { $0.sheetId == placeSheet }
            .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
        return HStack(spacing: 10) {
            Menu {
                Picker("Sheet", selection: Binding(get: { placeSheet ?? "" }, set: { v in
                    pickedSheet = .some(v.isEmpty ? nil : v)
                    pickedMarker = .some(nil)
                })) {
                    Text("General (no sheet)").tag("")
                    ForEach(model.sheets) { s in Text(s.name).tag(s.id) }
                }
            } label: {
                placeLabel("doc", model.sheets.first { $0.id == placeSheet }?.name ?? String(localized: "General (no sheet)"))
            }
            .accessibilityLabel("Sheet")
            Menu {
                Picker("Device", selection: Binding(get: { placeMarker?.id ?? "" }, set: { v in pickedMarker = .some(v.isEmpty ? nil : v) })) {
                    Text("No device").tag("")
                    ForEach(devices) { m in Text(deviceName(m)).tag(m.id) }
                }
            } label: {
                placeLabel("smallcircle.filled.circle", placeMarker.map { deviceName($0) } ?? String(localized: "No device"))
            }
            .disabled(placeSheet == nil || devices.isEmpty)
            .accessibilityLabel("Device")
        }
    }

    private func deviceName(_ m: Marker) -> String {
        [m.label, app.type(m.deviceTypeId)?.name ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func placeLabel(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(Color.brand)
            Text(text).lineLimit(1).foregroundStyle(Color.primary)
            Spacer(minLength: 0)
            Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(Color.secondary)
        }
        .font(.subheadline)
        .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 44)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private var statusRow: some View {
        TaskChipRow(title: String(localized: "Status")) {
            ForEach(TaskLogic.statuses.filter { $0.id != .verified || TaskLogic.canSetStatus(model.taskRole, from: .open, to: .verified) }, id: \.id) { s in
                TaskChipButton(title: tr(s.short, context: "Task status"), color: Color(hex: s.color), on: status == s.id) { status = s.id }
            }
        }
    }

    private var priorityRow: some View {
        TaskChipRow(title: String(localized: "Priority")) {
            ForEach(TaskLogic.priorities, id: \.id) { p in
                TaskChipButton(title: p.label, color: Color(hex: p.color), on: pr == p.id) { priority = .some(pr == p.id ? nil : p.id) }
            }
        }
    }

    private var peopleRow: some View {
        let me = model.taskAuthor
        return TaskChipRow(title: String(localized: "Assignee")) {
            ForEach(model.taskPeople, id: \.self) { p in
                TaskChipButton(title: p == me ? String(localized: "Me") : p, on: who == p) { assignee = .some(who == p ? nil : p) }
            }
        }
    }

    private var categoryRow: some View {
        TaskChipRow(title: String(localized: "Category")) {
            ForEach(model.taskCategories, id: \.self) { c in
                TaskChipButton(title: c, on: cat == c) { category = .some(cat == c ? nil : c) }
            }
        }
    }

    private var photosRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Photos").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    PhotoAddMenu(model: model, extra: { p in
                        p.sheetId = placed.sheetId
                        p.room = placed.room
                        p.markerId = placed.markerId
                        p.tags = ["Task"]
                    }, onAdded: { added in photoIds += added.map(\.id) }) {
                        Image(systemName: "camera.fill").font(.title2)
                            .frame(width: 72, height: 72)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                    }
                    ForEach(photoIds, id: \.self) { id in
                        if let p = model.photo(id) { PhotoThumb(photo: p, size: 72) }
                    }
                }
            }
        }
    }

    private func save() {
        guard !saved else { return }
        let title = parsed.title.isEmpty ? text.trimmingCharacters(in: .whitespacesAndNewlines) : parsed.title
        guard !title.isEmpty || !photoIds.isEmpty else { titleFocused = true; return }
        saved = true
        let t = model.createTask(title: title.isEmpty ? "Photo task" : title, draft: placed, status: status, priority: pr, category: cat,
                                 assignee: who, tags: parsed.tags, photoIds: photoIds)
        // Caption the photos with the task now that it has a number.
        if !photoIds.isEmpty { model.updateRows(Set(photoIds), in: \.photos) { $0.caption = "#\(t.number) \(t.title)" } }
        TaskOverlayState.shared.selectedId = t.id
        dismiss()
    }

    /// Photos taken for a task that wasn't saved go again.
    private func cancel() {
        if !photoIds.isEmpty { model.removeRows(Set(photoIds), in: \.photos) }
        dismiss()
    }
}
