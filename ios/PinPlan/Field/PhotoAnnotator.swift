import SwiftUI
import PinPlanCore

/// Draw on a photo: arrows, freehand, boxes, circles and text, in a few colours and widths. Saved as relative shapes,
/// so the mark-up stays editable and looks the same on the web.
struct PhotoAnnotator: View {
    let image: UIImage
    @State var shapes: [PhotoShape]
    let onSave: ([PhotoShape]) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var tool: PhotoShape.Kind = .arrow
    @State private var color = PhotoMarkup.colors[0]
    @State private var width = PhotoMarkup.widths[1]
    @State private var draft: PhotoShape?
    @State private var textAt: [Double]?
    @State private var text = ""

    private static let colorNames = ["#ef4444": String(localized: "Red"), "#f59e0b": String(localized: "Amber"), "#22c55e": String(localized: "Green"), "#3b82f6": String(localized: "Blue"), "#ffffff": String(localized: "White"), "#111827": String(localized: "Black")]

    private struct Tool: Identifiable { let kind: PhotoShape.Kind; let name: String; let icon: String; var id: String { kind.rawValue } }
    private static let tools: [Tool] = [
        Tool(kind: .arrow, name: String(localized: "Arrow"), icon: "arrow.up.right"), Tool(kind: .pen, name: String(localized: "Draw"), icon: "scribble"), Tool(kind: .rect, name: String(localized: "Box"), icon: "rectangle"),
        Tool(kind: .circle, name: String(localized: "Circle"), icon: "circle"), Tool(kind: .text, name: String(localized: "Text"), icon: "textformat"),
    ]

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let fit = fitRect(in: geo.size)
                ZStack(alignment: .topLeading) {
                    Color.black
                    Image(uiImage: image).resizable().frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY)
                    MarkupOverlay(shapes: shapes + (draft.map { [$0] } ?? []))
                        .frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { v in
                            let p = rel(v.location, fit), s = rel(v.startLocation, fit)
                            switch tool {
                            case .text: break
                            case .pen:
                                if draft == nil { draft = PhotoShape(kind: .pen, color: color, width: width, points: s) }
                                draft?.points += p
                            default:
                                draft = PhotoShape(kind: tool, color: color, width: width, points: s + p)
                            }
                        }
                        .onEnded { v in
                            if tool == .text { textAt = rel(v.location, fit); text = ""; return }
                            if var d = draft {
                                // Ignore taps that didn't draw anything.
                                let pts = d.points
                                let moved = hypot((pts[pts.count - 2] - pts[0]) * fit.width, (pts[pts.count - 1] - pts[1]) * fit.height) > 6 || (d.kind == .pen && pts.count > 6)
                                if moved { d.points = pts.map { ($0 * 10000).rounded() / 10000 }; shapes.append(d) }
                            }
                            draft = nil
                        }
                )
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Mark up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar, .bottomBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { onSave(shapes); dismiss() }.bold() }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { _ = shapes.popLast() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }.disabled(shapes.isEmpty)
                    Button(role: .destructive) { shapes = [] } label: { Label("Clear", systemImage: "trash") }.disabled(shapes.isEmpty)
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Picker("Tool", selection: $tool) {
                        ForEach(Self.tools) { t in Label(t.name, systemImage: t.icon).tag(t.kind) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: hSize == .compact ? 220 : 300)
                    Spacer()
                    if hSize == .compact {
                        // Phone: the colours sit in a menu so the bar fits.
                        Menu {
                            ForEach(PhotoMarkup.colors, id: \.self) { c in
                                Button { color = c } label: { Label(Self.colorNames[c] ?? c, systemImage: color == c ? "checkmark.circle.fill" : "circle.fill") }
                            }
                        } label: {
                            Circle().fill(Color(hex: color)).frame(width: 24, height: 24)
                                .overlay(Circle().stroke(Color.gray.opacity(0.6), lineWidth: 1))
                        }
                        .accessibilityLabel("Colour")
                    } else {
                        ForEach(PhotoMarkup.colors, id: \.self) { c in
                            Button { color = c } label: {
                                Circle().fill(Color(hex: c)).frame(width: 22, height: 22)
                                    .overlay(Circle().stroke(color == c ? Color.accentColor : Color.gray.opacity(0.5), lineWidth: color == c ? 3 : 1))
                            }
                            .accessibilityLabel("Colour \(Self.colorNames[c] ?? c)")
                        }
                    }
                    Spacer()
                    Menu {
                        ForEach(Array(PhotoMarkup.widths.enumerated()), id: \.offset) { i, w in
                            Button { width = w } label: {
                                if width == w { Label([String(localized: "Thin"), String(localized: "Medium"), String(localized: "Thick")][i], systemImage: "checkmark") } else { Text([String(localized: "Thin"), String(localized: "Medium"), String(localized: "Thick")][i]) }
                            }
                        }
                    } label: { Image(systemName: "lineweight") }
                }
            }
            .alert("Text", isPresented: Binding(get: { textAt != nil }, set: { if !$0 { textAt = nil } })) {
                TextField("Label", text: $text)
                Button("Add") {
                    if let at = textAt, !text.trimmingCharacters(in: .whitespaces).isEmpty {
                        shapes.append(PhotoShape(kind: .text, color: color, width: width, points: at, text: text.trimmingCharacters(in: .whitespaces)))
                    }
                    textAt = nil
                }
                Button("Cancel", role: .cancel) { textAt = nil }
            }
        }
    }

    private func fitRect(in size: CGSize) -> CGRect {
        let k = min(size.width / image.size.width, size.height / image.size.height)
        let w = image.size.width * k, h = image.size.height * k
        return CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h)
    }

    private func rel(_ p: CGPoint, _ r: CGRect) -> [Double] {
        [Double(min(1, max(0, (p.x - r.minX) / r.width))), Double(min(1, max(0, (p.y - r.minY) / r.height)))]
    }
}
