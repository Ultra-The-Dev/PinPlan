import SwiftUI
import PinPlanCore

/// Tasks (a job section of its own): every task on the job. Filter (also by device, from a device's card on the plan:
/// JobNav.taskDevice), sort, swipe to complete, select several for bulk changes. New tasks start here ("+ Task").
struct TaskListView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var filter = TaskFilter()
    @State private var sort: TaskSort = .number
    @State private var search = ""
    @State private var selecting = false
    @State private var picked: Set<String> = []
    @State private var detail: TaskRef?
    @State private var quick: TaskDraft?

    private var shown: [PlanTask] {
        var f = filter
        f.text = search
        var list = TaskLogic.filterTasks(model.bundle.liveTasks, f, today: TaskDates.today())
        if let d = JobNav.shared.taskDevice { list = list.filter { $0.markerId == d } }
        return TaskLogic.sortTasks(list, by: sort)
    }

    /// The device the list is narrowed to, if any.
    private var device: Marker? { JobNav.shared.taskDevice.flatMap { id in model.bundle.liveMarkers.first { $0.id == id } } }

    var body: some View {
        let list = shown
        let all = model.bundle.liveTasks
        List {
            Section { filterBar.tutorialAnchor("tasks-list") }
            if JobNav.shared.taskDevice != nil { Section { deviceFilter } }
            if all.isEmpty {
                ContentUnavailableView("No tasks yet", systemImage: "checklist",
                                       description: Text("Tap + Task to add one. Pick a sheet or a device if it belongs somewhere."))
                    .listRowBackground(Color.clear)
            } else if list.isEmpty {
                Text("No tasks match the filter.").foregroundStyle(.secondary)
            }
            ForEach(list) { t in row(t) }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom) { if selecting && !picked.isEmpty { bulkBar } }
        .sheet(item: $detail) { ref in
            TaskDetailView(model: model, taskId: ref.id, placeLabel: String(localized: "Show on plan"), onPlace: { t in
                detail = nil
                showOnPlan(t)
            }, onDuplicate: { t in
                let copy = model.duplicateTask(t, sheetId: t.sheetId, x: nil, y: nil, room: t.room)
                detail = TaskRef(id: copy.id)
            })
        }
        .sheet(item: $quick) { d in TaskQuickCreateSheet(model: model, draft: d) }
        // A device card's "1 task" on the plan opens that task.
        .onAppear(perform: openRequested)
        .onChange(of: JobNav.shared.openTask) { _, _ in openRequested() }
    }

    private func openRequested() {
        guard let id = JobNav.shared.openTask else { return }
        JobNav.shared.openTask = nil
        if model.planTask(id) != nil { detail = TaskRef(id: id) }
    }

    /// "Device: P3 · Indoor camera ×" while the list shows one device's tasks.
    private var deviceFilter: some View {
        let name = device.map { m in [m.label, app.type(m.deviceTypeId)?.name ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") } ?? "—"
        return Button { JobNav.shared.taskDevice = nil } label: {
            HStack(spacing: 6) {
                Text("Device: \(name)").lineLimit(1)
                Image(systemName: "xmark.circle.fill")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 12).frame(minHeight: 36)
            .background(Color.brand, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Shows tasks for every device")
    }

    private func row(_ t: PlanTask) -> some View {
        let sheetName = model.sheets.first { $0.id == t.sheetId }?.name ?? String(localized: "General")
        return HStack(spacing: 10) {
            if selecting {
                Image(systemName: picked.contains(t.id) ? "checkmark.circle.fill" : "circle").font(.title2)
                    .foregroundStyle(picked.contains(t.id) ? Color.brand : Color.secondary)
            }
            TaskRowView(task: t, sheetName: sheetName)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if selecting {
                if picked.contains(t.id) { picked.remove(t.id) } else { picked.insert(t.id) }
            } else {
                detail = TaskRef(id: t.id)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !TaskLogic.isClosed(t.status) {
                Button { model.changeTask(t.id) { $0.status = .done } } label: { Label("Complete", systemImage: "checkmark") }.tint(.green)
            } else if t.status == .done && TaskLogic.canSetStatus(model.taskRole, from: .done, to: .verified) {
                Button { model.changeTask(t.id) { $0.status = .verified } } label: { Label("Verify", systemImage: "checkmark.seal") }.tint(.blue)
            }
        }
        .swipeActions(edge: .trailing) {
            if TaskLogic.canDelete(model.taskRole, task: t, me: model.taskAuthor) {
                Button(role: .destructive) { model.removeRows([t.id], in: \.tasks) } label: { Label("Delete", systemImage: "trash") }
            }
        }
    }

    private var filterBar: some View {
        let me = model.taskAuthor
        let mine = filter.assignee.count == 1 && filter.assignee[0].caseInsensitiveCompare(me) == .orderedSame
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search tasks or #number", text: $search).textInputAutocapitalization(.never)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(TaskLogic.statuses, id: \.id) { s in
                        let n = model.bundle.liveTasks.filter { $0.status == s.id }.count
                        TaskChipButton(title: "\(tr(s.short, context: "Task status")) \(n)", color: Color(hex: s.color), on: filter.status.contains(s.id)) {
                            if filter.status.contains(s.id) { filter.status.removeAll { $0 == s.id } } else { filter.status.append(s.id) }
                        }
                    }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    TaskChipButton(title: String(localized: "Mine"), on: mine) { filter.assignee = mine ? [] : [me] }
                    TaskChipButton(title: String(localized: "Overdue"), color: Color.red, on: filter.due == TaskDue.overdue) { filter.due = filter.due == TaskDue.overdue ? nil : TaskDue.overdue }
                    ForEach(TaskLogic.priorities, id: \.id) { p in
                        TaskChipButton(title: p.label, color: Color(hex: p.color), on: filter.priority.contains(p.id)) {
                            if filter.priority.contains(p.id) { filter.priority.removeAll { $0 == p.id } } else { filter.priority.append(p.id) }
                        }
                    }
                }
            }
            HStack {
                Menu {
                    Picker("Sort", selection: $sort) {
                        Text("Number").tag(TaskSort.number)
                        Text("Due date").tag(TaskSort.due)
                        Text("Priority").tag(TaskSort.priority)
                        Text("Status").tag(TaskSort.status)
                    }
                    Picker("Sheet", selection: Binding(get: { filter.sheetId ?? "__all" }, set: { filter.sheetId = $0 == "__all" ? nil : $0 })) {
                        Text("All sheets").tag("__all")
                        Text("General (no sheet)").tag("")
                        ForEach(model.sheets) { s in Text(s.name).tag(s.id) }
                    }
                    Picker("Category", selection: Binding(get: { filter.category.first ?? "" }, set: { filter.category = $0.isEmpty ? [] : [$0] })) {
                        Text("Any category").tag("")
                        ForEach(model.taskCategories, id: \.self) { Text($0).tag($0) }
                    }
                    if !filter.isEmpty { Button("Clear filters", role: .destructive) { filter = TaskFilter() } }
                } label: {
                    // Long languages: the icon alone rather than a label wrapped over two lines.
                    ViewThatFits(in: .horizontal) {
                        Label("Sort & filter", systemImage: "line.3.horizontal.decrease.circle").lineLimit(1).fixedSize()
                        Label("Sort & filter", systemImage: "line.3.horizontal.decrease.circle").labelStyle(.iconOnly)
                    }
                }
                Spacer(minLength: 4)
                Button(selecting ? "Done" : "Select") {
                    selecting.toggle()
                    picked = []
                }
                .lineLimit(1).fixedSize()
                Button {
                    // Narrowed to a device: the new task starts at that device.
                    if let m = device { quick = TaskDraft(sheetId: m.sheetId, x: m.x, y: m.y, room: m.room.isEmpty ? nil : m.room, markerId: m.id) } else { quick = TaskDraft() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("Task").lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    }
                    .accessibilityElement(children: .combine)
                }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var bulkBar: some View {
        let ids = picked
        let role = model.taskRole
        return HStack(spacing: 10) {
            Text("\(ids.count) selected").font(.subheadline.weight(.semibold)).fixedSize()
            Spacer(minLength: 4)
            // Scrolls sideways on a phone, where the six actions don't fit next to the count.
            ScrollView(.horizontal, showsIndicators: false) { bulkActions(ids, role: role) }
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal).padding(.vertical, 12)
        .background(.bar)
    }

    private func bulkActions(_ ids: Set<String>, role: TeamRole?) -> some View {
        HStack(spacing: 14) {
            Menu("Status") {
                ForEach(TaskLogic.statuses, id: \.id) { s in
                    Button(s.label) {
                        let ok = Set(model.bundle.liveTasks.filter { ids.contains($0.id) && TaskLogic.canSetStatus(role, from: $0.status, to: s.id) }.map(\.id))
                        model.changeTasks(ok) { $0.status = s.id }
                    }
                    .disabled(role == .tech && s.id == .verified)
                }
            }
            Menu("Assign") {
                Button("Unassigned") { model.changeTasks(ids) { $0.assignee = nil } }
                ForEach(model.taskPeople, id: \.self) { p in Button(p) { model.changeTasks(ids) { $0.assignee = p } } }
            }
            Menu("Priority") {
                ForEach(TaskLogic.priorities, id: \.id) { p in Button(p.label + " · " + tr(p.name, context: "Priority")) { model.changeTasks(ids) { $0.priority = p.id } } }
                Button("None") { model.changeTasks(ids) { $0.priority = nil } }
            }
            Menu("Due") {
                Button("Today") { model.changeTasks(ids) { $0.due = TaskDates.today() } }
                Button("Tomorrow") { model.changeTasks(ids) { $0.due = TaskDates.day(Date().addingTimeInterval(86_400)) } }
                Button("In a week") { model.changeTasks(ids) { $0.due = TaskDates.day(Date().addingTimeInterval(7 * 86_400)) } }
                Button("No due date") { model.changeTasks(ids) { $0.due = nil } }
            }
            Menu {
                ForEach(model.taskCategories, id: \.self) { c in Button(c) { model.changeTasks(ids) { $0.category = c } } }
                Button("None") { model.changeTasks(ids) { $0.category = nil } }
            } label: { Image(systemName: "tag") }
            .accessibilityLabel("Set category")
            Button(role: .destructive) {
                let me = model.taskAuthor
                let ok = Set(model.bundle.liveTasks.filter { ids.contains($0.id) && TaskLogic.canDelete(role, task: $0, me: me) }.map(\.id))
                model.removeRows(ok, in: \.tasks)
                picked = []
            } label: { Image(systemName: "trash") }
            .accessibilityLabel("Delete selected tasks")
        }
        .padding(.vertical, 4)
    }

    /// Open the plan on the task's sheet with it selected (placing it first when it has no spot).
    private func showOnPlan(_ t: PlanTask) {
        let st = TaskOverlayState.shared
        if let s = t.sheetId ?? model.activeSheet?.id { model.setActiveSheet(s) }
        st.selectedId = t.id
        st.showPins = true
        if TaskLogic.placement(t) != .pin { st.drop = .move(t.id) }
        model.say(TaskLogic.placement(t) == .pin ? String(localized: "Task #\(t.number) is selected on the plan") : String(localized: "Open the plan and tap where #\(t.number) goes"))
    }
}
