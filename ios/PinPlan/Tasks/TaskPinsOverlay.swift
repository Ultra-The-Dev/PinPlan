import SwiftUI
import PinPlanCore

/// Tasks on the plan (a plan overlay, see Editor/Overlays/PlanOverlays.swift): pins, the toolbar and tap-to-drop.
struct TasksOverlayProvider: PlanOverlayProvider {
    let id = "tasks"

    @MainActor func layer(_ ctx: PlanOverlayContext, model: EditorModel) -> AnyView {
        AnyView(TaskPinsLayer(ctx: ctx, model: model))
    }

    @MainActor func toolbar(model: EditorModel) -> AnyView? {
        AnyView(TaskToolbarView(model: model))
    }

    /// While a drop is armed, the tap places the task (new, copy or move) and is used up.
    @MainActor func handleTap(relative: CGPoint, model: EditorModel) -> Bool {
        let st = TaskOverlayState.shared
        guard let drop = st.drop, let sheet = model.activeSheet else { return false }
        st.drop = nil
        let x = min(1, max(0, Double(relative.x)))
        let y = min(1, max(0, Double(relative.y)))
        let room = model.taskRoom(sheetId: sheet.id, x: x, y: y)
        switch drop {
        case .new:
            st.quick = TaskDraft(sheetId: sheet.id, x: x, y: y, room: room)
        case .duplicate(let src):
            let copy = model.duplicateTask(src, sheetId: sheet.id, x: x, y: y, room: room)
            st.selectedId = copy.id
            st.detail = TaskRef(id: copy.id)
        case .move(let id):
            model.changeTask(id) { $0.sheetId = sheet.id; $0.x = x; $0.y = y }
            st.selectedId = id
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        return true
    }
}

// MARK: - pins

/// The sheet's pinned tasks; filtered-out pins are hidden, or greyed when "grey others" is on.
struct TaskPinsLayer: View {
    let ctx: PlanOverlayContext
    let model: EditorModel
    @State private var dragging: [String: CGPoint] = [:]

    private struct Pin: Identifiable { let task: PlanTask; let grey: Bool; var id: String { task.id } }

    private var pins: [Pin] {
        let st = TaskOverlayState.shared
        let today = TaskDates.today()
        let active = !st.filter.isEmpty
        var out: [Pin] = []
        for t in model.bundle.liveTasks where t.sheetId == ctx.sheet.id && TaskLogic.placement(t) == .pin {
            let match = !active || TaskLogic.matches(t, st.filter, today: today)
            if match || st.greyOthers { out.append(Pin(task: t, grey: !match)) }
        }
        // Greyed pins underneath, the selected one on top.
        return out.sorted { a, b in
            if a.grey != b.grey { return a.grey }
            return (a.task.id == st.selectedId ? 1 : 0) < (b.task.id == st.selectedId ? 1 : 0)
        }
    }

    var body: some View {
        let st = TaskOverlayState.shared
        ZStack(alignment: .topLeading) {
            if st.showPins {
                ForEach(pins) { pin in pinView(pin, selected: pin.task.id == st.selectedId) }
            }
        }
        .frame(width: ctx.imageSize.width, height: ctx.imageSize.height, alignment: .topLeading)
    }

    private func spot(_ t: PlanTask) -> CGPoint {
        if let d = dragging[t.id] { return d }
        return CGPoint(x: CGFloat(t.x ?? 0) * ctx.imageSize.width, y: CGFloat(t.y ?? 0) * ctx.imageSize.height)
    }

    private func pinView(_ pin: Pin, selected: Bool) -> some View {
        let t = pin.task
        let p = spot(t)
        let size: CGFloat = selected ? 38 : 32
        return TaskPinView(number: t.number, color: TaskColors.pin(t, grey: pin.grey), selected: selected, urgent: t.priority == 1 && !pin.grey && !TaskLogic.isClosed(t.status))
            .frame(width: size, height: size * 1.4)
            .opacity(pin.grey ? 0.55 : 1)
            // The tip sits on the spot.
            .position(x: p.x, y: p.y - size * 0.7)
            .onTapGesture {
                TaskOverlayState.shared.selectedId = t.id
                TaskOverlayState.shared.detail = TaskRef(id: t.id)
            }
            .gesture(moveGesture(t), including: selected ? .all : .subviews)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Task \(t.number), \(t.title), \(TaskLogic.info(t.status).label)")
            .accessibilityAddTraits(.isButton)
    }

