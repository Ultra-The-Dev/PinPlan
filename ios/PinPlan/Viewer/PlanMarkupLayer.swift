import SwiftUI
import PinPlanCore

/// One symbol image per (type, tentative, selected): resolved once per frame and stamped for every device.
struct MarkerSymbolKey: Hashable {
    let typeId: String
    let tentative: Bool
    let selected: Bool
}

/// Devices, runs, the run being drawn and closets, drawn over the sheet at a constant on-screen size.
/// Devices and runs are a single Canvas pass (symbols are resolved once and stamped), culled to the screen, so
/// thousands of devices stay smooth; labels are dropped when too many are on screen at once.
struct PlanMarkupLayer: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController
    /// Live positions (sheet-relative) of items being dragged, by id ("<runId>#<i>" for run vertices).
    let dragging: [String: CGPoint]
    var liftedId: String?

    var body: some View {
        let v = controller.sheetViewport(for: sheet.id)
        if v.isReady {
            let types = model.typesById
            let size = CGFloat(PlanMarkerMetrics.symbolSize(zoom: v.zoom, fitZoom: controller.limits.lowerBound))
            let markers = model.visibleMarkers(on: sheet.id, types: types)
            let keys = symbolKeys(markers)
            let painter = PlanPainter(viewport: v, model: model, types: types, dragging: dragging, symbolSize: size, liftedId: liftedId,
                                      photoMarkers: Set(model.bundle.photos.compactMap { $0.deleted == true ? nil : $0.markerId }))
            let runs = model.visibleRuns(on: sheet.id)
            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in
                    painter.drawRuns(&ctx, runs: runs)
                    painter.drawDraft(&ctx)
                    painter.drawMarkers(&ctx, markers: markers)
                } symbols: {
                    ForEach(keys, id: \.self) { k in
                        DeviceSymbol(type: types[k.typeId], size: size, tentative: k.tentative, selected: k.selected)
                            .frame(width: size * 1.7, height: size * 1.7)
                            .tag(k)
                    }
                    PhotoBadge(size: size).tag("camera")
                }
                ClosetsLayer(model: model, sheet: sheet, viewport: v, dragging: dragging)
            }
        }
    }

    private func symbolKeys(_ markers: [Marker]) -> [MarkerSymbolKey] {
        var seen = Set<MarkerSymbolKey>()
        var out: [MarkerSymbolKey] = []
        for m in markers {
            let k = MarkerSymbolKey(typeId: m.deviceTypeId, tentative: m.tentative, selected: model.isSelected(m.id))
            if seen.insert(k).inserted { out.append(k) }
        }
        return out
    }
}

/// Little camera badge for devices with site photos.
private struct PhotoBadge: View {
    let size: CGFloat
    var body: some View {
        Image(systemName: "camera.fill").font(.system(size: max(7, size * 0.28), weight: .bold)).foregroundStyle(.white)
            .padding(max(2, size * 0.08)).background(Color(white: 0.1), in: Circle())
            .overlay(Circle().stroke(Color.white, lineWidth: 1))
    }
}

/// Closets (a handful per sheet) as views, culled to the screen.
private struct ClosetsLayer: View {
    let model: EditorModel
    let sheet: Sheet
    let viewport: PlanViewport
    let dragging: [String: CGPoint]

    var body: some View {
        let closets = model.visibleClosets(on: sheet.id).filter { c in
            let p = dragging[c.id] ?? CGPoint(x: c.x, y: c.y)
            return viewport.isOnScreen(PlanPoint(x: Double(p.x), y: Double(p.y)), margin: 60)
        }
        ForEach(closets) { c in
            let p = dragging[c.id] ?? CGPoint(x: c.x, y: c.y)
            ClosetBadge(closet: c, selected: model.selection == .closet(c.id))
                .position(viewport.point(Double(p.x), Double(p.y)))
        }
    }
}

/// Immediate-mode drawing of runs and devices into a GraphicsContext.
struct PlanPainter {
    let viewport: PlanViewport
    let model: EditorModel
    let types: [String: DeviceType]
    let dragging: [String: CGPoint]
    let symbolSize: CGFloat
    let liftedId: String?
    let photoMarkers: Set<String>

