import SwiftUI
import PinPlanCore

/// One task, edited in place: status (tech → Completed, office → Verified), priority, assignee, category, dates, room,
/// tags, description, checklist, photos (camera), comments and the history.
struct TaskDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let taskId: String
    var placeLabel: String? = nil
    var onPlace: (PlanTask) -> Void = { _ in }
    var onDuplicate: (PlanTask) -> Void = { _ in }

    var body: some View {
        NavigationStack {
            Group {
                if let t = model.planTask(taskId) {
                    TaskDetailForm(model: model, task: t, placeLabel: placeLabel, onPlace: onPlace, onDuplicate: onDuplicate)
                } else {
                    ContentUnavailableView("Task deleted", systemImage: "trash")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

private struct TaskDetailForm: View {
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let task: PlanTask
    let placeLabel: String?
    let onPlace: (PlanTask) -> Void
    let onDuplicate: (PlanTask) -> Void
    @State private var title = ""
    @State private var details = ""
    @State private var room = ""
    @State private var tags = ""
    @State private var comment = ""
    @State private var newItem = ""
    @State private var confirmDelete = false
    @State private var viewer: String?
    @State private var loaded = false

    var body: some View {
        Form {
            headerSection
            statusSection
            assignSection
            datesSection
            checklistSection
            photosSection
            activitySection
            actionsSection
        }
        .navigationTitle("Task #\(task.number)")
        .onAppear {
            guard !loaded else { return }
            loaded = true
            title = task.title
            details = task.description ?? ""
            room = task.room ?? ""
            tags = (task.tags ?? []).joined(separator: ", ")
        }
        .onDisappear { commitText() }
        .confirmationDialog("Delete task #\(task.number)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                model.removeRows([task.id], in: \.tasks)
                dismiss()
            }
        } message: { Text("It disappears from the plan and the task list for everyone on the job.") }
        .fullScreenCover(item: Binding(get: { viewer.map { TaskRef(id: $0) } }, set: { viewer = $0?.id })) { ref in
            PhotoViewer(model: model, ids: task.photoIds ?? [], current: ref.id)
        }
    }

    private func set(_ change: (inout PlanTask) -> Void) { model.changeTask(task.id, change) }

    /// Text fields save when you leave them (one history line, not one per keystroke).
    private func commitText() {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let d = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let r = room.trimmingCharacters(in: .whitespaces)
        var seen = Set<String>()
        let tagList = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "") }
            .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
        set { x in
            if !t.isEmpty { x.title = t }
            x.description = d.isEmpty ? nil : d
            x.room = r.isEmpty ? nil : r
            // No tags typed on a task that never had any: leave it nil, or every close would save the task again.
            if tagList != (x.tags ?? []) { x.tags = tagList }
        }
    }

    private var headerSection: some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                TaskBadgeView(task: task, size: 40)
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Title", text: $title, axis: .vertical).font(.title3.weight(.semibold)).onSubmit { commitText() }
                    Text(whereText).font(.caption).foregroundStyle(.secondary)
                }
            }
            TextField("Description", text: $details, axis: .vertical).lineLimit(2...6)
        }
    }

    private var whereText: String {
        let sheet = model.sheets.first { $0.id == task.sheetId }?.name
        let place: String
        switch TaskLogic.placement(task) {
        case .pin: place = sheet ?? String(localized: "Sheet")
        case .sheet: place = String(localized: "\(sheet ?? String(localized: "Sheet")) (no spot)")
        case .general: place = String(localized: "General task")
        }
        return [place, task.createdBy.map { "by \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }

    private var statusSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(TaskLogic.statuses, id: \.id) { s in
                        TaskChipButton(title: s.label, color: Color(hex: s.color), on: task.status == s.id,
                                       disabled: !TaskLogic.canSetStatus(model.taskRole, from: task.status, to: s.id)) {
                            set { $0.status = s.id }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            if task.status == .verified, let by = task.verifiedBy {
                Text("Verified by \(by)").font(.caption).foregroundStyle(Color.blue)
            } else if model.taskRole == .tech && task.status == .done {
                Text("The office verifies completed tasks.").font(.caption).foregroundStyle(.secondary)
            }
        } header: { Text("Status") }
    }

    private var assignSection: some View {
        Section {
            HStack(spacing: 8) {
                ForEach(TaskLogic.priorities, id: \.id) { p in
                    TaskChipButton(title: p.label, color: Color(hex: p.color), on: task.priority == p.id) {
                        set { $0.priority = task.priority == p.id ? nil : p.id }
                    }
                }
            }
            Picker("Assignee", selection: Binding(get: { task.assignee ?? "" }, set: { v in set { $0.assignee = v.isEmpty ? nil : v } })) {
                Text("Unassigned").tag("")
                ForEach(model.taskPeople, id: \.self) { Text($0).tag($0) }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.taskCategories, id: \.self) { c in
                        let on = (task.category ?? "").caseInsensitiveCompare(c) == .orderedSame
                        TaskChipButton(title: c, on: on) { set { $0.category = on ? nil : c } }
                    }
                }
                .padding(.vertical, 4)
            }
        } header: { Text("Priority, assignee and category") }
    }

    private var datesSection: some View {
        Section {
            dateRow(String(localized: "Due"), value: task.due) { v in set { $0.due = v } }
            dateRow(String(localized: "Start"), value: task.startDate) { v in set { $0.startDate = v } }
            TextField("Room", text: $room).onSubmit { commitText() }
            TextField("Tags (comma separated)", text: $tags).textInputAutocapitalization(.never).onSubmit { commitText() }
        }
    }

    private func dateRow(_ label: String, value: String?, save: @escaping (String?) -> Void) -> some View {
        HStack {
            if let d = TaskDates.date(value) {
                DatePicker(label, selection: Binding(get: { d }, set: { save(TaskDates.day($0)) }), displayedComponents: .date)
                Button { save(nil) } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).accessibilityLabel("Clear \(label.lowercased()) date")
            } else {
                Text(label)
                Spacer()
                Button("Set") { save(TaskDates.day(Date())) }
            }
        }
    }

    private var checklistSection: some View {
        let items = task.checklist ?? []
        return Section {
            ForEach(items) { i in
                Button {
                    set { x in
                        guard let k = x.checklist?.firstIndex(where: { $0.id == i.id }) else { return }
                        let done = x.checklist![k].done != true
                        x.checklist![k].done = done
                        x.checklist![k].doneBy = done ? model.taskAuthor : nil
                        x.checklist![k].doneAt = done ? isoNow() : nil
                    }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: i.done == true ? "checkmark.square.fill" : "square").font(.title2)
                            .foregroundStyle(i.done == true ? Color.green : Color.secondary)
                        Text(i.text).strikethrough(i.done == true).foregroundStyle(i.done == true ? Color.secondary : Color.primary)
                    }
                    .frame(minHeight: 40)
                }
                .buttonStyle(.plain)
            }
            .onDelete { idx in
                let ids = Set(idx.map { items[$0].id })
                set { $0.checklist = ($0.checklist ?? []).filter { !ids.contains($0.id) } }
            }
            HStack {
                TextField("Add an item (paste several lines)", text: $newItem, axis: .vertical).onSubmit { addItems() }
                Button { addItems() } label: { Image(systemName: "plus.circle.fill").font(.title2) }
                    .accessibilityLabel("Add")
                    .disabled(newItem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } header: {
            Text(items.isEmpty ? "Checklist" : "Checklist · \(items.filter { $0.done == true }.count)/\(items.count)")
        }
    }

    private func addItems() {
        let lines = TaskLogic.checklistLines(newItem)
        guard !lines.isEmpty else { return }
        set { $0.checklist = ($0.checklist ?? []) + lines.map { line in
            var item = ChecklistItem(text: line)
            item.requiresPhoto = nil
            item.done = false
            return item
        } }
        newItem = ""
    }

    private var photosSection: some View {
        let photos = (task.photoIds ?? []).compactMap { model.photo($0) }
        return Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    PhotoAddMenu(model: model, extra: { p in
                        p.sheetId = task.sheetId
                        p.room = task.room
                        p.tags = ["Task"]
                        p.caption = "#\(task.number) \(task.title)"
                    }, onAdded: { added in
                        let ids = added.map(\.id)
                        set { $0.photoIds = ($0.photoIds ?? []) + ids }
                    }) {
                        VStack(spacing: 4) {
                            Image(systemName: "camera.fill").font(.title2)
                            Text("Add").font(.caption)
                        }
                        .frame(width: 84, height: 84)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                    }
                    ForEach(photos) { p in
                        Button { viewer = p.id } label: { PhotoThumb(photo: p, size: 84) }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Remove from task", role: .destructive) { set { $0.photoIds = ($0.photoIds ?? []).filter { $0 != p.id } } }
                            }
                    }
                }
                .padding(.vertical, 4)
            }
        } header: { Text("Photos") }
    }

    private var activitySection: some View {
        Section {
            HStack(alignment: .bottom) {
                TextField("Add a comment", text: $comment, axis: .vertical).lineLimit(1...5)
                Button {
                    model.commentOnTask(task.id, comment)
                    comment = ""
                } label: { Image(systemName: "paperplane.fill").font(.title3) }
                .accessibilityLabel("Send")
                .disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            ForEach(Array((task.activity ?? []).reversed())) { e in eventRow(e) }
        } header: { Text("Activity") }
    }

    private func eventRow(_ e: TaskEvent) -> some View {
        let when = SyncMap.date(e.at).formatted(date: .abbreviated, time: .shortened)
        return VStack(alignment: .leading, spacing: 3) {
            if e.kind == .comment {
                Text("\(e.by) · \(when)").font(.caption).foregroundStyle(.secondary)
                Text(e.text ?? "").padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
            } else {
                (Text(e.by).fontWeight(.semibold) + Text(" \(TaskLogic.eventText(e))"))
                    .font(.subheadline)
                Text(when).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var actionsSection: some View {
        Section {
            Button {
                commitText()
                onPlace(task)
            } label: { Label(placeLabel ?? (TaskLogic.placement(task) == .pin ? String(localized: "Move pin") : String(localized: "Place on plan")), systemImage: "mappin.and.ellipse") }
            Button {
                commitText()
                onDuplicate(task)
            } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            if TaskLogic.canDelete(model.taskRole, task: task, me: model.taskAuthor) {
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete task", systemImage: "trash") }
            }
        }
    }
}