    /// Drag a selected pin to move it (logged in the task's history).
    private func moveGesture(_ t: PlanTask) -> some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named(PlanCanvasView.space))
            .onChanged { v in
                let w = max(1, ctx.imageSize.width), h = max(1, ctx.imageSize.height)
                let base = CGPoint(x: CGFloat(t.x ?? 0) * w, y: CGFloat(t.y ?? 0) * h)
                dragging[t.id] = CGPoint(x: base.x + v.translation.width, y: base.y + v.translation.height)
            }
            .onEnded { v in
                let w = max(1, ctx.imageSize.width), h = max(1, ctx.imageSize.height)
                let nx = Double(min(1, max(0, (CGFloat(t.x ?? 0) * w + v.translation.width) / w)))
                let ny = Double(min(1, max(0, (CGFloat(t.y ?? 0) * h + v.translation.height) / h)))
                dragging[t.id] = nil
                model.changeTask(t.id) { $0.x = nx; $0.y = ny }
            }
    }
}

/// A teardrop pin in the status colour with the task number.
struct TaskPinView: View {
    let number: Int
    let color: Color
    var selected = false
    var urgent = false

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .top) {
                TeardropShape().fill(color).shadow(color: .black.opacity(0.35), radius: 2, y: 1)
                TeardropShape().stroke(Color.white, lineWidth: 2)
                Text("\(number)")
                    .font(.system(size: w * (number > 999 ? 0.3 : number > 99 ? 0.36 : 0.44), weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.white)
                    .frame(width: w, height: w)
                    .minimumScaleFactor(0.5)
                if urgent {
                    Circle().fill(Color.white).overlay(Circle().stroke(Color(hex: "#dc2626"), lineWidth: 2.5))
                        .frame(width: w * 0.28, height: w * 0.28)
                        .offset(x: w * 0.38, y: -w * 0.04)
                }
            }
            .overlay(alignment: .top) {
                if selected { Circle().stroke(Color.blue, lineWidth: 3).frame(width: w + 10, height: w + 10).offset(y: -5) }
            }
        }
    }
}

/// Round head on top, point at the bottom centre (the spot). Built from points so it reads the same everywhere.
struct TeardropShape: SwiftUI.Shape {
    func path(in rect: CGRect) -> Path {
        let r = rect.width / 2
        let c = CGPoint(x: rect.midX, y: rect.minY + r)
        let tip = CGPoint(x: rect.midX, y: rect.maxY)
        let len = max(r + 0.001, tip.y - c.y)
        let a = Double(acos(r / len))
        var p = Path()
        p.move(to: tip)
        let steps = 36
        let start = Double.pi / 2 + a
        let sweep = 2 * Double.pi - 2 * a
        for k in 0...steps {
            let ang = start + sweep * Double(k) / Double(steps)
            p.addLine(to: CGPoint(x: c.x + r * CGFloat(cos(ang)), y: c.y + r * CGFloat(sin(ang))))
        }
        p.closeSubpath()
        return p
    }
}

/// The task number in its status colour: a teardrop (pinned), a diamond (on a sheet, no spot) or a rounded square (general).
struct TaskBadgeView: View {
    let task: PlanTask
    var size: CGFloat = 30