    private func screen(_ x: Double, _ y: Double) -> CGPoint { viewport.point(x, y) }

    // MARK: devices

    func drawMarkers(_ ctx: inout GraphicsContext, markers: [Marker]) {
        let cull = viewport.cullRect(margin: Double(symbolSize) * 1.5)
        var normal: [(Marker, CGPoint, MarkerSymbolKey)] = []
        var selected: [(Marker, CGPoint, MarkerSymbolKey)] = []
        for m in markers {
            let rel = dragging[m.id] ?? CGPoint(x: m.x, y: m.y)
            let rx = Double(rel.x), ry = Double(rel.y)
            guard cull.contains(PlanPoint(x: rx, y: ry)) else { continue }
            let isSel = model.isSelected(m.id)
            let item = (m, screen(rx, ry), MarkerSymbolKey(typeId: m.deviceTypeId, tentative: m.tentative, selected: isSel))
            if isSel || m.id == liftedId { selected.append(item) } else { normal.append(item) }
        }
        let all = normal + selected   // selected on top
        let camera = ctx.resolveSymbol(id: "camera")
        for (m, p, key) in all {
            if m.id == liftedId {
                // Picked up: a soft halo under it.
                let r = symbolSize * 0.95
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r + 3, width: r * 2, height: r * 2)), with: .color(Color.black.opacity(0.18)))
            }
            if let sym = ctx.resolveSymbol(id: key) { ctx.draw(sym, at: p, anchor: .center) }
            if let camera, photoMarkers.contains(m.id) {
                ctx.draw(camera, at: CGPoint(x: p.x - symbolSize * 0.3, y: p.y - symbolSize * 0.3), anchor: .center)
            }
        }
        guard model.showLabels, all.count <= PlanMarkerMetrics.maxLabels else { return }
        for (m, p, _) in all where !m.label.isEmpty {
            let text = ctx.resolve(Text(m.label).font(.system(size: 9, weight: .medium)).foregroundColor(Color.black))
            let sz = text.measure(in: CGSize(width: 200, height: 30))
            let center = CGPoint(x: p.x, y: p.y + symbolSize / 2 + 2 + sz.height / 2)
            let box = CGRect(x: center.x - sz.width / 2 - 3, y: center.y - sz.height / 2, width: sz.width + 6, height: sz.height)
            ctx.fill(Path(roundedRect: box, cornerRadius: 3), with: .color(Color.white.opacity(0.85)))
            ctx.draw(text, at: center, anchor: .center)
        }
    }

    // MARK: runs

    private func livePoints(_ r: Run) -> [Double] {
        var pts = r.points
        for i in 0..<(pts.count / 2) {
            if let p = dragging["\(r.id)#\(i)"] { pts[i * 2] = Double(p.x); pts[i * 2 + 1] = Double(p.y) }
        }
        return pts
    }

    private func onScreen(_ pts: [Double]) -> Bool {
        guard pts.count >= 2 else { return false }
        var x0 = pts[0], x1 = pts[0], y0 = pts[1], y1 = pts[1]
        var i = 0
        while i + 1 < pts.count { x0 = min(x0, pts[i]); x1 = max(x1, pts[i]); y0 = min(y0, pts[i + 1]); y1 = max(y1, pts[i + 1]); i += 2 }
        let bbox = PlanRect(x: x0, y: y0, width: max(x1 - x0, 1e-6), height: max(y1 - y0, 1e-6))
        return bbox.intersects(viewport.cullRect(margin: 60))
    }

    func drawRuns(_ ctx: inout GraphicsContext, runs: [Run]) {
        for r in runs {
            let pts = livePoints(r)
            guard onScreen(pts) else { continue }
            drawRun(&ctx, r, pts)
        }
    }

    private func drawRun(_ ctx: inout GraphicsContext, _ r: Run, _ pts: [Double]) {
        var path = Path()
        path.move(to: screen(pts[0], pts[1]))
        var i = 2
        while i + 1 < pts.count { path.addLine(to: screen(pts[i], pts[i + 1])); i += 2 }
        let color: Color = r.kind == .wire ? wireColor(r.wireType) : Color(hex: types[r.deviceTypeId ?? ""]?.color ?? "#d97706")
        let selected = model.selection == .run(r.id)
        if selected { ctx.stroke(path, with: .color(Color.brand.opacity(0.3)), style: StrokeStyle(lineWidth: 14, lineCap: .round, lineJoin: .round)) }
        let dash: [CGFloat] = r.kind == .wire ? [7, 5] : r.kind == .stair ? [3, 3] : []
        let opacity: Double = r.tentative == true ? 0.5 : 0.95
        if r.kind == .wire && r.cables.count > 1 {
            // A bundle: one line per cable, side by side, each in its cable's colour.
            var screenPts: [CGPoint] = []
            var k = 0
            while k + 1 < pts.count { screenPts.append(screen(pts[k], pts[k + 1])); k += 2 }
            for (offset, cable) in zip(bundleOffsets(r.cables.count, spacing: 3.6), r.cables) {
                var p = Path()
                p.addLines(offsetPolyline(screenPts, by: offset))
                ctx.stroke(p, with: .color(wireColor(cable).opacity(opacity)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round, dash: dash))
            }
            if (model.showLabels || selected), screenPts.count >= 2 {
                let first = screenPts[0], last = screenPts[screenPts.count - 1]
                let mid = CGPoint(x: (first.x + last.x) / 2, y: (first.y + last.y) / 2)
                let resolved = ctx.resolve(Text(Cables.summary(r.cables)).font(.system(size: 10, weight: .semibold)).foregroundColor(Color.black))
                let sz = resolved.measure(in: CGSize(width: 300, height: 30))
                ctx.fill(Path(roundedRect: CGRect(x: mid.x - sz.width / 2 - 4, y: mid.y - sz.height / 2 - 2, width: sz.width + 8, height: sz.height + 4), cornerRadius: 4),
                         with: .color(Color.white.opacity(0.92)))
                ctx.draw(resolved, at: mid)
            }
        } else {
            let width: CGFloat = r.kind == .wire ? 2.5 : 5
            ctx.stroke(path, with: .color(color.opacity(opacity)), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round, dash: dash))
        }
        if r.kind != .wire {
            let len = Geometry.runLengthFt(r)
            let parts: [String?] = [r.zone.flatMap { $0.isEmpty ? nil : "Z\($0)" }, len.map { "\($0.clean) LF" } ?? "LF?", r.switchLabel.flatMap { $0.isEmpty ? nil : $0 }]
            let label = parts.compactMap { $0 }.joined(separator: " · ")
            let n = pts.count
            let mid = screen((pts[0] + pts[n - 2]) / 2, (pts[1] + pts[n - 1]) / 2)
            let resolved = ctx.resolve(Text(label).font(.system(size: 11, weight: .bold)).foregroundColor(color))
            let sz = resolved.measure(in: CGSize(width: 300, height: 30))
            let box = CGRect(x: mid.x - sz.width / 2 - 4, y: mid.y - 22, width: sz.width + 8, height: sz.height + 4)
            ctx.fill(Path(roundedRect: box, cornerRadius: 4), with: .color(Color.white.opacity(0.9)))
            ctx.draw(resolved, at: CGPoint(x: mid.x, y: mid.y - 22 + (sz.height + 4) / 2))
        }
    }

    /// The run (or scale line / measurement) being drawn.
    func drawDraft(_ ctx: inout GraphicsContext) {
        let d = model.draft
        guard d.count >= 2 else { return }
        var path = Path()
        path.move(to: screen(d[0], d[1]))
        var i = 2
        while i + 1 < d.count { path.addLine(to: screen(d[i], d[i + 1])); i += 2 }
        if d.count >= 4 { ctx.stroke(path, with: .color(Color.orange), style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [8, 6])) }
        var k = 0
        while k + 1 < d.count {
            let p = screen(d[k], d[k + 1])
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)), with: .color(Color.orange))
            k += 2
        }
    }
}
