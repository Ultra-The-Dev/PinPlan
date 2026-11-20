import SafariServices
import SwiftUI
import PinPlanCore

// Help & tutorials: the web Help center (short guides with screenshots, docs/help-and-tours.md) opened inside the app
// in a Safari view, from Settings › About and the Jobs screen's More menu, plus a one-time tip on the Jobs screen.
// The address comes from WebLinks.helpURL: the app's own server, else the public site.

/// A web page to show in-app (Identifiable so it can drive `.sheet(item:)`).
struct InAppPage: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// SFSafariViewController in SwiftUI: the page keeps Safari's sign-in, reader and share sheet, and Done closes it.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.dismissButtonStyle = .done
        return vc
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

extension AppSettings {
    /// Help & tutorials, or one guide (`crew`, `offline-sync`…).
    func helpURL(guide: String? = nil) -> URL? {
        URL(string: WebLinks.helpURL(origin: serverURL, guide: guide))
    }
}

/// A row that opens Help in-app (Settings › About).
struct HelpRow: View {
    @Environment(AppModel.self) private var app
    @State private var page: InAppPage?

    var body: some View {
        Button {
            if let url = app.settings.helpURL() { page = InAppPage(url: url) }
        } label: {
            HStack {
                Label("Help & tutorials", systemImage: "questionmark.circle")
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.secondary)
            }
        }
        .accessibilityHint(Text("Short guides for the office and the crew."))
        .sheet(item: $page) { p in SafariView(url: p.url).ignoresSafeArea() }
    }
}

/// The one-time tip on the Jobs screen: where Help lives. Shown until it's opened or closed, once per install.
struct HelpTipBanner: View {
    @AppStorage("pinplan.help.tipSeen") private var seen = false
    let onOpen: () -> Void

    var body: some View {
        if !seen {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lightbulb").foregroundStyle(Color.accentColor).padding(.top, 2)
                VStack(alignment: .leading, spacing: 6) {
                    Text("New here? Help & tutorials has short guides for the office and the crew.")
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open Help") {
                        seen = true
                        onOpen()
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
                }
                Spacer(minLength: 0)
                Button {
                    seen = true
                } label: {
                    Image(systemName: "xmark").font(.footnote.weight(.semibold)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.secondary)
                .accessibilityLabel(Text("Dismiss tip"))
            }
            .padding(.leading, 14)
            .padding(.vertical, 6)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .contain)
        }
    }
}
