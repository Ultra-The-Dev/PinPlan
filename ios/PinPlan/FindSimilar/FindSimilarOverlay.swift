import SwiftUI
import PinPlanCore

// Find similar on the plan, through the plan overlay registry (Viewer/PlanOverlay.swift), Edit mode only:
//   • "find-similar": ghost pins (dashed, in the type's colour with its letters, constant size on screen; rejected
//     ones grey and crossed out; the one under review haloed), the symbol searched for and the box being drawn.
//     Taps: a ghost toggles rejected; while picking, a tap searches for the symbol under it. Controls: the card.
//   • "find-similar-box": while "Draw a box" is on, one finger draws a box around a symbol (the plan doesn't move).
// The tool opens from the plan's Tools menu (PlanEditorView). Registered once from PinPlanApp.

enum FindSimilarOverlays {
    @MainActor static func register() {
        let registry = PlanOverlayRegistry.shared
        registry.register(PlanOverlay(id: "find-similar", zIndex: 40, modes: [.edit], content: { ctx in
            AnyView(FindSimilarLayer(ctx: ctx))
        }, onTap: { tap in
            handleTap(tap)
        }, controls: { ctx in
            AnyView(FindSimilarCard(ctx: ctx))
        }))
        registry.register(PlanOverlay(id: "find-similar-box", zIndex: 41, allowsHitTesting: true, modes: [.edit], content: { ctx in
            AnyView(FindSimilarBoxSurface(ctx: ctx))
        }))
    }

    /// Ghost radius on screen (points).
    static let ghostRadius: CGFloat = 13

    @MainActor static func handleTap(_ tap: PlanTap) -> Bool {
        let ui = FindSimilarUI.shared
        let ctx = tap.context
        guard ui.open, ctx.mode == .edit else { return false }
        // Add sensors: a tap on a door or window leaves it out (or takes it back); other taps do nothing.
        if ui.sensors != nil {
            if let o = opening(at: tap.location, ctx: ctx) { ui.toggleExcluded(o.id) }
            return true
        }
        if let g = ghost(at: tap.location, ctx: ctx) {
            ui.toggle(g.id)
            return true
        }
        guard ui.mode == .match, ui.picking, ui.busy == nil else { return false }
        let p = tap.sheetPoint
        guard (0...1).contains(p.x), (0...1).contains(p.y) else { return true }
        ui.tapPick(model: ctx.model, sheet: ctx.sheet, at: p)
        return true
    }

    /// Add sensors: the nearest door or window within a finger's reach of a view point.
    @MainActor static func opening(at location: CGPoint, ctx: PlanOverlayContext) -> AlarmSensors.Opening? {
        let reach = max(ghostRadius + 8, 24)
        var best: (AlarmSensors.Opening, CGFloat)?
        for o in FindSimilarUI.shared.openings(ctx.model, sheet: ctx.sheet) {
            let p = ctx.point(o.x, o.y)
            let d = hypot(p.x - location.x, p.y - location.y)
            if d <= reach && (best == nil || d < best!.1) { best = (o, d) }
        }
        return best?.0
    }

    /// The nearest ghost within a finger's reach of a view point.
    @MainActor static func ghost(at location: CGPoint, ctx: PlanOverlayContext) -> FindSimilar.Found? {
        let reach = max(ghostRadius + 6, 22)
        var best: (FindSimilar.Found, CGFloat)?
        for f in FindSimilarUI.shared.shown(ctx.model, sheet: ctx.sheet) {
            let p = ctx.point(f.x, f.y)
            let d = hypot(p.x - location.x, p.y - location.y)
            if d <= reach && (best == nil || d < best!.1) { best = (f, d) }
        }
        return best?.0
    }
}

extension EditorModel {
    /// Several devices of any types as one undo step (Add sensors). A blank room takes the room printed on the plan
    /// where the device lands. Returns how many were added (0 when the job is read-only).
    func addMarkers(_ items: [(type: DeviceType, x: Double, y: Double, room: String)], sheetId: String) -> Int {
        let details = planDetails[sheetId] ?? []
        var n = 0
        let ok = edit { b in
            for it in items {
                let room = it.room.isEmpty ? (PlanReader.room(atX: it.x, y: it.y, details: details) ?? "") : it.room
                _ = b.addMarker(type: it.type, sheetId: sheetId, x: it.x, y: it.y, room: room)
                n += 1
            }
        }
        return ok ? n : 0
    }

