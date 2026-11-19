import Foundation

// Plan viewer geometry, shared by the iOS canvas and anything drawn on top of it (markers, task pins, markups,
// measurements, hyperlinks, revision compare). Pure value math, Foundation only, so it is unit tested on Linux.
//
// Three coordinate spaces:
//   • sheet-relative  (0…1, 0…1)  — what the data stores (`Marker.x/y`, `Run.points`), top-left origin.
//   • sheet pixels    (0…W, 0…H)  — the stored sheet image (`Sheet.width/height`); `Sheet.pxPerFt` is in these.
//   • view points                 — the on-screen canvas, top-left origin.
// A viewport maps sheet pixels to view points with one uniform `zoom` (points per sheet pixel) and the view
// position of the sheet's top-left corner (`origin`). See docs/plan-viewer-ios.md.

public struct PlanPoint: Hashable, Codable, Sendable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
    public static let zero = PlanPoint(x: 0, y: 0)
}

public struct PlanSize: Hashable, Codable, Sendable {
    public var width: Double
    public var height: Double
    public init(width: Double, height: Double) { self.width = width; self.height = height }
    public static let zero = PlanSize(width: 0, height: 0)
    public var isEmpty: Bool { width <= 0 || height <= 0 }
}

public struct PlanRect: Hashable, Codable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height }
    public static let unit = PlanRect(x: 0, y: 0, width: 1, height: 1)
    public static let null = PlanRect(x: 0, y: 0, width: 0, height: 0)

    public var minX: Double { x }
    public var minY: Double { y }
    public var maxX: Double { x + width }
    public var maxY: Double { y + height }
    public var midX: Double { x + width / 2 }
    public var midY: Double { y + height / 2 }
    public var center: PlanPoint { PlanPoint(x: midX, y: midY) }
    public var isEmpty: Bool { width <= 0 || height <= 0 }

    public func contains(_ p: PlanPoint) -> Bool { p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY }
    public func intersects(_ r: PlanRect) -> Bool { !isEmpty && !r.isEmpty && r.minX < maxX && r.maxX > minX && r.minY < maxY && r.maxY > minY }
    /// Overlap of two rects (empty `.null` when they don't meet).
    public func intersection(_ r: PlanRect) -> PlanRect {
        let x0 = max(minX, r.minX), y0 = max(minY, r.minY), x1 = min(maxX, r.maxX), y1 = min(maxY, r.maxY)
        guard x1 > x0, y1 > y0 else { return .null }
        return PlanRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
    }
    public func insetBy(dx: Double, dy: Double) -> PlanRect { PlanRect(x: x + dx, y: y + dy, width: width - 2 * dx, height: height - 2 * dy) }
}

/// The on-screen transform of one sheet.
public struct PlanViewport: Hashable, Sendable {
    /// Sheet image size in pixels (`Sheet.width/height`).
    public var sheetSize: PlanSize
    /// Canvas size in points.
    public var viewSize: PlanSize
    /// Points per sheet pixel.
    public var zoom: Double
    /// View position (points) of the sheet's top-left corner.
    public var origin: PlanPoint

    public init(sheetSize: PlanSize, viewSize: PlanSize, zoom: Double, origin: PlanPoint) {
        self.sheetSize = sheetSize; self.viewSize = viewSize; self.zoom = zoom; self.origin = origin
    }

    public static let zero = PlanViewport(sheetSize: .zero, viewSize: .zero, zoom: 1, origin: .zero)
    public var isReady: Bool { !sheetSize.isEmpty && !viewSize.isEmpty && zoom > 0 }

    /// The sheet's size on screen, in points.
    public var displayedSize: PlanSize { PlanSize(width: sheetSize.width * zoom, height: sheetSize.height * zoom) }

    // MARK: conversions

    /// Sheet-relative (0…1) → view point.
    public func toView(_ rel: PlanPoint) -> PlanPoint {
        PlanPoint(x: origin.x + rel.x * sheetSize.width * zoom, y: origin.y + rel.y * sheetSize.height * zoom)
    }
    public func toView(x: Double, y: Double) -> PlanPoint { toView(PlanPoint(x: x, y: y)) }

