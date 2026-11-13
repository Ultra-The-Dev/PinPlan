import SwiftUI
import PinPlanCore

extension Color {
    /// "#rrggbb" → Color.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }

    static let brand = Color(red: 0.761, green: 0.255, blue: 0.047)   // safety orange #C2410C
    static let ink = Color(red: 0.086, green: 0.086, blue: 0.086)     // charcoal #161616
}

extension UIColor {
    convenience init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

/// Outline of a device symbol, matching the web app's shapes.
struct SymbolShape: SwiftUI.Shape {
    let shape: MarkerShape

    func path(in rect: CGRect) -> Path {
        Path(SymbolGeometry.cgPath(shape, center: CGPoint(x: rect.midX, y: rect.midY), radius: min(rect.width, rect.height) / 2 / 1.2))
    }
}

enum SymbolGeometry {
    /// Core Graphics path of a symbol (used by SwiftUI and PDF rendering).
    static func cgPath(_ shape: MarkerShape, center c: CGPoint, radius r: CGFloat) -> CGPath {
        let p = CGMutablePath()
        func poly(_ n: Int, _ rot: CGFloat, _ rad: CGFloat) {
            for i in 0..<n {
                let a = rot + CGFloat(i) * 2 * .pi / CGFloat(n)
                let pt = CGPoint(x: c.x + cos(a) * rad, y: c.y + sin(a) * rad)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            p.closeSubpath()
        }
        switch shape {
        case .circle: p.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
        case .square: let s = r * 0.88; p.addRect(CGRect(x: c.x - s, y: c.y - s, width: 2 * s, height: 2 * s))
        case .triangle: poly(3, -.pi / 2, r * 1.2)
        case .diamond: poly(4, -.pi / 2, r * 1.15)
        case .hexagon: poly(6, 0, r * 1.05)
        case .star:
            for i in 0..<10 {
                let a = -.pi / 2 + CGFloat(i) * .pi / 5
                let rad = i % 2 == 0 ? r * 1.2 : r * 0.55
                let pt = CGPoint(x: c.x + cos(a) * rad, y: c.y + sin(a) * rad)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            p.closeSubpath()
        }
        return p
    }
}

/// A device symbol as used on the plan, palette and legends.
struct DeviceSymbol: View {
    let type: DeviceType?
    var size: CGFloat = 28
    var tentative = false
    var selected = false

    var body: some View {
        let color = Color(hex: type?.color ?? "#334155")
        ZStack {
            if selected {
                Circle().fill(Color.brand.opacity(0.18)).frame(width: size * 1.55, height: size * 1.55)
                Circle().stroke(Color.brand, lineWidth: 2).frame(width: size * 1.55, height: size * 1.55)
            }
            SymbolShape(shape: type?.shape ?? .circle).fill(.white)
            SymbolShape(shape: type?.shape ?? .circle)
                .stroke(color, style: StrokeStyle(lineWidth: max(2, size * 0.1), dash: tentative ? [size * 0.18, size * 0.12] : []))
            Text(type?.symbol ?? "?")
                .font(.system(size: size * ((type?.symbol.count ?? 1) > 2 ? 0.28 : (type?.symbol.count ?? 1) > 1 ? 0.34 : 0.44), weight: .bold))
                .foregroundStyle(color)
                .offset(y: type?.shape == .triangle ? size * 0.08 : 0)
            if tentative {
                Text("?").font(.system(size: size * 0.42, weight: .heavy)).foregroundStyle(.red).offset(x: size * 0.55, y: -size * 0.45)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.2), radius: 1.5, y: 0.5)
    }
}

/// Small inline label: plain coloured text, no pill or box around it.
struct Chip: View {
    let text: String
    var tint: Color = .secondary
    var body: some View {
        Text(text).font(.caption.weight(.medium)).foregroundStyle(tint)
    }
}

extension Double {
    /// 12.0 → "12", 12.5 → "12.5".
    var clean: String { self == rounded() ? String(Int(self)) : String(format: "%.1f", self) }
}

func wireColor(_ w: String?) -> Color {
    switch w ?? "" {
    case "Cat6": return Color(hex: "#2563eb")
    case "16/4 speaker": return Color(hex: "#7c3aed")
    case "HDMI + Cat6": return Color(hex: "#0891b2")
    case "18/2": return Color(hex: "#ca8a04")
    case "LV per driver": return Color(hex: "#d97706")
    case "LV per manufacturer": return Color(hex: "#db2777")
    case "Fiber": return Color(hex: "#16a34a")
    default: return Color(hex: "#64748b")
    }
}

/// A Form whose section headers stay in sentence case (iOS grouped lists default to ALL CAPS).
struct SentenceForm<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { Form { content }.textCase(nil) }
}

/// A List whose section headers stay in sentence case.
struct SentenceList<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { List { content }.textCase(nil) }
}
