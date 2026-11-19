import SwiftUI
import PencilKit
import PinPlanCore

/// Sign a form field with a finger or Apple Pencil. "Sign as someone else" records another person's name (an inspector,
/// the customer) with this device's user as the one who collected it.
struct FormSignatureSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let me: String
    let onSave: (UIImage, String, String) -> Void
    @State private var other = false
    @State private var name = ""
    @State private var role = ""
    @State private var drawing = PKDrawing()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Who is signing", selection: $other) {
                        Text("Me (\(me))").tag(false)
                        Text("Someone else").tag(true)
                    }
                    .pickerStyle(.segmented)
                    if other { TextField("Their name", text: $name).textContentType(.name) }
                    TextField("Role (optional) — customer, inspector…", text: $role)
                }
                Section {
                    SignatureCanvas(drawing: $drawing)
                        .frame(height: 200)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(alignment: .bottomLeading) {
                            Rectangle().fill(Color.gray.opacity(0.5)).frame(height: 1).padding(.horizontal, 16).padding(.bottom, 40)
                        }
                        .listRowInsets(EdgeInsets())
                } header: { Text("Sign here") } footer: {
                    Text(other ? "Their signature is saved with your name as the person who collected it." : "Your name and the time are saved with the signature.")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) { Button("Clear") { drawing = PKDrawing() }.disabled(drawing.strokes.isEmpty) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(drawing.strokes.isEmpty || signer.isEmpty)
                }
            }
            .onAppear {
                // Customer / inspector fields usually get someone else's signature.
                let l = title.lowercased()
                if l.contains("customer") || l.contains("inspector") || l.contains("witness") { other = true }
                if l.contains("customer") { role = "Customer" } else if l.contains("inspector") || l.contains("witness") { role = "Inspector" }
            }
        }
    }

    private var signer: String { other ? name.trimmingCharacters(in: .whitespaces) : me }

    private func save() {
        let bounds: CGRect = drawing.bounds.insetBy(dx: -12, dy: -12)
        // Black ink on a light background whatever the appearance.
        var image = UIImage()
        let d = drawing
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent { image = d.image(from: bounds, scale: 2) }
        onSave(image, signer, role.trimmingCharacters(in: .whitespaces))
    }
}

/// PencilKit canvas for a signature (finger or pencil).
struct SignatureCanvas: UIViewRepresentable {
    @Binding var drawing: PKDrawing

    func makeUIView(context: Context) -> PKCanvasView {
        let v = PKCanvasView()
        v.drawingPolicy = .anyInput
        v.tool = PKInkingTool(.pen, color: .black, width: 3)
        v.backgroundColor = .clear
        v.isOpaque = false
        v.overrideUserInterfaceStyle = .light
        v.delegate = context.coordinator
        v.drawing = drawing
        return v
    }

    func updateUIView(_ v: PKCanvasView, context: Context) {
        // Only "Clear" changes the drawing from outside.
        if drawing.strokes.isEmpty && !v.drawing.strokes.isEmpty { v.drawing = drawing }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let parent: SignatureCanvas
        init(_ p: SignatureCanvas) { parent = p }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) { parent.drawing = canvasView.drawing }
    }
}