    /// View point → sheet-relative (not clamped: outside the sheet gives values outside 0…1).
    public func toSheet(_ p: PlanPoint) -> PlanPoint {
        let w = sheetSize.width * zoom, h = sheetSize.height * zoom
        guard w > 0, h > 0 else { return .zero }
        return PlanPoint(x: (p.x - origin.x) / w, y: (p.y - origin.y) / h)
    }

    /// View point → sheet-relative, clamped to the sheet.
    public func toSheetClamped(_ p: PlanPoint) -> PlanPoint {
        let r = toSheet(p)
        return PlanPoint(x: min(1, max(0, r.x)), y: min(1, max(0, r.y)))
    }

    /// Whether a view point lands on the sheet.
    public func isOnSheet(_ p: PlanPoint) -> Bool {
        let r = toSheet(p)
        return (0...1).contains(r.x) && (0...1).contains(r.y)
    }

    /// Sheet-relative rect → view rect.
    public func toView(_ rel: PlanRect) -> PlanRect {
        let a = toView(PlanPoint(x: rel.minX, y: rel.minY))
        return PlanRect(x: a.x, y: a.y, width: rel.width * sheetSize.width * zoom, height: rel.height * sheetSize.height * zoom)
    }

    /// View rect → sheet-relative rect.
    public func toSheet(_ r: PlanRect) -> PlanRect {
        let a = toSheet(PlanPoint(x: r.minX, y: r.minY))
        let w = sheetSize.width * zoom, h = sheetSize.height * zoom
        guard w > 0, h > 0 else { return .null }
        return PlanRect(x: a.x, y: a.y, width: r.width / w, height: r.height / h)
    }

    /// A length on the sheet in feet → points on screen (nil without a scale).
    public func points(feet: Double, pxPerFt: Double?) -> Double? {
        guard let ppf = pxPerFt, ppf > 0 else { return nil }
        return feet * ppf * zoom
    }

    // MARK: what is on screen

    /// The part of the sheet on screen, sheet-relative (clipped to the sheet; `.null` if none).
    public var visibleSheetRect: PlanRect {
        toSheet(PlanRect(x: 0, y: 0, width: viewSize.width, height: viewSize.height)).intersection(.unit)
    }

    /// Sheet-relative rect to cull against: the visible area grown by `margin` points on each side, so symbols
    /// whose centre is just off screen still draw their visible half.
    public func cullRect(margin: Double) -> PlanRect {
        toSheet(PlanRect(x: -margin, y: -margin, width: viewSize.width + 2 * margin, height: viewSize.height + 2 * margin))
    }

    /// Whether a sheet-relative point is on screen (within `margin` points of it).
    public func isOnScreen(_ rel: PlanPoint, margin: Double = 0) -> Bool {
        let p = toView(rel)
        return p.x >= -margin && p.y >= -margin && p.x <= viewSize.width + margin && p.y <= viewSize.height + margin
    }

    // MARK: zoom math

    /// Gutter (points) kept around the sheet when it is fitted.
    public static let fitPadding = 16.0

    /// Zoom that shows the whole sheet with `padding` points around it.
    public static func fitZoom(sheet: PlanSize, view: PlanSize, padding: Double = fitPadding) -> Double {
        guard !sheet.isEmpty, !view.isEmpty else { return 1 }
        let w = max(1, view.width - 2 * padding), h = max(1, view.height - 2 * padding)
        return min(w / sheet.width, h / sheet.height)
    }

    public var fitZoom: Double { PlanViewport.fitZoom(sheet: sheetSize, view: viewSize) }

    /// Zoom range for a sheet: never smaller than "whole sheet" and, at the top, about `maxDevicePixels` screen
    /// pixels per sheet pixel (more when there is a vector PDF behind the sheet), but always at least 8× the fit.
    public static func zoomLimits(sheet: PlanSize, view: PlanSize, displayScale: Double, hasVector: Bool) -> ClosedRange<Double> {
        let fit = fitZoom(sheet: sheet, view: view)
        let maxDevicePixels: Double = hasVector ? 12 : 4
        let byResolution = maxDevicePixels / max(1, displayScale)
        let upper = max(fit * 8, byResolution)
        return fit...max(fit, upper)
    }

