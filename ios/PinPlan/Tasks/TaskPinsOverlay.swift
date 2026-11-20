import SwiftUI
import PinPlanCore

// Tasks on the plan, through the plan overlay registry (Viewer/PlanOverlay.swift, docs/plan-viewer-ios.md):
//   • "tasks": pins in the status colour with their number (constant size on screen, one Canvas), tap a pin to open
//     the task, and tap-to-drop while "+ Task" (or "place"/"duplicate" from a task) is armed. View and Edit mode.
//   • "tasks-drag": Edit mode only, a touch target on the selected pin so it can be dragged to a new spot.
//   • controls: "+ Task", show/hide pins, pin filters and this sheet's tasks, in the viewer's controls column.
// Registered once from PinPlanApp.

enum TaskOverlays {
    @MainActor static func register() {
        let registry = PlanOverlayRegistry.shared
        registry.register(PlanOverlay(id: "tasks", zIndex: 30, content: { ctx in
            AnyView(TaskPinsLayer(ctx: ctx))
        }, onTap: { tap in
            handleTap(tap)
        }, controls: { ctx in
            AnyView(TaskPlanControls(ctx: ctx))
        }))
        registry.register(PlanOverlay(id: "tasks-drag", zIndex: 31, allowsHitTesting: true, modes: [.edit], content: { ctx in
            AnyView(TaskPinHandle(ctx: ctx))
        }))
        // The office's markups, measurements and plan links (read-only), registered with the tasks so app start
        // needs no extra line.
        OfficeOverlays.register()
    }

    /// An armed drop places the task (new, copy or move). Otherwise a tap on a pin opens it; a tap elsewhere just
    /// clears the pin selection and goes on to the plan.
    @MainActor static func handleTap(_ tap: PlanTap) -> Bool {
        let st = TaskOverlayState.shared
        let ctx = tap.context
        if let drop = st.drop {
            let p = tap.sheetPoint
            guard (0...1).contains(p.x), (0...1).contains(p.y) else {
                ctx.model.say(String(localized: "Tap on the sheet to place the task"))
                return true
            }
            place(drop, x: p.x, y: p.y, ctx: ctx)
            return true
        }
        // Placing or drawing in Edit mode: the tool gets the tap, even over a pin.
        if ctx.mode == .edit && ctx.model.tool != .select { return false }
        guard st.showPins, let pin = hit(tap.location, ctx: ctx) else {
            if st.selectedId != nil { st.selectedId = nil }
            return false
        }
        st.selectedId = pin.task.id
        st.detail = TaskRef(id: pin.task.id)
        Haptics.select()
        return true
    }

    @MainActor private static func place(_ drop: TaskOverlayState.Drop, x: Double, y: Double, ctx: PlanOverlayContext) {
        let st = TaskOverlayState.shared
        let model = ctx.model
        let sheet = ctx.sheet
        st.drop = nil
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
        Haptics.lift()
    }

    /// The sheet's pins in draw order (greyed underneath, the selected one on top). Filtered-out pins are left out,
    /// or greyed when "grey out the others" is on. A pin being dragged is at its live spot.
    @MainActor static func pins(_ model: EditorModel, sheetId: String) -> [TaskPin] {
        let st = TaskOverlayState.shared
        let today = TaskDates.today()
        let active = !st.filter.isEmpty
        var out: [TaskPin] = []
        for t in model.bundle.liveTasks where t.sheetId == sheetId && TaskLogic.placement(t) == .pin {
            let match = !active || TaskLogic.matches(t, st.filter, today: today)
            guard match || st.greyOthers else { continue }
            let drag = st.dragging?.id == t.id ? st.dragging : nil
            out.append(TaskPin(task: t, x: drag?.x ?? t.x ?? 0, y: drag?.y ?? t.y ?? 0, grey: !match, selected: t.id == st.selectedId,
                               color: TaskColors.pin(t, grey: !match),
                               urgent: t.priority == 1 && match && !TaskLogic.isClosed(t.status)))
        }
        return out.sorted { a, b in
            if a.grey != b.grey { return a.grey }
            return (a.selected ? 1 : 0) < (b.selected ? 1 : 0)
        }
    }

