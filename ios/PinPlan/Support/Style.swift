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
    // Brand colours (brand, ink, paper…) live in Theme.swift.
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

/// SF Symbol for each device pictogram key (DeviceIcons). Missing symbols fall back to the type's letters.
enum DeviceIconArt {
    static let sfSymbols: [String: String] = [
        "camera": "video.fill", "tablet": "ipad.landscape", "wifi": "wifi", "switch": "point.3.filled.connected.trianglepath.dotted", "jack": "cable.connector",
        "speaker": "hifispeaker.fill", "tv": "tv", "home": "homekit", "keypad": "square.grid.3x3.fill", "bulb": "lightbulb.fill",
        "spot": "lamp.ceiling.fill", "driver": "cpu", "shade": "blinds.vertical.closed", "shield": "shield.fill", "doorbell": "bell.fill",
        "lock": "lock.fill", "sensor": "dot.radiowaves.left.and.right", "thermostat": "thermometer.medium", "mic": "mic.fill",
        "projector": "videoprojector.fill", "rack": "server.rack", "plug": "poweroutlet.type.b.fill", "remote": "av.remote.fill", "sub": "waveform",
    ]
    /// SF Symbol name for a key, only if this system has it.
    static func symbolName(_ key: String?) -> String? {
        guard let key, let name = sfSymbols[key], UIImage(systemName: name) != nil else { return nil }
        return name
    }
    static func symbolName(for t: DeviceType?) -> String? { t.flatMap { symbolName(DeviceIcons.key(for: $0)) } }
}

/// A device symbol as used on the plan, palette and legends: a solid badge in the type's colour with a white pictogram
/// (or its letters). Tentative (?) devices are hollow with a dashed outline.
struct DeviceSymbol: View {
    let type: DeviceType?
    var size: CGFloat = 28
    var tentative = false
    var selected = false

    var body: some View {
        let color = Color(hex: type?.color ?? "#334155")
        let shape = type?.shape ?? .circle
        let ink: Color = tentative ? color : .white
        ZStack {
            if selected {
                Circle().fill(Color.brand.opacity(0.18)).frame(width: size * 1.55, height: size * 1.55)
                Circle().stroke(Color.brand, lineWidth: 2).frame(width: size * 1.55, height: size * 1.55)
            }
            SymbolShape(shape: shape).fill(tentative ? .white : color)
            SymbolShape(shape: shape)
                .stroke(tentative ? color : .white.opacity(0.9), style: StrokeStyle(lineWidth: tentative ? max(2, size * 0.09) : max(1.5, size * 0.06), dash: tentative ? [size * 0.18, size * 0.12] : []))
            Group {
                if let name = DeviceIconArt.symbolName(for: type) {
                    Image(systemName: name)
                        .resizable().scaledToFit()
                        .fontWeight(.semibold)
                        .frame(width: size * (shape == .triangle ? 0.36 : shape == .star ? 0.34 : 0.5), height: size * (shape == .triangle ? 0.36 : shape == .star ? 0.34 : 0.5))
                } else {
                    Text(type?.symbol ?? "?")
                        .font(.system(size: size * ((type?.symbol.count ?? 1) > 2 ? 0.28 : (type?.symbol.count ?? 1) > 1 ? 0.34 : 0.44), weight: .bold))
                }
            }
            .foregroundStyle(ink)
            .offset(y: shape == .triangle ? size * 0.09 : 0)
            if tentative {
                Text("?").font(.system(size: size * 0.42, weight: .heavy)).foregroundStyle(.red).offset(x: size * 0.55, y: -size * 0.45)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.25), radius: 1.5, y: 0.75)
        .accessibilityHidden(true)
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
    /// Percentages (tax rate, markup): at most three decimals, no trailing zeros. 8.875 -> "8.875", 8.5 -> "8.5".
    var pctText: String {
        let r = (self * 1000).rounded() / 1000
        return r == r.rounded() ? String(Int(r)) : String(format: "%g", r)
    }
}

func wireColor(_ w: String?) -> Color {
    switch w ?? "" {
    case "Cat6": return Color(hex: "#2563eb")
    case "16/4 speaker": return Color(hex: "#7c3aed")
    case "HDMI": return Color(hex: "#c026d3")
    case "Coax": return Color(hex: "#ea580c")
    case "HDMI + Cat6": return Color(hex: "#0891b2")
    case "18/2": return Color(hex: "#ca8a04")
    case "LV per driver": return Color(hex: "#d97706")
    case "LV per manufacturer": return Color(hex: "#db2777")
    case "Fiber": return Color(hex: "#16a34a")
    case "22/4 alarm": return Color(hex: "#be123c")
    default: return Color(hex: "#64748b")
    }
}

/// A Form whose section headers stay in sentence case (iOS grouped lists default to ALL CAPS).
struct SentenceForm<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { Form { content }.textCase(nil).headerProminence(.increased).scrollDismissesKeyboard(.interactively).paperBackground() }
}

/// A List whose section headers stay in sentence case.
struct SentenceList<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { List { content }.textCase(nil).headerProminence(.increased).scrollDismissesKeyboard(.interactively).paperBackground() }
}

/// Section header text kept as written (grouped lists otherwise force ALL CAPS on the header).
struct SentenceHeader: View {
    let title: String
    var body: some View { Text(title).textCase(nil) }
}

extension Section where Parent == SentenceHeader, Footer == EmptyView, Content: View {
    /// `Section(sentence: "Home run") { … }`: a titled section whose header stays in sentence case.
    init(sentence title: String, @ViewBuilder content: () -> Content) {
        self.init(content: content, header: { SentenceHeader(title: title) })
    }
}


/// A polyline shifted sideways by `d` points (positive = left of travel). Used to draw several cables side by side.
func offsetPolyline(_ pts: [CGPoint], by d: CGFloat) -> [CGPoint] {
    guard pts.count >= 2, d != 0 else { return pts }
    func normal(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
        let dx = b.x - a.x, dy = b.y - a.y, len = max(hypot(dx, dy), 0.0001)
        return CGPoint(x: -dy / len, y: dx / len)
    }
    return pts.indices.map { i in
        let n: CGPoint
        if i == 0 { n = normal(pts[0], pts[1]) }
        else if i == pts.count - 1 { n = normal(pts[i - 1], pts[i]) }
        else {
            let a = normal(pts[i - 1], pts[i]), b = normal(pts[i], pts[i + 1])
            let m = CGPoint(x: a.x + b.x, y: a.y + b.y), len = max(hypot(m.x, m.y), 0.0001)
            n = CGPoint(x: m.x / len, y: m.y / len)
        }
        return CGPoint(x: pts[i].x + n.x * d, y: pts[i].y + n.y * d)
    }
}

/// Spacing between cables drawn side by side.
func bundleOffsets(_ count: Int, spacing: CGFloat) -> [CGFloat] {
    (0..<count).map { (CGFloat($0) - CGFloat(count - 1) / 2) * spacing }
}