    /// Fitted and centred.
    public func fitted() -> PlanViewport {
        var v = self
        v.zoom = fitZoom
        v.origin = PlanPoint(x: (viewSize.width - sheetSize.width * v.zoom) / 2, y: (viewSize.height - sheetSize.height * v.zoom) / 2)
        return v
    }

    /// Zoomed by `factor`, keeping the view point `anchor` over the same spot of the sheet (pinch centre).
    public func zoomed(by factor: Double, anchor: PlanPoint, limits: ClosedRange<Double>? = nil) -> PlanViewport {
        var newZoom = zoom * factor
        if let limits { newZoom = min(limits.upperBound, max(limits.lowerBound, newZoom)) }
        let k = newZoom / zoom
        var v = self
        v.zoom = newZoom
        v.origin = PlanPoint(x: anchor.x - (anchor.x - origin.x) * k, y: anchor.y - (anchor.y - origin.y) * k)
        return v
    }

    /// Centred on a sheet-relative point at `zoom` (or the current zoom).
    public func centered(on rel: PlanPoint, zoom z: Double? = nil) -> PlanViewport {
        var v = self
        v.zoom = z ?? zoom
        v.origin = PlanPoint(x: viewSize.width / 2 - rel.x * sheetSize.width * v.zoom,
                             y: viewSize.height / 2 - rel.y * sheetSize.height * v.zoom)
        return v
    }

    /// Showing a sheet-relative rect as large as fits (centred), within `limits`.
    public func showing(_ rel: PlanRect, limits: ClosedRange<Double>? = nil) -> PlanViewport {
        let w = max(rel.width * sheetSize.width, 1), h = max(rel.height * sheetSize.height, 1)
        var z = min(viewSize.width / w, viewSize.height / h)
        if let limits { z = min(limits.upperBound, max(limits.lowerBound, z)) }
        return centered(on: rel.center, zoom: z)
    }

    /// The sheet-pixel rect that `zoom(to:)` style APIs (UIScrollView) expect to show `rel` centred at `z`.
    public func contentRect(centeredOn rel: PlanPoint, zoom z: Double) -> PlanRect {
        let w = viewSize.width / z, h = viewSize.height / z
        return PlanRect(x: rel.x * sheetSize.width - w / 2, y: rel.y * sheetSize.height - h / 2, width: w, height: h)
    }

    /// Device pixels drawn per sheet pixel at this zoom.
    public func devicePixelsPerSheetPixel(displayScale: Double) -> Double { zoom * displayScale }

    /// Double-tap target: 2.5× closer, or back to the fit when already near the top of the range.
    public static func doubleTapZoom(current: Double, limits: ClosedRange<Double>) -> Double {
        if current >= limits.upperBound * 0.95 { return limits.lowerBound }
        return min(limits.upperBound, current * 2.5)
    }
}

/// What to bring back when a sheet is opened again: the centre point and the zoom relative to "fit", so it
/// survives rotation and panels opening.
public struct PlanViewState: Codable, Hashable, Sendable {
    public var centerX: Double
    public var centerY: Double
    /// Zoom divided by the fit zoom at the time (1 = whole sheet).
    public var zoomOverFit: Double

    public init(centerX: Double, centerY: Double, zoomOverFit: Double) {
        self.centerX = centerX; self.centerY = centerY; self.zoomOverFit = zoomOverFit
    }

    public init(_ v: PlanViewport) {
        let c = v.toSheet(PlanPoint(x: v.viewSize.width / 2, y: v.viewSize.height / 2))
        let fit = v.fitZoom
        self.init(centerX: min(1, max(0, c.x)), centerY: min(1, max(0, c.y)), zoomOverFit: fit > 0 ? v.zoom / fit : 1)
    }

    /// Whether this is just the whole sheet (nothing worth remembering).
    public var isFit: Bool { zoomOverFit <= 1.02 }