    /// Several devices of one type as one undo step (Find similar's Accept all). Each takes the room printed on the
    /// plan where it lands. Returns how many were added (0 when the job is read-only).
    func addMarkers(type: DeviceType, sheetId: String, at points: [PlanPoint]) -> Int {
        let details = planDetails[sheetId] ?? []
        var n = 0
        let ok = edit { b in
            for p in points {
                let room = PlanReader.room(atX: p.x, y: p.y, details: details) ?? ""
                _ = b.addMarker(type: type, sheetId: sheetId, x: p.x, y: p.y, room: room)
                n += 1
            }
        }
        return ok ? n : 0
    }
}

/// Ghost pins, the searched symbol and the box being drawn, in one Canvas. Touches go to the plan.
struct FindSimilarLayer: View {
    let ctx: PlanOverlayContext

    var body: some View {
        let ui = FindSimilarUI.shared
        if ui.open, let draft = ui.sensors {
            sensorsLayer(ui, draft)
        } else if ui.open {
            let type = ui.typeId.flatMap { ctx.model.app.type($0) }
            let color = Color(hex: type?.color ?? "#475569")
            let letters = type?.symbol ?? "?"
            let shown = ui.shown(ctx.model, sheet: ctx.sheet)
            let current = ui.review.flatMap { $0 < shown.count ? shown[$0].id : nil }
            // Screen positions worked out before drawing, so the Canvas only strokes paths.
            let ghosts: [(f: FindSimilar.Found, c: CGPoint)] = shown.filter { ctx.isOnScreen($0.x, $0.y) }.map { ($0, ctx.point($0.x, $0.y)) }
            let sheet = ctx.sheet
            let templateRect: CGRect? = (ui.source == .match && ui.sheetId == sheet.id) ? ui.template.map { t in
                rect(PlanPoint(x: t.x / sheet.width, y: t.y / sheet.height), PlanPoint(x: (t.x + t.w) / sheet.width, y: (t.y + t.h) / sheet.height))
            } : nil
            let dragRect = ui.drag.map { rect($0.a, $0.b) }
            let r = FindSimilarOverlays.ghostRadius
            Canvas { g, _ in
                let dash = StrokeStyle(lineWidth: 2, dash: [6, 4])
                if let t = templateRect { g.stroke(Path(t), with: .color(.brand), style: dash) }
                if let d = dragRect {
                    g.fill(Path(d), with: .color(Color.brand.opacity(0.08)))
                    g.stroke(Path(d), with: .color(.brand), style: dash)
                }
                for (f, c) in ghosts {
                    let ink = f.rejected ? Color.gray : color
                    let circle = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
                    if f.id == current {
                        let halo = Path(ellipseIn: CGRect(x: c.x - r - 7, y: c.y - r - 7, width: 2 * r + 14, height: 2 * r + 14))
                        g.fill(halo, with: .color(Color.brand.opacity(0.18)))
                        g.stroke(halo, with: .color(.brand), lineWidth: 3)
                    }
                    g.fill(circle, with: .color(Color.white.opacity(f.rejected ? 0.5 : 0.8)))
                    g.stroke(circle, with: .color(ink), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                    let size: CGFloat = letters.count > 2 ? 8.5 : 11.5
                    g.draw(Text(verbatim: letters).font(.system(size: size, weight: .bold)).foregroundColor(ink), at: c)
                    if f.rejected {
                        var x = Path()
                        x.move(to: CGPoint(x: c.x - r * 0.8, y: c.y + r * 0.8))
                        x.addLine(to: CGPoint(x: c.x + r * 0.8, y: c.y - r * 0.8))
                        g.stroke(x, with: .color(.gray), lineWidth: 2)
                    }
                    if let tag = f.tag {
                        g.draw(Text(verbatim: tag).font(.system(size: 11, weight: .bold)).foregroundColor(ink),
                               at: CGPoint(x: c.x + r + 3, y: c.y), anchor: .leading)
                    }
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// Add sensors: a ring around each door and window (grey and crossed out when left out) and a dashed pin with the
    /// sensor's letters where each will go.
    private func sensorsLayer(_ ui: FindSimilarUI, _ draft: FindSimilarUI.SensorsDraft) -> some View {
        let rings: [(c: CGPoint, out: Bool)] = ui.openings(ctx.model, sheet: ctx.sheet).filter { ctx.isOnScreen($0.x, $0.y) }
            .map { (ctx.point($0.x, $0.y), draft.excluded.contains($0.id)) }
        let pins: [(c: CGPoint, letters: String, color: Color)] = ui.sensorPlan(ctx.model, sheet: ctx.sheet).placements
            .filter { ctx.isOnScreen($0.x, $0.y) }
            .map { p in
                let t = ctx.model.app.type(p.deviceTypeId)
                return (ctx.point(p.x, p.y), t?.symbol ?? "?", Color(hex: t?.color ?? "#475569"))
            }
        let r = FindSimilarOverlays.ghostRadius
        return Canvas { g, _ in
            for (c, out) in rings {
                let ring = Path(ellipseIn: CGRect(x: c.x - r - 5, y: c.y - r - 5, width: 2 * r + 10, height: 2 * r + 10))
                if out {
                    g.fill(ring, with: .color(Color.gray.opacity(0.25)))
                    g.stroke(ring, with: .color(.gray), lineWidth: 2)
                    var x = Path()
                    x.move(to: CGPoint(x: c.x - r, y: c.y + r))
                    x.addLine(to: CGPoint(x: c.x + r, y: c.y - r))
                    g.stroke(x, with: .color(.gray), lineWidth: 2.5)
                } else {
                    g.stroke(ring, with: .color(.brand), style: StrokeStyle(lineWidth: 2, dash: [3, 3]))
                }
            }
            for (c, letters, color) in pins {
                let circle = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
                g.fill(circle, with: .color(Color.white.opacity(0.85)))
                g.stroke(circle, with: .color(color), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                g.draw(Text(verbatim: letters).font(.system(size: letters.count > 2 ? 8.5 : 11.5, weight: .bold)).foregroundColor(color), at: c)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func rect(_ a: PlanPoint, _ b: PlanPoint) -> CGRect {
        let p = ctx.point(a.x, a.y), q = ctx.point(b.x, b.y)
        return CGRect(x: min(p.x, q.x), y: min(p.y, q.y), width: abs(p.x - q.x), height: abs(p.y - q.y))
    }
}

/// While "Draw a box" is on: one finger draws a box around a symbol. Covers the plan only then.
struct FindSimilarBoxSurface: View {
    let ctx: PlanOverlayContext

    var body: some View {
        let ui = FindSimilarUI.shared
        if ui.open, ui.sensors == nil, ui.boxMode, ui.picking, ui.mode == .match, ui.busy == nil {
            let controller = ctx.controller
            let model = ctx.model
            let sheet = ctx.sheet
            Color.clear
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 2, coordinateSpace: .named(PlanCanvasView.space))
                    .onChanged { g in
                        let v = controller.viewport
                        let a = v.relative(g.startLocation), b = v.relative(g.location)
                        ui.drag = FindSimilarUI.DragBox(a: PlanPoint(x: Double(a.x), y: Double(a.y)), b: PlanPoint(x: Double(b.x), y: Double(b.y)))
                    }
                    .onEnded { _ in
                        guard let d = ui.drag else { return }
                        ui.drag = nil
                        ui.boxPick(model: model, sheet: sheet, d)
                    })
                .accessibilityHidden(true)
        }
    }
}

// MARK: - the card

/// Find similar's card in the plan's controls column: what to count, Match a symbol / Read tags, the results
/// ("Found 14 · Accept all · Review one by one · Clear"), the sensitivity slider and this floor's door / window count.
struct FindSimilarCard: View {
    @Environment(\.horizontalSizeClass) private var hSize
    let ctx: PlanControlsContext

    private var model: EditorModel { ctx.model }
    private var sheet: Sheet { ctx.sheet }
    private var cardWidth: CGFloat { hSize == .compact ? 280 : 360 }

    var body: some View {
        let ui = FindSimilarUI.shared
        if ui.open {
            VStack(alignment: .leading, spacing: 10) {
                header
                if let draft = ui.sensors {
                    AlarmSensorsSection(model: model, sheet: sheet, draft: draft)
                } else {
                    findBody(ui)
                }
            }
            .padding(12)
            .frame(width: cardWidth, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            .onChange(of: sheet.id) { _, id in ui.sheetChanged(to: id) }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("find-similar")
        }
    }

    @ViewBuilder private func findBody(_ ui: FindSimilarUI) -> some View {
        typeRow
        Picker("How to find", selection: Binding(get: { ui.mode }, set: { ui.setMode($0) })) {
            Text("Match a symbol").tag(FindSimilarUI.Mode.match)
            Text("Read tags").tag(FindSimilarUI.Mode.tags)
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("find-mode")
        if ui.mode == .tags && ui.found.isEmpty && ui.busy == nil { tagsForm }
        if let busy = ui.busy { busyRow(busy, ui.progress) }
        if ui.busy == nil && ui.mode == .match && ui.picking { pickHint }
        if let note = ui.note, ui.busy == nil {
            Text(note).font(.footnote).foregroundStyle(Color.primary)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityIdentifier("find-note")
        }
        let shown = ui.shown(model, sheet: sheet)
        if ui.busy == nil && ui.sheetId == sheet.id && !ui.found.isEmpty {
            if let i = ui.review, i < shown.count { reviewBar(shown, i) } else { results(shown) }
        }
        summary
        if !ui.openings(model, sheet: sheet).isEmpty {
            Button { ui.openSensors(model: model) } label: { Label("Add alarm sensors", systemImage: "checkmark.shield") }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityIdentifier("find-add-sensors")
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "square.on.square.dashed").foregroundStyle(Color.brand)
            Text("Find similar").font(.headline)
            Spacer(minLength: 4)
            Button { FindSimilarUI.shared.close() } label: {
                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Color.secondary)
                    .frame(width: 36, height: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }

    private var typeRow: some View {
        let ui = FindSimilarUI.shared
        let types = FindSimilar.countableTypes(model.app.catalog)
        return HStack(spacing: 8) {
            Text("Count as").font(.subheadline).foregroundStyle(Color.secondary)
            Spacer(minLength: 4)
            Menu {
                ForEach(types) { t in
                    Button { ui.setType(t) } label: {
                        if t.id == ui.typeId { Label(t.name, systemImage: "checkmark") } else { Text(t.name) }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    if let t = ui.typeId.flatMap({ model.app.type($0) }) {
                        DeviceSymbol(type: t, size: 20)
                        Text(t.name).lineLimit(1)
                    }
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .font(.subheadline.weight(.semibold))
            }
            .accessibilityIdentifier("find-type")
        }
    }

    private var tagsForm: some View {
        @Bindable var ui = FindSimilarUI.shared
        return HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Tags start with").font(.caption).foregroundStyle(Color.secondary)
                TextField(text: $ui.prefixes, prompt: Text(verbatim: "D, DR")) { Text("Tags start with") }
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { ui.runTags(model: model, sheet: sheet) }
                    .accessibilityIdentifier("find-prefixes")
            }
            Button("Read tags") { ui.runTags(model: model, sheet: sheet) }
                .buttonStyle(.borderedProminent)
                .tint(Color.brand)
                .accessibilityIdentifier("find-read-tags")
        }
    }

    private func busyRow(_ text: String, _ progress: Double?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                ProgressView()
                Text(text).font(.subheadline).foregroundStyle(Color.secondary)
            }
            if let progress { ProgressView(value: progress).tint(Color.brand) }
        }
    }

    private var pickHint: some View {
        @Bindable var ui = FindSimilarUI.shared
        return VStack(alignment: .leading, spacing: 8) {
            Text(ui.boxMode ? "Drag a box around one symbol. Turn off Draw a box to move the plan."
                            : "Tap one symbol on the plan, or draw a box around it. Turned and mirrored copies count too.")
                .font(.footnote).foregroundStyle(Color.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("find-hint")
            Toggle(isOn: $ui.boxMode) { Label("Draw a box", systemImage: "rectangle.dashed") }
                .font(.subheadline)
                .tint(Color.brand)
                .accessibilityIdentifier("find-box")
        }
    }

    private func results(_ shown: [FindSimilar.Found]) -> some View {
        @Bindable var ui = FindSimilarUI.shared
        let kept = shown.filter { !$0.rejected }.count
        let rejected = shown.count - kept
        let typeName = ui.typeId.flatMap { model.app.type($0)?.name } ?? ""
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("Found \(shown.count)").font(.headline).monospacedDigit()
                if rejected > 0 { Text("Rejected: \(rejected)").font(.subheadline).foregroundStyle(Color.secondary).monospacedDigit() }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("find-count")
            Group {
                if !shown.isEmpty {
                    Text("Suggestions don’t count until you accept them. Tap one on the plan to reject it.")
                } else if ui.source == .match {
                    Text("Nothing new at this sensitivity: move the slider, or every match already has a device of this type on it.")
                } else {
                    Text("Every tag already has a device of this type next to it.")
                }
            }
            .font(.caption).foregroundStyle(Color.secondary)
            .fixedSize(horizontal: false, vertical: true)
            if ui.source == .match {
                VStack(spacing: 0) {
                    Slider(value: $ui.sensitivity, in: 0...100, step: 1)
                        .tint(Color.brand)
                        .accessibilityLabel("Sensitivity")
                        .accessibilityIdentifier("find-sensitivity")
                    HStack {
                        Text("Fewer")
                        Spacer(minLength: 8)
                        Text("More matches")
                    }
                    .font(.caption).foregroundStyle(Color.secondary)
                    .accessibilityHidden(true)
                }
            }
            HStack(spacing: 8) {
                Button { ui.acceptAll(model: model, sheet: sheet) } label: {
                    Label("Accept all \(kept)", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.brand)
                .disabled(kept == 0)
                .accessibilityHint(typeName)
                .accessibilityIdentifier("find-accept-all")
                Button("Review one by one") { goTo(0, shown) }
                    .buttonStyle(.bordered)
                    .disabled(shown.isEmpty)
                    .accessibilityIdentifier("find-review")
            }
            .controlSize(.small)
            Button("Clear") { ui.clear() }
                .font(.subheadline)
                .accessibilityIdentifier("find-clear")
        }
    }

    private func reviewBar(_ shown: [FindSimilar.Found], _ i: Int) -> some View {
        let ui = FindSimilarUI.shared
        let f = shown[i]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("\(i + 1) of \(shown.count)").font(.headline).monospacedDigit()
                if let tag = f.tag { Text(verbatim: "· \(tag)").font(.headline) }
                if f.rejected { Text("Rejected").font(.subheadline).foregroundStyle(Color.secondary) }
            }
            HStack(spacing: 8) {
                Button { goTo(i - 1, shown) } label: { Image(systemName: "chevron.left") }
                    .disabled(i == 0)
                    .accessibilityLabel("Previous")
                Button {
                    if f.rejected { ui.toggle(f.id) }
                    goTo(i + 1, shown)
                } label: { Label("Keep", systemImage: "checkmark") }
                    .buttonStyle(.borderedProminent).tint(Color.brand)
                    .accessibilityIdentifier("find-keep")
                Button {
                    if !f.rejected { ui.toggle(f.id) }
                    goTo(i + 1, shown)
                } label: { Label("Reject", systemImage: "xmark") }
                    .accessibilityIdentifier("find-reject")
                Button { goTo(i + 1, shown) } label: { Image(systemName: "chevron.right") }
                    .accessibilityLabel("Next")
                Spacer(minLength: 0)
                Button("Done") { ui.review = nil }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("find-review-bar")
    }

    /// Review one by one: zoom to a find; past the last one, back to the results.
    private func goTo(_ i: Int, _ shown: [FindSimilar.Found]) {
        let ui = FindSimilarUI.shared
        guard i >= 0, i < shown.count else { ui.review = nil; return }
        ui.review = i
        let f = shown[i]
        // About eight symbols across, so the find and what's around it are both readable.
        let side = ui.template.map { 8 * max($0.w / sheet.width, $0.h / sheet.height) } ?? 0.08
        let s = min(0.5, max(0.03, side))
        ctx.controller.show(PlanRect(x: f.x - s / 2, y: f.y - s / 2, width: s, height: s))
    }

    /// "On this floor: Door 9 · Window 10" (door / window types and the type being counted).
    @ViewBuilder private var summary: some View {
        let rows = FindSimilar.floorSummary(types: FindSimilar.countableTypes(model.app.catalog), markers: model.bundle.liveMarkers,
                                            sheetId: sheet.id, countingTypeId: FindSimilarUI.shared.typeId)
        if !rows.isEmpty {
            Divider()
            VStack(alignment: .leading, spacing: 3) {
                Text("On this floor").font(.caption.weight(.medium)).foregroundStyle(Color.secondary)
                Text(verbatim: rows.map { "\($0.type.name): \($0.count)" }.joined(separator: " · "))
                    .font(.caption).monospacedDigit()
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("find-summary")
        }
    }
}
