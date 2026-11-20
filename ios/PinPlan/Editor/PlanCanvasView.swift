import SwiftUI
import PinPlanCore

/// The plan sheet with its markup. The sheet itself zooms and pans in a UIScrollView (PlanZoomView: native
/// physics, tiled rendering); devices, runs, closets and overlays are drawn on top by SwiftUI from the live
/// `PlanViewport`, so symbols stay the same size on screen. All touches on the plan arrive through the zoom
/// view's gestures and are handled here. Positions are relative (0…1) to the sheet image.
struct PlanCanvasView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController
    /// Apple Pencil places and draws; fingers only pan (iPad option).
    var pencilDraws = false
    /// Swipe in from a side edge: −1 previous sheet, +1 next.
    var onEdgeSwipe: (Int) -> Void = { _ in }

    /// Live positions (relative) of items being dragged, by id.
    @State private var dragging: [String: CGPoint] = [:]
    @State private var lifted: Lifted?
    /// Finger position while aiming in precision mode (scale line / measure).
    @State private var aim: CGPoint?
    /// Device whose quick actions are showing (press and hold without dragging).
    @State private var quickMarker: String?
    @State private var edgeHint: EdgeHint?
    @State private var imageOnDevice = true
    /// Where Apple Pencil (or the pointer) hovers while placing: a faint preview of the device that would land there.
    @State private var hoverPoint: CGPoint?
    /// Shake to undo and the three-finger undo gestures, forwarded to the editor's history (Edit mode only).
    @State private var systemUndo = EditorUndoManager()

    struct Lifted: Equatable {
        enum Kind: Equatable { case marker, closet }
        let id: String
        let kind: Kind
        /// Finger-to-item offset at pick-up (view points), so the item doesn't jump under the finger.
        let grab: CGSize
    }

    struct EdgeHint: Equatable {
        let side: Int
        let progress: Double
    }

    static let space = "plan-canvas"

    private var source: PlanTileSource {
        let pdfURL: URL? = sheet.sourcePdfId.flatMap { app.store.hasPDF($0) ? app.store.pdfURL($0) : nil }
        return PlanTileSource(imageId: sheet.imageId, imageURL: PlanTileStore.sourceURL(imageId: sheet.imageId, store: app.store),
                              sheetSize: sheet.planSize, pdfId: pdfURL == nil ? nil : sheet.sourcePdfId, pdfURL: pdfURL,
                              pdfPage: pdfURL == nil ? nil : sheet.sourcePage, rotation: sheet.sourceRotation ?? 0)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(.systemGray6)
            if imageOnDevice {
                PlanZoomView(source: source, sheetId: sheet.id, controller: controller, config: zoomConfig, handlers: handlers,
                             accessibilityName: String(localized: "Plan, \(sheet.name)"))
            } else {
                ProgressView("Downloading the plan…").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            PlanMarkupLayer(model: model, sheet: sheet, controller: controller, dragging: dragging, liftedId: lifted?.id)
                .allowsHitTesting(false)
            RunHandlesLayer(model: model, sheet: sheet, controller: controller, dragging: $dragging)
            PlanOverlayHost(model: model, sheet: sheet, controller: controller)
            if let h = model.highlight, h.sheetId == sheet.id {
                PlanPinned(controller: controller, x: h.x, y: h.y) { PulseRing() }.allowsHitTesting(false)
            }
            if let id = quickMarker, let m = model.bundle.liveMarkers.first(where: { $0.id == id }), model.viewerMode == .edit {
                PlanPinned(controller: controller, x: m.x, y: m.y, dy: -CGFloat(48)) {
                    QuickActionsBar(model: model, marker: m) { quickMarker = nil }
                }
            }
            if let hoverPoint, editing, case .place(let typeId) = model.tool, controller.viewport.isOnSheet(PlanPoint(hoverPoint)) {
                PlacementGhost(type: app.type(typeId), point: hoverPoint,
                               size: CGFloat(PlanMarkerMetrics.symbolSize(zoom: controller.viewport.zoom, fitZoom: controller.limits.lowerBound)))
            }
            if let aim, precisionMode, let image = app.store.image(sheet.imageId) {
                Loupe(image: image, point: aim, viewport: controller.viewport)
            }
            if let edgeHint { EdgeSwipeHint(hint: edgeHint, hasTarget: model.neighborSheet(edgeHint.side) != nil) }
            if voiceOver { MarkerAccessibilityLayer(model: model, sheet: sheet, controller: controller) }
        }
        .coordinateSpace(.named(Self.space))
        .clipped()
        .task(id: sheet.imageId) { await waitForImage() }
        .onChange(of: model.fitRequest) { _, _ in controller.fit() }
        .onChange(of: model.focus) { _, f in applyFocus(f) }
        .onChange(of: model.tool) { _, _ in quickMarker = nil; hoverPoint = nil }
        .onChange(of: model.viewerMode) { _, _ in quickMarker = nil; hoverPoint = nil }
        .onAppear { systemUndo.model = model }
    }

    /// The sheet image may still be on its way from cloud sync: check again every couple of seconds.
    private func waitForImage() async {
        imageOnDevice = app.store.hasImage(sheet.imageId)
        while !imageOnDevice && !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2))
            imageOnDevice = app.store.hasImage(sheet.imageId)
        }
    }

    // MARK: modes

    private var precisionMode: Bool {
        switch model.tool {
        case .calibrate, .measure: return true
        default: return false
        }
    }

    private var editing: Bool { model.viewerMode == .edit }

    /// Placing or drawing: taps must land instantly, and Pencil (if chosen) is the pen.
    private var toolDraws: Bool { editing && model.tool != .select }

    private var zoomConfig: PlanZoomConfig {
        PlanZoomConfig(doubleTapZooms: !toolDraws, precision: editing && precisionMode, pencilDraws: pencilDraws && toolDraws,
                       liftEnabled: editing && model.tool == .select)
    }

    private var handlers: PlanGestureHandlers {
        var h = PlanGestureHandlers()
        h.tap = { loc, pencil in handleTap(loc, pencil: pencil) }
        h.canLift = { loc in liftTarget(at: loc) != nil }
        h.liftBegan = { loc in beginLift(at: loc) }
        h.liftMoved = { loc in moveLift(to: loc) }
        h.liftEnded = { loc, moved in endLift(at: loc, moved: moved) }
        h.aim = { p in aim = p }
        h.aimEnded = { p in
            aim = nil
            let v = controller.viewport
            if v.isOnSheet(PlanPoint(p)) {
                let r = v.relative(p)
                model.tap(x: Double(r.x), y: Double(r.y), hitMarker: nil, hitCloset: nil)
            }
        }
        h.edgeProgress = { p in edgeHint = p.map { EdgeHint(side: $0.0, progress: $0.1) } }
        h.edgeSwipe = { side in onEdgeSwipe(side) }
        h.firstLayout = { applyInitialView() }
        h.settled = { v in
            if v.isReady { ViewerPrefs.saveViewState(PlanViewState(v), sheetId: sheet.id) }
        }
        h.hover = { p in
            // Only while placing (a redraw per pointer move otherwise buys nothing).
            if case .place = model.tool, editing { hoverPoint = p } else if hoverPoint != nil { hoverPoint = nil }
        }
        h.pencilAction = { model.switchToLastTool() }
        h.undoManager = editing ? systemUndo : nil
        return h
    }

    // MARK: first view, focus

    private func applyInitialView() {
        if let f = model.focus, f.sheetId == sheet.id, f.n != controller.appliedFocus {
            applyFocus(f)
        } else if ViewerPrefs.launchFlag("viewer-zoomed") {
            zoomToBusiestArea()
        } else if let s = ViewerPrefs.viewState(sheetId: sheet.id) {
            controller.restore(s)
        }
    }

    private func applyFocus(_ f: FocusRequest?) {
        guard let f, f.sheetId == sheet.id, f.n != controller.appliedFocus, controller.viewport.isReady else { return }
        controller.appliedFocus = f.n
        let z = max(controller.viewport.zoom, controller.limits.lowerBound * 2.5)
        controller.center(on: PlanPoint(x: f.x, y: f.y), zoom: z)
    }

    /// Screenshots: zoom into the densest cluster of devices on this sheet.
    private func zoomToBusiestArea() {
        let pts = model.bundle.liveMarkers.filter { $0.sheetId == sheet.id }.map { PlanPoint(x: $0.x, y: $0.y) }
        guard let d = PlanDensity.densest(pts, cell: 0.25) else { return }
        controller.center(on: d.center, zoom: controller.limits.lowerBound * 3, animated: false)
    }

    // MARK: hit testing

    /// The device nearest to a touch, within reach of it: a tap's reach, or a press-and-hold's (`lift`), which is a
    /// little wider so a finger covering the symbol still picks it up.
    private func nearestMarker(_ loc: CGPoint, lift: Bool = false) -> Marker? {
        let v = controller.viewport
        let size = PlanMarkerMetrics.symbolSize(zoom: v.zoom, fitZoom: controller.limits.lowerBound)
        let tol = CGFloat(lift ? PlanMarkerMetrics.liftRadius(symbolSize: size) : PlanMarkerMetrics.hitRadius(symbolSize: size))
        var best: (Marker, CGFloat)?
        for m in model.visibleMarkers(on: sheet.id, types: model.typesById) {
            let p = v.point(m.x, m.y)
            let d = hypot(p.x - loc.x, p.y - loc.y)
            if d < tol, d < (best?.1 ?? .infinity) { best = (m, d) }
        }
        return best?.0
    }

    private func nearestCloset(_ loc: CGPoint) -> Closet? {
        let v = controller.viewport
        var best: (Closet, CGFloat)?
        for c in model.visibleClosets(on: sheet.id) {
            // The badge sits a little below its point (see ClosetBadge).
            let p = v.point(c.x, c.y)
            let d = hypot(p.x - loc.x, p.y + 8 - loc.y)
            if d < 30, d < (best?.1 ?? .infinity) { best = (c, d) }
        }
        return best?.0
    }

    private func hitRun(_ loc: CGPoint) -> String? {
        let v = controller.viewport
        var best: (String, CGFloat)?
        for r in model.visibleRuns(on: sheet.id) {
            var i = 2
            while i + 1 < r.points.count {
                let a = v.point(r.points[i - 2], r.points[i - 1]), b = v.point(r.points[i], r.points[i + 1])
                let d = segmentDistance(loc, a, b)
                if d < 16, d < (best?.1 ?? .infinity) { best = (r.id, d) }
                i += 2
            }
        }
        return best?.0
    }

    private func segmentDistance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y
        let len2 = dx * dx + dy * dy
        let t: CGFloat = len2 == 0 ? 0 : max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }

    // MARK: taps

    private func handleTap(_ loc: CGPoint, pencil: Bool) {
        let v = controller.viewport
        guard v.isReady else { return }
        let ctx = PlanOverlayContext(viewport: v, sheet: sheet, model: model, mode: model.viewerMode, controller: controller)
        if PlanOverlayRegistry.shared.handleTap(PlanTap(location: loc, sheetPoint: v.toSheet(PlanPoint(loc)), fromPencil: pencil, context: ctx)) { return }
        if quickMarker != nil { quickMarker = nil; return }
        // "Pencil draws": a finger tap while placing/drawing only dismisses, it never places.
        if pencilDraws && toolDraws && !pencil { return }
        guard v.isOnSheet(PlanPoint(loc)) else {
            if model.tool == .select { model.selection = nil }
            return
        }
        let hitM = nearestMarker(loc)?.id
        let hitC = nearestCloset(loc)?.id
        if !editing || model.tool == .select {
            if let m = hitM {
                if editing { model.tapMarker(m) } else { model.selection = .marker(m) }
                Haptics.select()
                return
            }
            if let c = hitC { model.selection = .closet(c); Haptics.select(); return }
            if let r = hitRun(loc) { model.selection = .run(r); Haptics.select(); return }
            if !editing { model.selection = nil; return }
        }
        let r = v.relative(loc)
        model.tap(x: Double(r.x), y: Double(r.y), hitMarker: hitM, hitCloset: hitC)
    }

    // MARK: press, hold and drag

    private func liftTarget(at loc: CGPoint) -> Lifted? {
        guard editing, model.tool == .select else { return nil }
        let v = controller.viewport
        if let m = nearestMarker(loc, lift: true) {
            let p = v.point(m.x, m.y)
            return Lifted(id: m.id, kind: .marker, grab: CGSize(width: p.x - loc.x, height: p.y - loc.y))
        }
        if let c = nearestCloset(loc) {
            let p = v.point(c.x, c.y)
            return Lifted(id: c.id, kind: .closet, grab: CGSize(width: p.x - loc.x, height: p.y - loc.y))
        }
        return nil
    }

    private func beginLift(at loc: CGPoint) {
        guard let t = liftTarget(at: loc) else { return }
        lifted = t
        quickMarker = nil
        Haptics.lift()
    }

    private func moveLift(to loc: CGPoint) {
        guard let t = lifted else { return }
        dragging[t.id] = controller.viewport.relative(CGPoint(x: loc.x + t.grab.width, y: loc.y + t.grab.height))
    }

    private func endLift(at loc: CGPoint, moved: Bool) {
        guard let t = lifted else { return }
        lifted = nil
        let target = dragging[t.id]
        dragging[t.id] = nil
        guard moved, let r = target else {
            // Held without dragging: quick actions for a device, select a closet.
            switch t.kind {
            case .marker: quickMarker = t.id
            case .closet: model.selection = .closet(t.id)
            }
            return
        }
        let pricing = model.pricing
        let x = Double(r.x), y = Double(r.y)
        switch t.kind {
        case .marker: model.edit { $0.updateMarker(t.id, pricing: pricing) { $0.x = x; $0.y = y } }
        case .closet: model.edit { $0.updateCloset(t.id, pricing: pricing) { $0.x = x; $0.y = y } }
        }
        Haptics.tap()
    }
}