    /// The viewport for this state in a (possibly different) view size, clamped to the zoom limits.
    public func apply(to v: PlanViewport, limits: ClosedRange<Double>? = nil) -> PlanViewport {
        var z = v.fitZoom * max(1, zoomOverFit)
        if let limits { z = min(limits.upperBound, max(limits.lowerBound, z)) }
        return v.centered(on: PlanPoint(x: centerX, y: centerY), zoom: z)
    }
}

/// Image tile pyramid for crisp, memory-safe sheets: level 0 is full resolution, each level above halves it,
/// cut into square tiles of `tileSize` level pixels. The viewer picks the coarsest level that still has at
/// least one image pixel per screen pixel.
public enum PlanTiles {
    public static let tileSize = 512

    public struct TileID: Hashable, Sendable, Codable {
        public var level: Int
        public var col: Int
        public var row: Int
        public init(level: Int, col: Int, row: Int) { self.level = level; self.col = col; self.row = row }
        /// File name inside a pyramid folder.
        public var fileName: String { "L\(level)_\(col)_\(row).jpg" }
    }

    /// Number of levels so that the top one fits in a single tile.
    public static func levelCount(sheet: PlanSize, tileSize: Int = tileSize) -> Int {
        guard !sheet.isEmpty else { return 1 }
        var side = max(sheet.width, sheet.height)
        var n = 1
        while side > Double(tileSize) && n < 16 { side /= 2; n += 1 }
        return n
    }

    /// Pixel size of a level (rounded up).
    public static func levelSize(sheet: PlanSize, level: Int) -> PlanSize {
        let k = pow(2.0, Double(level))
        return PlanSize(width: (sheet.width / k).rounded(.up), height: (sheet.height / k).rounded(.up))
    }

    /// Pyramid level for drawing at `devicePixelsPerSheetPixel`: the coarsest level that still has at least one
    /// image pixel per device pixel (0 when magnifying past full resolution).
    public static func level(devicePixelsPerSheetPixel s: Double, levelCount: Int) -> Int {
        guard s > 0, levelCount > 0 else { return 0 }
        // A little slack so 0.98 device px per pixel (rounding) doesn't drop to a blurrier level.
        let l = Int(floor(log2(1 / s) + 0.03))
        return min(levelCount - 1, max(0, l))
    }

    /// Past the raster's own resolution: worth drawing from the vector PDF when there is one.
    public static func wantsVectorDetail(devicePixelsPerSheetPixel s: Double) -> Bool { s > 1.1 }

    /// Tiles of `level` that cover a rect given in full-resolution sheet pixels.
    public static func tiles(covering rect: PlanRect, level: Int, sheet: PlanSize, tileSize: Int = tileSize) -> [TileID] {
        let clipped = rect.intersection(PlanRect(x: 0, y: 0, width: sheet.width, height: sheet.height))
        guard !clipped.isEmpty else { return [] }
        let span = Double(tileSize) * pow(2.0, Double(level))   // sheet pixels per tile side
        let c0 = Int(floor(clipped.minX / span)), c1 = Int(ceil(clipped.maxX / span)) - 1
        let r0 = Int(floor(clipped.minY / span)), r1 = Int(ceil(clipped.maxY / span)) - 1
        guard c1 >= c0, r1 >= r0 else { return [] }
        var out: [TileID] = []
        out.reserveCapacity((c1 - c0 + 1) * (r1 - r0 + 1))
        for r in r0...r1 { for c in c0...c1 { out.append(TileID(level: level, col: c, row: r)) } }
        return out
    }

    /// The full-resolution sheet-pixel rect a tile covers (clipped to the sheet).
    public static func sheetRect(of t: TileID, sheet: PlanSize, tileSize: Int = tileSize) -> PlanRect {
        let span = Double(tileSize) * pow(2.0, Double(t.level))
        return PlanRect(x: Double(t.col) * span, y: Double(t.row) * span, width: span, height: span)
            .intersection(PlanRect(x: 0, y: 0, width: sheet.width, height: sheet.height))
    }

