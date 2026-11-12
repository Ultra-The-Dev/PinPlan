import SwiftUI
import PinPlanCore

/// Zoomable, pannable plan sheet with markup. Positions are relative (0…1); sizes of symbols stay constant on screen.
struct PlanCanvasView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet

    @State private var scale: CGFloat = 0.2
    @State private var offset: CGSize = .zero
    @State private var gestureBase: (scale: CGFloat, offset: CGSize)?
    @State private var dragging: [String: CGPoint] = [:]   // live drag positions (relative) by item id
    @State private var size: CGSize = .zero
    @State private var fittedKey = ""
    @State private var appliedFocus = 0
    @State private var detail: DetailTile?
    @State private var detailTask: Task<Void, Never>?
    @Environment(\.displayScale) private var displayScale
    @Environment(\.horizontalSizeClass) private var hSize

    /// A crisp re-render of the visible part of the sheet from its vector PDF.
    struct DetailTile { let image: UIImage; let rect: CGRect; let sheetId: String }

    /// Symbols stay readable: full size when zoomed in, a little smaller at overview zoom.
    private var symbolSize: CGFloat {
        let fit = fitScale()
        guard fit > 0 else { return 30 }
        return min(30, max(18, 30 * (scale / (fit * 1.6)).squareRoot()))
    }
    static let space = "plan-canvas"

    private var W: CGFloat { sheet.width }
    private var H: CGFloat { sheet.height }

    var body: some View {
        GeometryReader { geo in
            let image = app.store.image(sheet.imageId)
            ZStack(alignment: .topLeading) {
                Color(.systemGray6)

                // Plan image
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .interpolation(.medium)
                        .frame(width: W * scale, height: H * scale)
                        .background(Color.white)
                        .shadow(color: .black.opacity(0.15), radius: 12, y: 3)
                        .offset(offset)
                        .allowsHitTesting(false)
                }

                // Vector detail for the visible area when zoomed past the raster's resolution
                if let d = detail, d.sheetId == sheet.id {
                    Image(uiImage: d.image)
                        .resizable()
                        .frame(width: d.rect.width * W * scale, height: d.rect.height * H * scale)
                        .offset(x: offset.width + d.rect.minX * W * scale, y: offset.height + d.rect.minY * H * scale)
                        .allowsHitTesting(false)
                }

                // Gesture surface (taps, pan, pinch)
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture(coordinateSpace: .named(Self.space)).onEnded { handleTap($0.location) })
                    .simultaneousGesture(panGesture)
                    .simultaneousGesture(magnifyGesture)

                // Runs and the run being drawn
                Canvas { ctx, _ in drawRuns(&ctx) }
                    .allowsHitTesting(false)

                // Run vertex handles for the selected run
                if case .run(let rid)? = model.selection, model.tool == .select,
                   let run = model.bundle.liveRuns.first(where: { $0.id == rid }), run.sheetId == sheet.id {
                    ForEach(0..<(run.points.count / 2), id: \.self) { i in
                        let key = "\(run.id)#\(i)"
                        let p = dragging[key] ?? CGPoint(x: run.points[i * 2], y: run.points[i * 2 + 1])
                        Circle().fill(.white).overlay(Circle().stroke(Color.brand, lineWidth: 2))
                            .frame(width: 22, height: 22)
                            .position(screen(p.x, p.y))
                            .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .named(Self.space))
                                .onChanged { v in dragging[key] = relative(v.location) }
                                .onEnded { v in
                                    let r = relative(v.location)
                                    dragging[key] = nil
                                    model.edit { b in b.updateRun(run.id) { $0.points[i * 2] = r.x; $0.points[i * 2 + 1] = r.y } }
                                })
                    }
                }

                // Closets
                if model.closetsVisible {
                    ForEach(model.bundle.liveClosets.filter { $0.sheetId == sheet.id }) { c in
                        let p = dragging[c.id] ?? CGPoint(x: c.x, y: c.y)
                        ClosetBadge(closet: c, selected: model.selection == .closet(c.id))
                            .position(screen(p.x, p.y))
                            .allowsHitTesting(model.tool == .select)
                            .onTapGesture { model.selection = .closet(c.id) }
                            .gesture(itemDrag(id: c.id) { r in model.edit { $0.updateCloset(c.id, pricing: model.pricing) { $0.x = r.x; $0.y = r.y } } })
                    }
                }

                // Devices
                ForEach(model.bundle.liveMarkers.filter { $0.sheetId == sheet.id && model.isVisible($0) }) { m in
                    let p = dragging[m.id] ?? CGPoint(x: m.x, y: m.y)
                    VStack(spacing: 1) {
                        DeviceSymbol(type: app.type(m.deviceTypeId), size: symbolSize, tentative: m.tentative, selected: model.selection == .marker(m.id))
                        if model.showLabels {
                            Text(m.label).font(.system(size: 9, weight: .medium)).padding(.horizontal, 3)
                                .background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 3))
                        }
                    }
                    .position(x: screen(p.x, p.y).x, y: screen(p.x, p.y).y + (model.showLabels ? 7 : 0))
                    .allowsHitTesting(model.tool == .select)
                    .onTapGesture { model.selection = .marker(m.id) }
                    .contextMenu { markerMenu(m) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(app.type(m.deviceTypeId)?.name ?? "Device") \(m.label)\(m.tentative ? ", tentative" : "")")
                    .accessibilityAddTraits(.isButton)
                    .gesture(itemDrag(id: m.id) { r in model.edit { $0.updateMarker(m.id, pricing: model.pricing) { $0.x = r.x; $0.y = r.y } } })
                }
            }
            .coordinateSpace(.named(Self.space))
            .clipped()
            .onAppear {
                size = geo.size
                fitIfNeeded(force: false)
                // A focus request made before this sheet's canvas existed (e.g. "find device" on another floor).
                if let f = model.focus, f.sheetId == sheet.id, f.n != appliedFocus { center(on: f) }
            }
            .onChange(of: geo.size) { _, s in size = s; fitIfNeeded(force: false) }
            .onChange(of: sheet.id) { _, _ in fitIfNeeded(force: true) }
            .onChange(of: model.fitRequest) { _, _ in fitIfNeeded(force: true) }
            .onChange(of: model.focus) { _, f in if let f, f.sheetId == sheet.id, f.n != appliedFocus { center(on: f) } }
            .onChange(of: scale) { _, _ in scheduleDetail() }
            .onChange(of: offset) { _, _ in scheduleDetail() }
            .overlay(alignment: .bottomTrailing) { zoomControls }
            .overlay(alignment: hSize == .compact ? .bottomLeading : .topLeading) { scaleChip.padding(.bottom, hSize == .compact ? 120 : 0) }
        }
    }

    @ViewBuilder
    private func markerMenu(_ m: Marker) -> some View {
        Button { model.selection = .marker(m.id) } label: { Label("Edit", systemImage: "slider.horizontal.3") }
        Button {
            let pricing = model.pricing
            model.edit { $0.updateMarker(m.id, pricing: pricing) { $0.tentative.toggle() } }
        } label: { Label(m.tentative ? "Mark confirmed" : "Mark tentative (?)", systemImage: "questionmark.circle") }
        Button {
            guard let t = app.type(m.deviceTypeId) else { return }
            model.edit { $0.addMarker(type: t, sheetId: m.sheetId, x: m.x + 0.015, y: m.y + 0.015, room: m.room, tentative: m.tentative) }
        } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
        Button { model.use(.place(m.deviceTypeId)) } label: { Label("Place more like this", systemImage: "hand.tap") }
        Divider()
        Button(role: .destructive) { model.edit { $0.deleteMarker(m.id) }; if model.selection == .marker(m.id) { model.selection = nil } } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    // MARK: vector detail

    private func scheduleDetail() {
        detailTask?.cancel()
        guard let pdfId = sheet.sourcePdfId, let pageIndex = sheet.sourcePage, size.width > 0 else { detail = nil; return }
        // The raster already has enough pixels at this zoom.
        if scale * displayScale <= 1.1 { detail = nil; return }
        let visible = CGRect(x: -offset.width / (W * scale), y: -offset.height / (H * scale),
                             width: size.width / (W * scale), height: size.height / (H * scale))
            .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard !visible.isNull, visible.width > 0, visible.height > 0 else { return }
        var px = CGSize(width: visible.width * W * scale * displayScale, height: visible.height * H * scale * displayScale)
        let cap: CGFloat = 4096
        if max(px.width, px.height) > cap { let k = cap / max(px.width, px.height); px = CGSize(width: px.width * k, height: px.height * k) }
        let rotation = sheet.sourceRotation ?? 0
        let url = app.store.pdfURL(pdfId)
        let sheetId = sheet.id
        detailTask = Task {
            try? await Task.sleep(for: .milliseconds(220))   // wait for the gesture to settle
            if Task.isCancelled { return }
            let image: UIImage? = await Task.detached(priority: .userInitiated) {
                guard let page = PDFCache.shared.page(pdfId: pdfId, index: pageIndex, url: url) else { return nil }
                // Undo the sheet's extra quarter turns to find the region in the PDF's own orientation.
                var r = visible
                var outSize = px
                for _ in 0..<rotation {
                    r = CGRect(x: r.minY, y: 1 - r.maxX, width: r.height, height: r.width)
                    outSize = CGSize(width: outSize.height, height: outSize.width)
                }
                var img = PDFRender.render(page, region: r, pixelSize: outSize)
                for _ in 0..<rotation { img = PlanImporter.rotatedClockwise(img) }
                return img
            }.value
            if Task.isCancelled { return }
            if let image { detail = DetailTile(image: image, rect: visible, sheetId: sheetId) }
        }
    }

    // MARK: coordinates

    private func screen(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: offset.width + x * W * scale, y: offset.height + y * H * scale)
    }

    private func relative(_ p: CGPoint) -> CGPoint {
        CGPoint(x: min(1, max(0, (p.x - offset.width) / (W * scale))), y: min(1, max(0, (p.y - offset.height) / (H * scale))))
    }

    // MARK: fit / zoom

    private func fitScale() -> CGFloat { size.width > 0 ? min(size.width / W, size.height / H) * 0.95 : 0.2 }

    private func fitIfNeeded(force: Bool) {
        let key = "\(sheet.id)|\(Int(size.width))x\(Int(size.height))"
        guard force || key != fittedKey, size.width > 0 else { return }
        fittedKey = key
        let s = fitScale()
        scale = s
        offset = CGSize(width: (size.width - W * s) / 2, height: (size.height - H * s) / 2)
        // Apply a "find device" request that arrived before the canvas had its size.
        if let f = model.focus, f.sheetId == sheet.id, f.n != appliedFocus { center(on: f) }
    }

    private func center(on f: FocusRequest) {
        appliedFocus = f.n
        let s = max(scale, fitScale() * 2.5)
        withAnimation(.easeInOut(duration: 0.3)) {
            scale = s
            offset = CGSize(width: size.width / 2 - f.x * W * s, height: size.height / 2 - f.y * H * s)
        }
    }

    private func zoom(by factor: CGFloat, at anchor: CGPoint) {
        let base = (scale, offset)
        let ns = min(8, max(fitScale() * 0.5, base.0 * factor))
        let k = ns / base.0
        withAnimation(.easeOut(duration: 0.2)) {
            scale = ns
            offset = CGSize(width: anchor.x - (anchor.x - base.1.width) * k, height: anchor.y - (anchor.y - base.1.height) * k)
        }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { v in
                if gestureBase == nil { gestureBase = (scale, offset) }
                offset = CGSize(width: gestureBase!.offset.width + v.translation.width, height: gestureBase!.offset.height + v.translation.height)
            }
            .onEnded { _ in gestureBase = nil }
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { v in
                if gestureBase == nil { gestureBase = (scale, offset) }
                let base = gestureBase!
                let anchor = CGPoint(x: v.startAnchor.x * size.width, y: v.startAnchor.y * size.height)
                let ns = min(8, max(fitScale() * 0.5, base.scale * v.magnification))
                let k = ns / base.scale
                scale = ns
                offset = CGSize(width: anchor.x - (anchor.x - base.offset.width) * k, height: anchor.y - (anchor.y - base.offset.height) * k)
            }
            .onEnded { _ in gestureBase = nil }
    }

    private func itemDrag(id: String, commit: @escaping (CGPoint) -> Void) -> some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named(Self.space))
            .onChanged { v in if model.tool == .select { dragging[id] = relative(v.location) } }
            .onEnded { v in
                guard model.tool == .select else { return }
                let r = relative(v.location)
                dragging[id] = nil
                commit(r)
            }
    }

    // MARK: taps

    private func handleTap(_ loc: CGPoint) {
        let r = relative(loc)
        // Outside the sheet?
        let raw = CGPoint(x: (loc.x - offset.width) / (W * scale), y: (loc.y - offset.height) / (H * scale))
        guard (0...1).contains(raw.x), (0...1).contains(raw.y) else {
            if model.tool == .select { model.selection = nil }
            return
        }
        let tol = symbolSize * 0.8
        func near(_ x: Double, _ y: Double) -> Bool { hypot(screen(x, y).x - loc.x, screen(x, y).y - loc.y) < tol }
        let hitMarker = model.bundle.liveMarkers.first { $0.sheetId == sheet.id && near($0.x, $0.y) }?.id
        let hitCloset = model.bundle.liveClosets.first { $0.sheetId == sheet.id && near($0.x, $0.y) }?.id
        if model.tool == .select, let run = hitRun(loc) {
            model.selection = .run(run)
            return
        }
        model.tap(x: r.x, y: r.y, hitMarker: hitMarker, hitCloset: hitCloset)
    }

    private func hitRun(_ loc: CGPoint) -> String? {
        var best: (String, CGFloat)?
        for r in model.bundle.liveRuns where r.sheetId == sheet.id && model.isVisible(r) && r.points.count >= 4 {
            var i = 2
            while i + 1 < r.points.count {
                let a = screen(r.points[i - 2], r.points[i - 1]), b = screen(r.points[i], r.points[i + 1])
                let d = distance(loc, a, b)
                if d < 16, d < (best?.1 ?? .infinity) { best = (r.id, d) }
                i += 2
            }
        }
        return best?.0
    }

    private func distance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y
        let len2 = dx * dx + dy * dy
        let t = len2 == 0 ? 0 : max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }

    // MARK: drawing

    private func drawRuns(_ ctx: inout GraphicsContext) {
        for r in model.bundle.liveRuns where r.sheetId == sheet.id && model.isVisible(r) && r.points.count >= 4 {
            let pts = livePoints(r)
            var path = Path()
            path.move(to: screen(pts[0], pts[1]))
            var i = 2
            while i + 1 < pts.count { path.addLine(to: screen(pts[i], pts[i + 1])); i += 2 }
            let color: Color = r.kind == .wire ? wireColor(r.wireType) : Color(hex: app.type(r.deviceTypeId ?? "")?.color ?? "#d97706")
            let selected = model.selection == .run(r.id)
            if selected { ctx.stroke(path, with: .color(Color.brand.opacity(0.3)), style: StrokeStyle(lineWidth: 14, lineCap: .round, lineJoin: .round)) }
            let dash: [CGFloat] = r.kind == .wire ? [7, 5] : r.kind == .stair ? [3, 3] : []
            ctx.stroke(path, with: .color(color.opacity(r.tentative == true ? 0.5 : 0.95)),
                       style: StrokeStyle(lineWidth: r.kind == .wire ? 2.5 : 5, lineCap: .round, lineJoin: .round, dash: dash))
            if r.kind != .wire {
                let len = Geometry.runLengthFt(r)
                let parts = [r.zone.flatMap { $0.isEmpty ? nil : "Z\($0)" }, len.map { "\($0.clean) LF" } ?? "LF?", r.switchLabel.flatMap { $0.isEmpty ? nil : $0 }]
                let label = parts.compactMap { $0 }.joined(separator: " · ")
                let n = pts.count
                let mid = screen((pts[0] + pts[n - 2]) / 2, (pts[1] + pts[n - 1]) / 2)
                let text = Text(label).font(.system(size: 11, weight: .bold)).foregroundColor(color)
                let resolved = ctx.resolve(text)
                let sz = resolved.measure(in: CGSize(width: 300, height: 30))
                let box = CGRect(x: mid.x - sz.width / 2 - 4, y: mid.y - 22, width: sz.width + 8, height: sz.height + 4)
                ctx.fill(Path(roundedRect: box, cornerRadius: 4), with: .color(.white.opacity(0.9)))
                ctx.draw(resolved, at: CGPoint(x: mid.x, y: mid.y - 22 + (sz.height + 4) / 2))
            }
        }
        // Run being drawn
        let d = model.draft
        if d.count >= 2 {
            var path = Path()
            path.move(to: screen(d[0], d[1]))
            var i = 2
            while i + 1 < d.count { path.addLine(to: screen(d[i], d[i + 1])); i += 2 }
            ctx.stroke(path, with: .color(.orange), style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [8, 6]))
            var k = 0
            while k + 1 < d.count {
                let p = screen(d[k], d[k + 1])
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)), with: .color(.orange))
                k += 2
            }
        }
    }

    private func livePoints(_ r: Run) -> [Double] {
        var pts = r.points
        for i in 0..<(pts.count / 2) {
            if let p = dragging["\(r.id)#\(i)"] { pts[i * 2] = p.x; pts[i * 2 + 1] = p.y }
        }
        return pts
    }

    // MARK: overlays

    private var zoomControls: some View {
        VStack(spacing: 0) {
            Button { zoom(by: 1.4, at: CGPoint(x: size.width / 2, y: size.height / 2)) } label: { Image(systemName: "plus.magnifyingglass").frame(width: 44, height: 44) }
            Divider().frame(width: 44)
            Button { zoom(by: 1 / 1.4, at: CGPoint(x: size.width / 2, y: size.height / 2)) } label: { Image(systemName: "minus.magnifyingglass").frame(width: 44, height: 44) }
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(12)
        .padding(.bottom, 52)
    }

    private var scaleChip: some View {
        HStack(spacing: 6) {
            Text("\(Int(scale * 100))%").bold().monospacedDigit()
            Divider().frame(height: 12)
            if sheet.pxPerFt != nil { Text("Scale \(sheet.scaleLabel ?? "set")") } else { Text("No scale set").foregroundStyle(.orange) }
        }
        .font(.caption)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(.regularMaterial, in: Capsule())
        .padding(12)
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