/// Places content at a sheet-relative point, following the plan as it moves.
struct PlanPinned<Content: View>: View {
    let controller: PlanViewportController
    let x: Double
    let y: Double
    var dy: CGFloat = 0
    @ViewBuilder var content: Content

    var body: some View {
        let v = controller.viewport
        if v.isReady {
            let p = v.point(x, y)
            content.position(x: p.x, y: p.y + dy)
        }
    }
}

/// Drag handles on the selected run's points (Edit mode). These few views take touches directly; everywhere
/// else touches go through to the plan.
private struct RunHandlesLayer: View {
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController
    @Binding var dragging: [String: CGPoint]

    var body: some View {
        if case .run(let rid)? = model.selection, model.tool == .select, model.viewerMode == .edit,
           let run = model.bundle.liveRuns.first(where: { $0.id == rid }), run.sheetId == sheet.id, controller.sheetViewport(for: sheet.id).isReady {
            let v = controller.viewport
            ForEach(0..<(run.points.count / 2), id: \.self) { i in
                let key = "\(run.id)#\(i)"
                let p = dragging[key] ?? CGPoint(x: run.points[i * 2], y: run.points[i * 2 + 1])
                Circle().fill(Color.white).overlay(Circle().stroke(Color.brand, lineWidth: 2))
                    .frame(width: 22, height: 22)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
                    .position(v.point(Double(p.x), Double(p.y)))
                    .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .named(PlanCanvasView.space))
                        .onChanged { g in dragging[key] = controller.viewport.relative(g.location) }
                        .onEnded { g in
                            let r = controller.viewport.relative(g.location)
                            dragging[key] = nil
                            model.edit { b in b.updateRun(run.id) { $0.points[i * 2] = Double(r.x); $0.points[i * 2 + 1] = Double(r.y) } }
                        })
                    .accessibilityLabel("Run point \(i + 1)")
            }
        }
    }
}

