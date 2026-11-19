import SwiftUI
import PinPlanCore

/// The whole sheet in miniature with the part on screen outlined. Drag (or tap) on it to move around.
struct PlanMinimap: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController
    var maxSide: CGFloat = 200

    var body: some View {
        let size = minimapSize
        ZStack(alignment: .topLeading) {
            SheetThumbnailImage(sheet: sheet)
            MinimapDots(model: model, sheet: sheet)
            MinimapViewportBox(controller: controller, size: size)
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.black.opacity(0.12), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.18), radius: 10, y: 3)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { g in
                // Zoomed in: the plan follows the finger.
                if !controller.isAtFit { controller.pan(toCenter: relative(g.location, in: size)) }
            }
            .onEnded { g in
                // Whole sheet on screen: zoom in where you tapped.
                if controller.isAtFit { controller.center(on: relative(g.location, in: size), zoom: controller.limits.lowerBound * 3) }
            })
        .accessibilityElement()
        .accessibilityLabel("Minimap of \(sheet.name)")
        .accessibilityHint("Drag to move around the sheet")
    }

    private func relative(_ p: CGPoint, in size: CGSize) -> PlanPoint {
        PlanPoint(x: Double(min(max(0, p.x / size.width), 1)), y: Double(min(max(0, p.y / size.height), 1)))
    }

    /// Fits the sheet's aspect in a `maxSide` box.
    private var minimapSize: CGSize {
        let w = CGFloat(sheet.width), h = CGFloat(sheet.height)
        guard w > 0, h > 0 else { return CGSize(width: maxSide, height: maxSide * 0.7) }
        let k = maxSide / max(w, h)
        return CGSize(width: w * k, height: h * k)
    }
}

/// The sheet thumbnail, stretched to fill (the minimap frame already has the sheet's aspect).
private struct SheetThumbnailImage: View {
    @Environment(AppModel.self) private var app
    let sheet: Sheet
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color.white
            if let image { Image(uiImage: image).resizable().interpolation(.medium) }
        }
        .task(id: sheet.imageId) {
            guard app.store.hasImage(sheet.imageId) else { return }
            image = await PlanTileStore.shared.thumbnail(imageId: sheet.imageId, source: PlanTileStore.sourceURL(imageId: sheet.imageId, store: app.store))
        }
    }
}

/// Devices as dots in their type's colour (doesn't depend on the viewport, so it isn't redrawn while panning).
private struct MinimapDots: View {
    let model: EditorModel
    let sheet: Sheet

    var body: some View {
        let types = model.typesById
        let markers = model.visibleMarkers(on: sheet.id, types: types)
        Canvas { ctx, size in
            for m in markers {
                let p = CGPoint(x: CGFloat(m.x) * size.width, y: CGFloat(m.y) * size.height)
                let c = Color(hex: types[m.deviceTypeId]?.color ?? "#334155")
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - 2, y: p.y - 2, width: 4, height: 4)), with: .color(c))
            }
        }
        .allowsHitTesting(false)
    }
}

/// The visible area, outlined.
private struct MinimapViewportBox: View {
    let controller: PlanViewportController
    let size: CGSize

    var body: some View {
        let r = controller.viewport.visibleSheetRect
        if !r.isEmpty && !controller.isAtFit {
            let box = CGRect(x: CGFloat(r.x) * size.width, y: CGFloat(r.y) * size.height,
                             width: max(6, CGFloat(r.width) * size.width), height: max(6, CGFloat(r.height) * size.height))
            Rectangle()
                .fill(Color.brand.opacity(0.12))
                .overlay(Rectangle().strokeBorder(Color.brand, lineWidth: 2))
                .frame(width: box.width, height: box.height)
                .offset(x: box.minX, y: box.minY)
                .allowsHitTesting(false)
        }
    }
}