    /// The tile's rect inside its level image, in that level's pixels (clipped to the level image).
    public static func levelRect(of t: TileID, sheet: PlanSize, tileSize: Int = tileSize) -> PlanRect {
        let size = levelSize(sheet: sheet, level: t.level)
        let s = Double(tileSize)
        return PlanRect(x: Double(t.col) * s, y: Double(t.row) * s, width: s, height: s)
            .intersection(PlanRect(x: 0, y: 0, width: size.width, height: size.height))
    }

    /// Every tile of every level (for generating a pyramid).
    public static func allTiles(sheet: PlanSize, tileSize: Int = tileSize) -> [TileID] {
        (0..<levelCount(sheet: sheet, tileSize: tileSize)).flatMap { l -> [TileID] in
            let size = levelSize(sheet: sheet, level: l)
            let cols = Int((size.width / Double(tileSize)).rounded(.up)), rows = Int((size.height / Double(tileSize)).rounded(.up))
            var out: [TileID] = []
            for r in 0..<max(1, rows) { for c in 0..<max(1, cols) { out.append(TileID(level: l, col: c, row: r)) } }
            return out
        }
    }

    /// Detail levels a CATiledLayer-style renderer needs: zoom-out levels down to `minZoom` and magnified levels up
    /// to `maxZoom` (zoom = points per sheet pixel; a tiled layer's 1× level is zoom 1).
    public static func tiledLayerLevels(minZoom: Double, maxZoom: Double) -> (levels: Int, bias: Int) {
        let out = max(0, Int(ceil(log2(1 / max(minZoom, 1e-6)))))
        let bias = max(0, Int(ceil(log2(max(maxZoom, 1)))))
        return (out + bias + 1, bias)
    }
}

/// On-screen sizes for plan symbols, which stay a constant size on screen whatever the zoom.
public enum PlanMarkerMetrics {
    /// Symbol diameter in points: full size when zoomed in, a little smaller at overview zoom so a dense floor
    /// stays readable. Rounded to even points so redraws don't re-rasterise the symbols on every frame.
    public static func symbolSize(zoom: Double, fitZoom: Double) -> Double {
        guard fitZoom > 0, zoom > 0 else { return 30 }
        let raw = min(30, max(18, 30 * (zoom / (fitZoom * 1.6)).squareRoot()))
        return (raw / 2).rounded() * 2
    }

    /// Labels under symbols cost a text layout each; past this many on screen they are left out (zoom in to see them).
    public static let maxLabels = 350

    /// Points around a symbol that still count as touching it.
    public static func hitRadius(symbolSize: Double) -> Double { max(22, symbolSize * 0.8) }
}

/// Finding the busiest part of a sheet (screenshots, "zoom to devices").
public enum PlanDensity {
    /// Centre of the `cell`-sized square (relative units) holding the most points, refined to the points' mean.
    public static func densest(_ points: [PlanPoint], cell: Double = 0.2) -> (center: PlanPoint, count: Int)? {
        guard !points.isEmpty, cell > 0 else { return nil }
        var best: (PlanPoint, Int)?
        // Half-cell steps so a cluster straddling a grid line is still found whole.
        let step = cell / 2
        let n = Int((1 / step).rounded(.up))
        for i in 0..<n {
            for j in 0..<n {
                let r = PlanRect(x: Double(i) * step - step / 2, y: Double(j) * step - step / 2, width: cell, height: cell)
                let inside = points.filter { r.contains($0) }
                if inside.count > (best?.1 ?? 0) {
                    let mx = inside.map(\.x).reduce(0, +) / Double(inside.count)
                    let my = inside.map(\.y).reduce(0, +) / Double(inside.count)
                    best = (PlanPoint(x: mx, y: my), inside.count)
                }
            }
        }
        return best.map { (center: $0.0, count: $0.1) }
    }

    /// Bounding box of points, grown by `pad` (relative), clipped to the sheet.
    public static func bounds(_ points: [PlanPoint], pad: Double = 0.03) -> PlanRect? {
        guard let f = points.first else { return nil }
        var x0 = f.x, y0 = f.y, x1 = f.x, y1 = f.y
        for p in points { x0 = min(x0, p.x); y0 = min(y0, p.y); x1 = max(x1, p.x); y1 = max(y1, p.y) }
        return PlanRect(x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad).intersection(.unit)
    }
}