/// Press-and-hold on a device without dragging: its quick actions, floating above it.
private struct QuickActionsBar: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let marker: Marker
    let onDone: () -> Void

    var body: some View {
        HStack(spacing: 2) {
            button(String(localized: "Edit"), "slider.horizontal.3") { model.selection = .marker(marker.id) }
            button(marker.tentative ? String(localized: "Confirm") : String(localized: "Optional"), "questionmark.circle") {
                let pricing = model.pricing
                model.edit { $0.updateMarker(marker.id, pricing: pricing) { $0.tentative.toggle() } }
            }
            button(String(localized: "Duplicate"), "plus.square.on.square") {
                guard let t = app.type(marker.deviceTypeId) else { return }
                model.edit { $0.addMarker(type: t, sheetId: marker.sheetId, x: marker.x + 0.015, y: marker.y + 0.015, room: marker.room, tentative: marker.tentative) }
            }
            button(String(localized: "More"), "hand.tap") { model.use(.place(marker.deviceTypeId)) }
            button(String(localized: "Delete"), "trash", role: .destructive) {
                model.edit { $0.deleteMarker(marker.id) }
                if model.selection == .marker(marker.id) { model.selection = nil }
            }
        }
        .padding(4)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: Color.black.opacity(0.18), radius: 10, y: 3)
        .fixedSize()
    }

    private func button(_ title: String, _ icon: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(role: role) {
            action()
            if role == .destructive { Haptics.remove() } else { Haptics.tap() }
            onDone()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: icon).font(.body.weight(.semibold))
                Text(title).font(.caption2.weight(.medium)).lineLimit(1)
            }
            .frame(minWidth: 52, minHeight: 44)
            .foregroundStyle(role == .destructive ? Color.red : Color.primary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }
}

