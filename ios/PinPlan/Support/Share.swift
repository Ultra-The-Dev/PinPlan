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

/// Side panel (iPad, embedded in the editor) or sheet (iPhone) chrome.
/// A NavigationStack is only used in a sheet: nesting one inside the app's navigation stack would reset it.
struct PanelContainer<Content: View>: View {
    let title: String
    let inSheet: Bool
    let onClose: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        if inSheet {
            NavigationStack {
                content
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button { onClose() } label: { Image(systemName: "xmark") } } }
            }
        } else {
            VStack(spacing: 0) {
                HStack {
                    Text(title).font(.headline).lineLimit(1)
                    Spacer()
                    Button { onClose() } label: { Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary) }
                        .accessibilityLabel("Close")
                }
                .padding(.horizontal).padding(.vertical, 10)
                Divider()
                content
            }
            .background(Color(.systemGroupedBackground))
        }
    }
}
