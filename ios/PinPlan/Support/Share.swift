import SwiftUI
import UIKit

/// System share sheet for exported files (PDF, CSV, backups) — AirDrop, Mail, Files, Messages…
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

struct SharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

extension View {
    /// Present a share sheet whenever `file` is set.
    func shareSheet(_ file: Binding<SharedFile?>) -> some View {
        sheet(item: file) { f in
            ActivityView(items: [f.url]).presentationDetents([.medium, .large])
        }
    }
}

/// Text field that commits on submit/defocus, so typing doesn't create an undo step per keystroke.
struct CommitField: View {
    let title: String
    let value: String
    var prompt: String = ""
    var keyboard: UIKeyboardType = .default
    let onCommit: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text, prompt: Text(prompt))
            .keyboardType(keyboard)
            .focused($focused)
            .onAppear { text = value }
            .onChange(of: value) { _, v in if !focused { text = v } }
            .onSubmit { if text != value { onCommit(text) } }
            .onChange(of: focused) { _, f in if !f && text != value { onCommit(text) } }
    }
}

/// Labeled row used in forms.
struct LabeledField<Content: View>: View {
    let label: String
    @ViewBuilder var content: Content
    var body: some View {
        LabeledContent(label) { content.multilineTextAlignment(.trailing) }
    }
}
