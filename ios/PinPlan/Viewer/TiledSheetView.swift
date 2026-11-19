import UIKit
import PinPlanCore

/// What a tiled sheet is drawn from. Immutable, so the tiled layer can read it on its background threads.
struct PlanTileSource: Sendable, Equatable {
    let imageId: String
    let imageURL: URL
    /// Sheet image size in pixels (= the content view's size in points at zoom 1).
    let sheetSize: PlanSize
    /// The vector original, when the sheet came from a PDF: drawn directly when zoomed past the raster.
    let pdfId: String?
    let pdfURL: URL?
    let pdfPage: Int?
    /// Quarter turns the sheet was rotated after import.
    let rotation: Int

    var hasVector: Bool { pdfId != nil && pdfURL != nil && pdfPage != nil }
    var levelCount: Int { PlanTiles.levelCount(sheet: sheetSize) }
}

/// A CATiledLayer that fades new tiles in quickly (the default 0.25 s reads as lag when panning).
final class PlanTiledLayer: CATiledLayer {
    override class func fadeDuration() -> CFTimeInterval { 0.08 }
}

/// Draws the sheet at whatever detail the zoom needs: the tile pyramid level that matches the screen's pixel
/// density, and past the raster's own resolution the vector PDF (if the sheet has one). CATiledLayer only asks for
/// the tiles on screen, on background threads, and keeps coarser levels visible while finer ones arrive.
final class TiledSheetView: UIView {
    override class var layerClass: AnyClass { PlanTiledLayer.self }

    let source: PlanTileSource
    private let store = PlanTileStore.shared
    /// One PDF render at a time: CGPDFDocument isn't safe to draw from several threads at once.
    private static let pdfLock = NSLock()

    init(source: PlanTileSource, zoomRange: ClosedRange<Double>) {
        self.source = source
        super.init(frame: CGRect(origin: .zero, size: source.sheetSize.cg))
        isOpaque = false
        backgroundColor = .clear
        isUserInteractionEnabled = false
        configure(zoomRange: zoomRange)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private var tiledLayer: CATiledLayer? { layer as? CATiledLayer }

    func configure(zoomRange: ClosedRange<Double>) {
        let l = PlanTiles.tiledLayerLevels(minZoom: zoomRange.lowerBound, maxZoom: zoomRange.upperBound)
        tiledLayer?.levelsOfDetail = l.levels
        tiledLayer?.levelsOfDetailBias = l.bias
        let side = CGFloat(PlanTiles.tileSize)
        tiledLayer?.tileSize = CGSize(width: side, height: side)
    }

    /// Redraw every tile (e.g. once the pyramid has been built).
    func reload() { layer.setNeedsDisplay() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        // Device pixels per sheet pixel for this tile (the CTM includes the zoom level and the screen scale).
        let s = Double(abs(ctx.ctm.a))
        guard s > 0 else { return }
        if source.hasVector, PlanTiles.wantsVectorDetail(devicePixelsPerSheetPixel: s), drawVector(rect, scale: s) { return }
        guard store.isReady(source.imageId) else { return }   // the preview underneath shows until tiles exist
        let level = PlanTiles.level(devicePixelsPerSheetPixel: s, levelCount: source.levelCount)
        ctx.interpolationQuality = .high
        // Overlap neighbours by half a screen pixel so no hairline seams show between tiles.
        let pad = CGFloat(0.5 / s)
        for t in PlanTiles.tiles(covering: PlanRect(rect), level: level, sheet: source.sheetSize) {
            guard let img = store.tile(source.imageId, t) else { continue }
            let r = PlanTiles.sheetRect(of: t, sheet: source.sheetSize).cg.insetBy(dx: -pad, dy: -pad)
            img.draw(in: r)
        }
    }

    /// Renders this tile's region straight from the PDF page. Returns false if the PDF can't be read.
    private func drawVector(_ rect: CGRect, scale s: Double) -> Bool {
        guard let pdfId = source.pdfId, let url = source.pdfURL, let index = source.pdfPage else { return false }
        let W = CGFloat(source.sheetSize.width), H = CGFloat(source.sheetSize.height)
        let visible = CGRect(x: rect.minX / W, y: rect.minY / H, width: rect.width / W, height: rect.height / H)
            .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard !visible.isNull, visible.width > 0, visible.height > 0 else { return true }
        let k = CGFloat(s)
        var region = visible
        var px = CGSize(width: visible.width * W * k, height: visible.height * H * k)
        TiledSheetView.pdfLock.lock()
        defer { TiledSheetView.pdfLock.unlock() }
        guard let page = PDFCache.shared.page(pdfId: pdfId, index: index, url: url) else { return false }
        // Undo the sheet's extra quarter turns to find the region in the PDF's own orientation.
        for _ in 0..<max(0, source.rotation) {
            region = CGRect(x: region.minY, y: 1 - region.maxX, width: region.height, height: region.width)
            px = CGSize(width: px.height, height: px.width)
        }
        var img = PDFRender.render(page, region: region, pixelSize: px)
        for _ in 0..<max(0, source.rotation) { img = PlanImporter.rotatedClockwise(img) }
        img.draw(in: CGRect(x: visible.minX * W, y: visible.minY * H, width: visible.width * W, height: visible.height * H))
        return true
    }
}