    var body: some View {
        let color = TaskColors.status(task.status)
        ZStack {
            switch TaskLogic.placement(task) {
            case .pin: TeardropShape().fill(color).frame(width: size * 0.82, height: size)
            case .sheet: Rectangle().fill(color).frame(width: size * 0.68, height: size * 0.68).rotationEffect(.degrees(45))
            case .general: RoundedRectangle(cornerRadius: size * 0.22).fill(color).frame(width: size * 0.86, height: size * 0.86)
            }
            Text("\(task.number)")
                .font(.system(size: size * 0.36, weight: .bold)).monospacedDigit()
                .foregroundStyle(Color.white)
                .minimumScaleFactor(0.5)
                .offset(y: TaskLogic.placement(task) == .pin ? -size * 0.12 : 0)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// A big, glove-friendly chip.
struct TaskChipButton: View {
    let title: String
    var color: Color? = nil
    let on: Bool
    var disabled = false
    let action: () -> Void

    var body: some View {
        let fill: Color = on ? (color ?? Color.ink) : Color(.secondarySystemBackground)
        let text: Color = on ? Color.white : Color.primary
        Button(action: action) {
            HStack(spacing: 6) {
                if let color, !on { Circle().fill(color).frame(width: 10, height: 10) }
                Text(title).font(.body.weight(.medium)).lineLimit(1)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 46)
            .foregroundStyle(text)
            .background(fill, in: Capsule())
            .overlay(Capsule().stroke(Color(.separator), lineWidth: on ? 0 : 0.5))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A row of chips that scrolls sideways.
struct TaskChipRow<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { content }.padding(.vertical, 2)
            }
        }
    }
}

// MARK: - toolbar

/// "+ Task" (arms a drop), show/hide pins (red while filters hide some), filters, and this sheet's tasks.
struct TaskToolbarView: View {
    let model: EditorModel
    @State private var showList = false

    private var state: TaskOverlayState { TaskOverlayState.shared }

    var body: some View {
        let st = state
        let sheetTasks = model.bundle.liveTasks.filter { $0.sheetId == model.activeSheet?.id }
        let open = sheetTasks.filter { !TaskLogic.isClosed($0.status) }.count
        let hiding = !st.showPins || (!st.filter.isEmpty && !st.greyOthers && sheetTasks.contains { TaskLogic.placement($0) == .pin && !TaskLogic.matches($0, st.filter, today: TaskDates.today()) })
        VStack(spacing: 8) {
            roundButton(systemImage: "mappin.and.ellipse", tint: st.drop != nil ? Color.white : Color.primary, fill: st.drop != nil ? Color.brand : Color(.systemBackground), label: "Add a task") {
                model.use(.select)
                st.drop = st.drop == TaskOverlayState.Drop.new ? nil : TaskOverlayState.Drop.new
            }
            roundButton(systemImage: st.showPins ? "eye" : "eye.slash", tint: hiding ? Color.red : Color.primary, fill: Color(.systemBackground), label: st.showPins ? "Hide task pins" : "Show task pins") {
                st.showPins.toggle()
            }
            filterMenu
            roundButton(systemImage: "list.bullet.rectangle", tint: Color.primary, fill: Color(.systemBackground), label: "Tasks on this sheet") { showList = true }
                .overlay(alignment: .topTrailing) {
                    if open > 0 {
                        Text("\(open)").font(.caption2.weight(.bold)).foregroundStyle(Color.white)
                            .padding(.horizontal, 5).frame(minWidth: 18, minHeight: 18).background(Color.red, in: Capsule()).offset(x: 6, y: -6)
                    }
                }
        }
        .overlay(alignment: .topLeading) {
            if let d = st.drop {
                Button { st.drop = nil } label: {
                    HStack(spacing: 8) {
                        Circle().fill(Color.orange).frame(width: 6, height: 6)
                        Text(dropHint(d)).font(.subheadline.weight(.medium))
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Color.white.opacity(0.7))
                    }
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.ink.opacity(0.9), in: Capsule())
                }
                .buttonStyle(.plain)
                .fixedSize()
                .offset(x: 58, y: 6)
                .accessibilityLabel("\(dropHint(d)). Cancel")
            }
        }
        .sheet(item: Binding(get: { st.quick }, set: { st.quick = $0 })) { draft in
            TaskQuickCreateSheet(model: model, draft: draft)
        }
        .sheet(item: Binding(get: { st.detail }, set: { st.detail = $0 })) { ref in
            TaskDetailView(model: model, taskId: ref.id, onPlace: { t in
                st.detail = nil
                st.selectedId = t.id
                st.drop = .move(t.id)
            }, onDuplicate: { t in
                st.detail = nil
                st.drop = .duplicate(t)
            })
        }
        .sheet(isPresented: $showList) { sheetList(sheetTasks) }
    }