    /// The topmost pin under a view point (its whole teardrop, plus a little slack for fingers).
    @MainActor static func hit(_ location: CGPoint, ctx: PlanOverlayContext) -> TaskPin? {
        for pin in pins(ctx.model, sheetId: ctx.sheet.id).reversed() {
            let r = TaskPinDrawing.rect(tip: ctx.point(pin.x, pin.y), selected: pin.selected).insetBy(dx: -6, dy: -6)
            if r.contains(location) { return pin }
        }
        return nil
    }
}

/// A task pin ready to draw.
struct TaskPin: Identifiable {
    let task: PlanTask
    let x: Double
    let y: Double
    let grey: Bool
    let selected: Bool
    let color: Color
    let urgent: Bool
    var id: String { task.id }
}

/// Pin geometry and drawing: plain functions (no view state), usable from a Canvas.
enum TaskPinDrawing {
    /// The pin's box: its tip sits on the spot. Constant size on screen.
    static func rect(tip: CGPoint, selected: Bool) -> CGRect {
        let w: CGFloat = selected ? 38 : 32
        let h = w * 1.4
        return CGRect(x: tip.x - w / 2, y: tip.y - h, width: w, height: h)
    }

    /// Round head on top, point at the bottom centre. Built from points so it reads the same everywhere.
    static func teardrop(in rect: CGRect) -> Path {
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

    static func draw(_ pin: TaskPin, tip: CGPoint, in g: inout GraphicsContext) {
        let r = rect(tip: tip, selected: pin.selected)
        let w = r.width
        let path = teardrop(in: r)
        let opacity = pin.grey ? 0.55 : 1
        g.drawLayer { l in
            l.opacity = opacity
            l.addFilter(.shadow(color: Color.black.opacity(0.35), radius: 2, y: 1))
            l.fill(path, with: .color(pin.color))
        }
        g.stroke(path, with: .color(Color.white.opacity(opacity)), lineWidth: 2)
        let head = CGPoint(x: r.midX, y: r.minY + w / 2)
        let n = pin.task.number
        let size = w * (n > 999 ? 0.3 : n > 99 ? 0.36 : 0.44)
        let label = g.resolve(Text("\(n)").font(.system(size: size, weight: .bold)).monospacedDigit().foregroundColor(Color.white))
        g.draw(label, at: head)
        if pin.urgent {
            let d = w * 0.28
            let dot = Path(ellipseIn: CGRect(x: r.midX + w * 0.38 - d / 2, y: r.minY - w * 0.04, width: d, height: d))
            g.fill(dot, with: .color(.white))
            g.stroke(dot, with: .color(Color(hex: "#dc2626")), lineWidth: 2.5)
        }
        if pin.selected {
            g.stroke(Path(ellipseIn: CGRect(x: head.x - w / 2 - 5, y: head.y - w / 2 - 5, width: w + 10, height: w + 10)),
                     with: .color(.blue), lineWidth: 3)
        }
    }
}

// MARK: - pins

/// The sheet's pins in one Canvas, culled to the screen. Taps arrive through `TaskOverlays.handleTap`, so the plan
/// keeps panning and zooming under the pins. VoiceOver gets one button per pin on screen.
struct TaskPinsLayer: View {
    let ctx: PlanOverlayContext
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    private struct Placed: Identifiable {
        let pin: TaskPin
        let tip: CGPoint
        var id: String { pin.id }
    }