/// VoiceOver: devices on screen as buttons (the plan itself is one drawing).
private struct MarkerAccessibilityLayer: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController

    var body: some View {
        let v = controller.sheetViewport(for: sheet.id)
        if v.isReady {
            let photoMarkers = Set(model.bundle.photos.compactMap { $0.deleted == true ? nil : $0.markerId })
            let onScreen = model.visibleMarkers(on: sheet.id, types: model.typesById)
                .filter { v.isOnScreen(PlanPoint(x: $0.x, y: $0.y)) }
                .prefix(150)
            ForEach(Array(onScreen)) { m in
                let name = app.type(m.deviceTypeId)?.name ?? String(localized: "Device")
                Color.clear
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
                    .position(v.point(m.x, m.y))
                    .accessibilityElement()
                    .accessibilityLabel(label(m, name: name, photos: photoMarkers.contains(m.id)))
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { model.selection = .marker(m.id) }
                    .allowsHitTesting(false)
            }
        }
    }
}

@MainActor
extension MarkerAccessibilityLayer {
    func label(_ m: Marker, name: String, photos: Bool) -> String {
        var parts = ["\(name) \(m.label)"]
        if m.tentative { parts.append("optional") }
        if !m.room.isEmpty { parts.append(m.room) }
        if photos { parts.append(String(localized: "has photos")) }
        if model.isSelected(m.id) { parts.append("selected") }
        return parts.joined(separator: ", ")
    }
}