    private func dropHint(_ d: TaskOverlayState.Drop) -> String {
        switch d {
        case .new: return "Tap the plan to drop a task"
        case .duplicate(let t): return "Tap where the copy of #\(t.number) goes"
        case .move: return "Tap the new spot"
        }
    }

    private func roundButton(systemImage: String, tint: Color, fill: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.system(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 48, height: 48)
                .background(fill, in: Circle())
                .shadow(color: .black.opacity(0.15), radius: 4, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var filterMenu: some View {
        let st = state
        let me = model.taskAuthor
        let mine = st.filter.assignee.count == 1 && st.filter.assignee[0].caseInsensitiveCompare(me) == .orderedSame
        return Menu {
            Section("Status") {
                ForEach(TaskLogic.statuses, id: \.id) { s in
                    Toggle(s.label, isOn: Binding(get: { st.filter.status.contains(s.id) }, set: { on in
                        if on { st.filter.status.append(s.id) } else { st.filter.status.removeAll { $0 == s.id } }
                    }))
                }
            }
            Toggle("Mine", isOn: Binding(get: { mine }, set: { st.filter.assignee = $0 ? [me] : [] }))
            Toggle("Overdue", isOn: Binding(get: { st.filter.due == TaskDue.overdue }, set: { st.filter.due = $0 ? .overdue : nil }))
            Menu("Category") {
                ForEach(model.taskCategories, id: \.self) { c in
                    Toggle(c, isOn: Binding(get: { st.filter.category.contains(c) }, set: { on in
                        if on { st.filter.category.append(c) } else { st.filter.category.removeAll { $0 == c } }
                    }))
                }
            }
            Toggle("Grey out the others", isOn: Binding(get: { st.greyOthers }, set: { st.greyOthers = $0 }))
            if !st.filter.isEmpty { Button("Clear filters", role: .destructive) { st.filter = TaskFilter() } }
        } label: {
            Image(systemName: st.filter.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(st.filter.isEmpty ? Color.primary : Color.brand)
                .frame(width: 48, height: 48)
                .background(Color(.systemBackground), in: Circle())
                .shadow(color: .black.opacity(0.15), radius: 4, y: 1)
        }
        .accessibilityLabel("Filter task pins")
    }

    private func sheetList(_ tasks: [PlanTask]) -> some View {
        NavigationStack {
            List {
                if tasks.isEmpty {
                    ContentUnavailableView("No tasks on this sheet", systemImage: "mappin.slash", description: Text("Tap the pin button, then tap the plan."))
                }
                ForEach(tasks) { t in
                    Button {
                        showList = false
                        state.selectedId = t.id
                        state.showPins = true
                        if TaskLogic.placement(t) != .pin { state.detail = TaskRef(id: t.id) }
                    } label: { TaskRowView(task: t, sheetName: nil) }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("\(model.activeSheet?.name ?? "Sheet") · \(tasks.count)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showList = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// One task in a list: badge, title, status, where, who, when.
struct TaskRowView: View {
    let task: PlanTask
    let sheetName: String?

    var body: some View {
        let today = TaskDates.today()
        HStack(spacing: 12) {
            TaskBadgeView(task: task, size: 32)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(task.title).font(.body.weight(.medium)).lineLimit(2)
                    if let p = TaskLogic.priorityInfo(task.priority) {
                        Text(p.label).font(.caption2.weight(.bold)).foregroundStyle(TaskColors.priority(task.priority))
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(TaskColors.priority(task.priority), lineWidth: 1))
                    }
                }
                HStack(spacing: 8) {
                    Text(TaskLogic.info(task.status).short).foregroundStyle(TaskColors.status(task.status)).fontWeight(.medium)
                    if let s = sheetName { Text(s) }
                    if let r = task.room, !r.isEmpty { Text(r) }
                    if let a = task.assignee, !a.isEmpty { Label(a, systemImage: "person").labelStyle(.titleAndIcon) }
                    if let d = task.due {
                        Text("Due \(TaskDates.short(d))").foregroundStyle(TaskLogic.isOverdue(task, today: today) ? Color.red : Color.secondary)
                    }
                    if let n = task.photoIds?.count, n > 0 { Label("\(n)", systemImage: "camera") }
                }
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }
}