    var body: some View {
        if TaskOverlayState.shared.showPins {
            let placed = TaskOverlays.pins(ctx.model, sheetId: ctx.sheet.id)
                .filter { ctx.isOnScreen($0.x, $0.y, margin: 60) }
                .map { Placed(pin: $0, tip: ctx.point($0.x, $0.y)) }
            ZStack(alignment: .topLeading) {
                Canvas { g, _ in
                    for p in placed { TaskPinDrawing.draw(p.pin, tip: p.tip, in: &g) }
                }
                if voiceOver {
                    ForEach(placed) { p in
                        let t = p.pin.task
                        Color.clear
                            .frame(width: 36, height: 44)
                            .position(x: p.tip.x, y: p.tip.y - 22)
                            .accessibilityElement()
                            .accessibilityLabel("Task \(t.number), \(t.title), \(tr(TaskLogic.info(t.status).label, context: "Task status"))")
                            .accessibilityAddTraits(.isButton)
                            .accessibilityAction {
                                TaskOverlayState.shared.selectedId = t.id
                                TaskOverlayState.shared.detail = TaskRef(id: t.id)
                            }
                    }
                }
            }
        }
    }
}

/// Edit mode: the selected pin takes touches so it can be dragged to a new spot (logged in the task's history);
/// a tap on it opens the task. Every other pin leaves touches to the plan.
struct TaskPinHandle: View {
    let ctx: PlanOverlayContext

    var body: some View {
        let st = TaskOverlayState.shared
        if st.showPins, st.drop == nil, ctx.model.tool == .select, let id = st.selectedId,
           let pin = TaskOverlays.pins(ctx.model, sheetId: ctx.sheet.id).first(where: { $0.id == id && !$0.grey }) {
            let r = TaskPinDrawing.rect(tip: ctx.point(pin.x, pin.y), selected: true)
            let controller = ctx.controller
            let model = ctx.model
            let start = (x: pin.task.x ?? 0, y: pin.task.y ?? 0)
            Color.clear
                .frame(width: r.width + 12, height: r.height + 12)
                .contentShape(Rectangle())
                .position(x: r.midX, y: r.midY)
                .onTapGesture { st.detail = TaskRef(id: id) }
                .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .named(PlanCanvasView.space))
                    .onChanged { g in
                        let v = controller.viewport
                        let base = v.point(start.x, start.y)
                        let rel = v.relative(CGPoint(x: base.x + g.translation.width, y: base.y + g.translation.height))
                        if st.dragging == nil { Haptics.lift() }
                        st.dragging = TaskPinDrag(id: id, x: Double(rel.x), y: Double(rel.y))
                    }
                    .onEnded { _ in
                        guard let d = st.dragging, d.id == id else { return }
                        st.dragging = nil
                        model.changeTask(id) { $0.x = d.x; $0.y = d.y }
                        Haptics.tap()
                    })
                .accessibilityHidden(true)
        }
    }
}

// MARK: - controls

/// "+ Task" (arms a drop: the next tap on the plan places it), show/hide pins (red while some are hidden), pin
/// filters, and this sheet's tasks. Also presents the quick create, task detail and list sheets.
struct TaskPlanControls: View {
    let ctx: PlanControlsContext
    @State private var showList = false

    private var model: EditorModel { ctx.model }