/// Apple Pencil hover (or the pointer) while placing: the device that a tap would drop there, faint, so the nib's
/// landing spot is visible before it touches the glass.
private struct PlacementGhost: View {
    let type: DeviceType?
    let point: CGPoint
    let size: CGFloat

    var body: some View {
        DeviceSymbol(type: type, size: size)
            .opacity(0.45)
            .position(point)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Feedback while swiping in from a side edge to change sheets.
private struct EdgeSwipeHint: View {
    let hint: PlanCanvasView.EdgeHint
    let hasTarget: Bool

    var body: some View {
        GeometryReader { geo in
            let armed = hint.progress >= 1 && hasTarget
            Image(systemName: hasTarget ? (hint.side < 0 ? "chevron.left" : "chevron.right") : "nosign")
                .font(.title2.weight(.bold))
                .foregroundStyle(armed ? Color.white : Color.primary)
                .frame(width: 52, height: 52)
                .background(armed ? Color.brand : Color(.secondarySystemBackground), in: Circle())
                .shadow(color: Color.black.opacity(0.15), radius: 6, y: 2)
                .position(x: hint.side < 0 ? CGFloat(14 + 40 * hint.progress) : geo.size.width - CGFloat(14 + 40 * hint.progress),
                          y: geo.size.height / 2)
                .opacity(min(1, hint.progress * 2))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct ClosetBadge: View {
    let closet: Closet
    var selected = false
    var body: some View {
        let info = Catalog.closetInfo(closet.kind)
        VStack(spacing: 2) {
            Text(info.abbrev).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(Color(hex: info.color), in: RoundedRectangle(cornerRadius: 7))
                .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.brand, lineWidth: selected ? 3 : 0).padding(-4))
                .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
            Text(closet.name).font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: info.color))
                .padding(.horizontal, 3).background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 3))
        }
        .offset(y: 8)
    }
}

