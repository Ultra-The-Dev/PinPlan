import SwiftUI
import PinPlanCore

// Saved measurements from the web, read-only on the plan ("office-measurements" in Markups/OfficeOverlays.swift).
// Only the points are stored: the value is worked out here from the plan's current scale with the same maths as the
// web (FieldParity.Measure ← src/lib/measure.ts), so a plan whose scale changes shows new values straight away.
// Measurements never count in the takeoff.

/// A measurement ready to draw (view points).
struct PlacedMeasurement: Identifiable {
    let id: String
    let path: Path
    let closed: Bool
    let color: Color
    /// Where the value chip goes, nil when it's off screen.
    let labelAt: CGPoint?
    /// "Cat6 tray · 42' 6"", or "No scale" when the plan isn't calibrated.
    let text: String
    let warning: Bool
}

enum OfficeMeasurements {
    static let defaultColor = "#64748b"

    /// "12' 6"" / "1,234 sq ft" for a measurement on its sheet ("No scale" when the plan has none).
    static func valueText(_ m: PinPlanCore.Measurement, sheet: Sheet) -> String {
        let v = FieldParity.Measure.value(kind: kind(m), points: m.points, extraFt: m.extraFt, wastePct: m.wastePct,
                                          scale: FieldParity.Measure.Scale(width: sheet.width, height: sheet.height, pxPerFt: sheet.pxPerFt))
        return v.map { FieldParity.Measure.format($0) } ?? String(localized: "No scale")
    }

    static func kind(_ m: PinPlanCore.Measurement) -> FieldParity.Measure.Kind { FieldParity.Measure.Kind(raw: m.kind.rawValue) }

    @MainActor static func placed(_ ctx: PlanOverlayContext) -> [PlacedMeasurement] {
        let sheet = ctx.sheet
        let view = CGRect(x: 0, y: 0, width: ctx.viewport.viewSize.width, height: ctx.viewport.viewSize.height)
        let scale = FieldParity.Measure.Scale(width: sheet.width, height: sheet.height, pxPerFt: sheet.pxPerFt)
        var out: [PlacedMeasurement] = []
        for m in ctx.model.bundle.liveMeasurements where m.sheetId == sheet.id {
            let k = kind(m)
            let pts = stride(from: 0, to: m.points.count - 1, by: 2).map { ctx.point(m.points[$0], m.points[$0 + 1]) }
            guard pts.count >= k.minPoints, let first = pts.first else { continue }
            let bounds = pts.reduce(CGRect(origin: first, size: .zero)) { $0.union(CGRect(origin: $1, size: .zero)) }
            guard bounds.insetBy(dx: -60, dy: -30).intersects(view) else { continue }
            var path = OfficeMarkupDrawing.polyline(pts)
            if k == .area { path.closeSubpath() }
            let value = FieldParity.Measure.value(kind: k, points: m.points, extraFt: m.extraFt, wastePct: m.wastePct, scale: scale)
            let label = (m.label ?? "").trimmingCharacters(in: .whitespaces)
            let amount = value.map { FieldParity.Measure.format($0) } ?? String(localized: "No scale")
            let anchor = FieldParity.Measure.labelPoint(kind: k, points: m.points, scale: scale).map { ctx.point($0.x, $0.y) }
            out.append(PlacedMeasurement(id: m.id, path: path, closed: k == .area, color: Color(hex: m.color ?? defaultColor),
                                         labelAt: anchor.flatMap { view.insetBy(dx: -40, dy: -20).contains($0) ? $0 : nil },
                                         text: label.isEmpty ? amount : "\(label) · \(amount)", warning: value?.selfIntersecting == true))
        }
        return out
    }
}

/// The sheet's saved measurements: lines and areas with their value, one Canvas. Read-only: touches go to the plan.
struct OfficeMeasurementsLayer: View {
    let ctx: PlanOverlayContext

    var body: some View {
        if OfficeOverlayPrefs.shared.measurements {
            let items = OfficeMeasurements.placed(ctx)
            if !items.isEmpty {
                Canvas { g, _ in
                    for m in items {
                        if m.closed { g.fill(m.path, with: .color(m.color.opacity(0.12))) }
                        g.stroke(m.path, with: .color(m.color), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    }
                    for m in items {
                        guard let at = m.labelAt else { continue }
                        let t = g.resolve(Text(m.warning ? "\(m.text) ⚠︎" : m.text).font(.caption.weight(.semibold)).monospacedDigit().foregroundColor(.white))
                        let size = t.measure(in: CGSize(width: 320, height: 40))
                        let chip = CGRect(x: at.x - size.width / 2 - 6, y: at.y - size.height / 2 - 3, width: size.width + 12, height: size.height + 6)
                        g.fill(Path(roundedRect: chip, cornerRadius: chip.height / 2), with: .color(m.color))
                        g.draw(t, at: at)
                    }
                }
                .accessibilityElement()
                .accessibilityLabel(items.map(\.text).joined(separator: ", "))
            }
        }
    }
}