    var body: some View {
        let st = TaskOverlayState.shared
        let sheetTasks = model.bundle.liveTasks.filter { $0.sheetId == ctx.sheet.id }
        let open = sheetTasks.filter { !TaskLogic.isClosed($0.status) }.count
        let today = TaskDates.today()
        let hiding = !st.showPins || (!st.filter.isEmpty && !st.greyOthers
            && sheetTasks.contains { TaskLogic.placement($0) == .pin && !TaskLogic.matches($0, st.filter, today: today) })
        VStack(alignment: .trailing, spacing: 8) {
            HStack(spacing: 8) {
                if let d = st.drop { dropHint(d) }
                addButton
            }
            VStack(spacing: 0) {
                control(icon: st.showPins ? "mappin.circle" : "mappin.slash.circle", label: st.showPins ? String(localized: "Hide task pins") : String(localized: "Show task pins"),
                        tint: hiding ? Color.red : Color.primary) { st.showPins.toggle() }
                Divider().frame(width: 44)
                filterMenu
                Divider().frame(width: 44)
                control(icon: "list.bullet.rectangle", label: String(localized: "Tasks on this sheet"), tint: Color.primary) { showList = true }
                    .overlay(alignment: .topTrailing) {
                        if open > 0 {
                            Text("\(open)").font(.caption2.weight(.bold)).foregroundStyle(Color.white)
                                .padding(.horizontal, 5).frame(minWidth: 18, minHeight: 18)
                                .background(Color.red, in: Capsule())
                                .offset(x: 4, y: -2)
                                .allowsHitTesting(false)
                        }
                    }
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
        }
        // A drop waits for a plan tap; picking a device or drawing tool instead cancels it.
        .onChange(of: model.tool) { _, tool in if tool != .select && st.drop != nil { st.drop = nil } }
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

    private var addButton: some View {
        let st = TaskOverlayState.shared
        let armed = st.drop == .new
        return Button {
            if !armed && model.viewerMode == .edit { model.use(.select) }
            st.drop = armed ? nil : .new
            Haptics.select()
        } label: {
            Label("Task", systemImage: "plus")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).frame(height: 44)
                .foregroundStyle(armed ? Color.white : Color.brand)
                .background(armed ? AnyShapeStyle(Color.brand) : AnyShapeStyle(Material.regularMaterial), in: Capsule())
                .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(armed ? "Cancel adding a task" : "Add a task")
        .accessibilityHint(armed ? "" : "Then tap the plan where it goes")
    }

    private func dropHint(_ d: TaskOverlayState.Drop) -> some View {
        let text: String
        switch d {
        case .new: text = String(localized: "Tap the plan to drop a task")
        case .duplicate(let t): text = String(localized: "Tap where the copy of #\(t.number) goes")
        case .move: text = String(localized: "Tap the new spot")
        }
        return Button { TaskOverlayState.shared.drop = nil } label: {
            HStack(spacing: 8) {
                Circle().fill(Color.orange).frame(width: 6, height: 6)
                Text(text).font(.subheadline.weight(.medium)).lineLimit(1)
                Image(systemName: "xmark.circle.fill").foregroundStyle(Color.white.opacity(0.7))
            }
            .foregroundStyle(Color.white)
            .padding(.horizontal, 12).frame(height: 36)
            .background(Color.ink.opacity(0.9), in: Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel("\(text). Cancel")
    }

    private func control(icon: String, label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.body.weight(.medium))
                .frame(width: 46, height: 44)
                .foregroundStyle(tint)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var filterMenu: some View {
        let st = TaskOverlayState.shared
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
                .font(.body.weight(.medium))
                .frame(width: 46, height: 44)
                .foregroundStyle(st.filter.isEmpty ? Color.primary : Color.brand)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Filter task pins")
    }

    private func sheetList(_ tasks: [PlanTask]) -> some View {
        NavigationStack {
            List {
                if tasks.isEmpty {
                    ContentUnavailableView("No tasks on this sheet", systemImage: "mappin.slash", description: Text("Tap + Task, then tap the plan."))
                }
                ForEach(tasks) { t in
                    Button { open(t) } label: { TaskRowView(task: t, sheetName: nil) }
                        .buttonStyle(.plain)
                }
            }
            .navigationTitle("\(ctx.sheet.name) · \(tasks.count)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showList = false } } }
        }
        .presentationDetents([.medium, .large])
    }

    /// A pinned task: select it and bring it on screen. One without a spot: open it.
    private func open(_ t: PlanTask) {
        let st = TaskOverlayState.shared
        showList = false
        st.selectedId = t.id
        st.showPins = true
        if TaskLogic.placement(t) == .pin, let sheetId = t.sheetId, let x = t.x, let y = t.y {
            model.focusOnPoint(sheetId: sheetId, x: x, y: y)
        } else {
            st.detail = TaskRef(id: t.id)
        }
    }
}

// MARK: - shared task views

/// Round head on top, point at the bottom centre (the spot).
struct TeardropShape: SwiftUI.Shape {
    func path(in rect: CGRect) -> Path { TaskPinDrawing.teardrop(in: rect) }
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
                    Text(tr(TaskLogic.info(task.status).short, context: "Task status")).foregroundStyle(TaskColors.status(task.status)).fontWeight(.medium)
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