/// 3× magnifier with a crosshair, shown above the finger so the exact point stays visible.
private struct Loupe: View {
    let image: UIImage
    let point: CGPoint
    let viewport: PlanViewport
    private let d: CGFloat = 130
    private let magnify: CGFloat = 3

    var body: some View {
        let s = CGFloat(viewport.zoom) * magnify
        let rel = viewport.toSheet(PlanPoint(point))
        let W = CGFloat(viewport.sheetSize.width), H = CGFloat(viewport.sheetSize.height)
        // Position of the aimed point inside the magnified image.
        let px = CGFloat(rel.x) * W * s
        let py = CGFloat(rel.y) * H * s
        let bounds = viewport.viewSize.cg
        let center = CGPoint(x: min(max(point.x, d / 2 + 4), bounds.width - d / 2 - 4),
                             y: point.y - d * 0.9 < d / 2 + 4 ? point.y + d * 0.9 : point.y - d * 0.9)
        ZStack {
            Color.white
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .frame(width: W * s, height: H * s)
                .offset(x: d / 2 - px, y: d / 2 - py)
                .frame(width: d, height: d, alignment: .topLeading)
            Path { p in
                p.move(to: CGPoint(x: d / 2, y: d / 2 - 14)); p.addLine(to: CGPoint(x: d / 2, y: d / 2 + 14))
                p.move(to: CGPoint(x: d / 2 - 14, y: d / 2)); p.addLine(to: CGPoint(x: d / 2 + 14, y: d / 2))
            }
            .stroke(Color.orange, lineWidth: 1.5)
            Circle().stroke(Color.orange, lineWidth: 1).frame(width: 6, height: 6)
        }
        .frame(width: d, height: d)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white, lineWidth: 4))
        .overlay(Circle().stroke(Color.black.opacity(0.25), lineWidth: 1))
        .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
        .position(center)
        .allowsHitTesting(false)
    }
}

private struct PulseRing: View {
    @State private var on = false
    var body: some View {
        ZStack {
            Circle().stroke(Color.orange, lineWidth: 3).frame(width: 34, height: 34)
            Circle().stroke(Color.orange.opacity(on ? 0 : 0.8), lineWidth: 3).frame(width: on ? 90 : 34, height: on ? 90 : 34)
        }
        .onAppear { withAnimation(.easeOut(duration: 1.1).repeatForever(autoreverses: false)) { on = true } }
    }
}
