import SafariServices
import SwiftUI
import PinPlanCore

// Help & tutorials (docs/help-and-tours.md): the native Tutorials screen (Tutorial/TutorialViews.swift: guided tours
// that work offline, the welcome walkthrough) from Settings › About and the Jobs screen's More menu, with the web
// Help center (short guides with screenshots) opened inside the app in a Safari view; plus the one first-run prompt
// on the Jobs screen. The web address comes from WebLinks.helpURL: the app's own server, else the public site.

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

/// A row that opens Help & tutorials (Settings › About): the native Tutorials screen, which links to the web Help center.
struct HelpRow: View {
    var body: some View {
        NavigationLink {
            TutorialsView()
        } label: {
            Label("Help & tutorials", systemImage: "questionmark.circle")
        }
        .accessibilityHint(Text("Short guides for the office and the crew."))
        .accessibilityIdentifier("help-tutorials")
    }
}

/// The one first-run prompt on the Jobs screen: the tour (the welcome walkthrough, then the tour for this person) or
/// Help & tutorials. Shown until it's answered (Start, Help, or ×) or "Don't show again"; people who closed the earlier
/// Help tip (`pinplan.help.tipSeen`) aren't asked again (TutorialStore).
struct HelpTipBanner: View {
    /// Opens the welcome walkthrough.
    let onStart: () -> Void
    /// Opens Tutorials (with the web Help center).
    let onOpen: () -> Void

    private var tour: TutorialController { .shared }

    var body: some View {
        if tour.showsFirstRunPrompt {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lightbulb").foregroundStyle(Color.accentColor).padding(.top, 2).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("New here? Take the 2-minute tour")
                        .font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("It shows the basics on a demo job and works offline.")
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    // Side by side when they fit; stacked in a long language or at large text sizes.
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 18) { startButton; helpButton }
                        VStack(alignment: .leading, spacing: 0) { startButton; helpButton }
                    }
                }
                Spacer(minLength: 0)
                Button {
                    tour.answerWelcome()
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
            .accessibilityIdentifier("tutorial-banner")
        }
    }

    private var startButton: some View {
        Button("Start the tour") {
            tour.answerWelcome()
            onStart()
        }
        .font(.subheadline.weight(.semibold))
        .frame(minHeight: 44)
        .accessibilityIdentifier("tutorial-banner-start")
    }

    private var helpButton: some View {
        Button("Help & tutorials") {
            tour.answerWelcome()
            onOpen()
        }
        .font(.subheadline)
        .frame(minHeight: 44)
    }
}
