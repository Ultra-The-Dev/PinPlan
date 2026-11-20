import SwiftUI
import PinPlanCore

/// Send the client the plans only — every device with a legend, no prices — to check where everything goes before pricing.
/// They open it on the web app's /p page and approve the layout or ask for changes.
struct PlanReviewView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var rows: [CloudSync.ProposalRow]?
    @State private var problem: String?
    @State private var busy: String?
    @State private var showForm = false
    @State private var title = ""
    @State private var message = ""
    @State private var share: SharedFile?
    @State private var pdfBusy = false

    private var serverReady: Bool { !app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty }
    private func link(_ id: String) -> URL? { URL(string: Proposals.url(base: app.settings.serverURL, token: id)) }
    private var live: [CloudSync.ProposalRow] { rows?.filter { $0.status != "revoked" } ?? [] }

    var body: some View {
        SentenceForm {
            Section {
                Text("The marked-up plans with a legend that explains every symbol — no prices — so the client can check where everything goes. They can approve the layout or tell you what to change.")
                    .font(.callout).foregroundStyle(.secondary)
                Button { pdf() } label: { Label(pdfBusy ? "Building…" : "Client plan PDF", systemImage: "doc.richtext") }.disabled(pdfBusy || model.sheets.isEmpty)
            }
            if !app.cloud.signedIn || !serverReady {
                Section {
                    Text("A review link needs cloud sync and the PinPlan server address (the client opens it on your web app). The PDF works without them.")
                        .foregroundStyle(.secondary)
                    if !app.cloud.signedIn { NavigationLink("Set up cloud sync") { CloudSyncView() } }
                    if !serverReady { NavigationLink("Set the PinPlan server") { ServerSetupView() } }
                }
            } else {
                ForEach(live) { r in
                    Section { row(r) } header: { Text(statusText(r)).textCase(nil) }
                }
                if rows == nil { Section { ProgressView() } }
                Section {
                    if showForm {
                        TextField("Title (optional)", text: $title)
                        TextField("Message to the client", text: $message, prompt: Text("Here’s where we’re planning to put everything. Let us know if anything should move…"), axis: .vertical).lineLimit(3...8)
                        HStack {
                            Button("Cancel") { showForm = false }.buttonStyle(.bordered)
                            Spacer()
                            Button { Task { await publish() } } label: { Text(busy ?? String(localized: "Get client link")) }.buttonStyle(.borderedProminent).disabled(busy != nil)
                        }
                    } else {
                        Button { showForm = true } label: { Label(live.isEmpty ? "Send plan for review" : "Send an updated plan", systemImage: "eye") }
                            .disabled(model.sheets.isEmpty || model.bundle.liveMarkers.isEmpty)
                    }
                }
            }
            if let problem { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
        }
        .navigationTitle("Plan review")
        .task { await refresh() }
        .refreshable { await refresh() }
        .shareSheet($share)
    }

    private func statusText(_ r: CloudSync.ProposalRow) -> String {
        switch r.status {
        case "sent": return String(localized: "Sent — not opened yet")
        case "viewed": return String(localized: "Opened by the client")
        case "accepted": return String(localized: "Layout approved")
        case "declined": return String(localized: "Changes requested")
        default: return r.status.capitalized
        }
    }

    @ViewBuilder private func row(_ r: CloudSync.ProposalRow) -> some View {
        if r.status == "accepted" {
            Label("\(r.client_name ?? String(localized: "The client")) approved the layout. Next: price it and send the quote from Money.", systemImage: "checkmark.seal.fill")
                .foregroundStyle(Color.approved)
            if let note = r.client_note, !note.isEmpty { clientNote(note) }
        }
        if r.status == "declined" {
            Label("\(r.client_name ?? String(localized: "The client")) asked for changes. Update the plan, then send an updated plan.", systemImage: "exclamationmark.bubble.fill")
                .foregroundStyle(.orange)
            if let note = r.client_note, !note.isEmpty { clientNote(note) }
        }
        if let url = link(r.id) {
            ShareLink(item: url, subject: Text(r.snapshot.title), message: Text(verbatim: "Here’s the preliminary plan showing where everything will go — the legend explains each symbol. Let us know if it looks right or what you’d like changed:")) {
                Label("Share link", systemImage: "square.and.arrow.up")
            }
            Button { PrivateClipboard.copy(url); model.say(String(localized: "Link copied")) } label: { Label("Copy link", systemImage: "doc.on.doc") }
            Link(destination: url) { Label("Open", systemImage: "safari") }
        }
        if r.status == "sent" || r.status == "viewed" {
            Button("Withdraw", role: .destructive) { Task { try? await app.cloud.withdrawProposal(r.id); await refresh() } }
        }
    }

    /// The client's note: their text, then each pin they dropped on the plan (numbered like on the web page).
    @ViewBuilder private func clientNote(_ note: String) -> some View {
        let parsed = Proposals.parseClientNote(note)
        if !parsed.text.isEmpty {
            Text("“\(parsed.text)”")
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
        ForEach(Array(parsed.pins.enumerated()), id: \.offset) { _, pin in
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(pin.n)")
                    .font(.caption.bold())
                    .foregroundStyle(Color.white)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.red))
                VStack(alignment: .leading, spacing: 2) {
                    Text(pin.note.isEmpty ? String(localized: "(no note)") : pin.note)
                        .font(.callout)
                        .foregroundStyle(pin.note.isEmpty ? Color.secondary : Color.primary)
                    Text("\(pin.floor) · \(Int((pin.x * 100).rounded()))% across, \(Int((pin.y * 100).rounded()))% down")
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                }
            }
        }
    }

    private func refresh() async {
        guard app.cloud.signedIn else { return }
        do {
            rows = try await app.cloud.proposals(projectId: model.bundle.project.id).filter { $0.snapshot.isReview }
        } catch { problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }

    /// Symbol picture for the legend (PNG data URL), drawn like on the plan.
    static func symbolPNG(_ t: DeviceType) -> String? {
        let size = CGSize(width: 64, height: 64)
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        let img = UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in
            PDFExporter.drawSymbol(ctx.cgContext, type: t, at: CGPoint(x: 32, y: 32), r: 26, tentative: false, label: nil)
        }
        return img.pngData().map { "data:image/png;base64," + $0.base64EncodedString() }
    }

    private func publish() async {
        problem = nil
        busy = String(localized: "Preparing…")
        defer { busy = nil }
        let b = model.bundle, catalog = app.catalog, store = app.store
        let takeoff = TakeoffCalculator.compute(b)
        let est = b.estimate(catalog: catalog, products: app.products, pricing: model.pricing)
        busy = String(localized: "Drawing plans…")
        let images = await Task.detached(priority: .userInitiated) { ClientProposalView.render(b, catalog: catalog, store: store) }.value
        let legend = Legend.build(takeoff: takeoff, catalog: catalog, icon: { Self.symbolPNG($0) }, trades: app.trades)
        let token = Proposals.newToken()
        let open = live.filter { $0.status == "sent" || $0.status == "viewed" }.map(\.id)
        let business = app.business
        let origin = app.settings.serverURL
        do {
            try await app.cloud.publishProposal(token: token, projectId: b.project.id, images: images, build: { urls in
                Proposals.snapshot(bundle: b, catalog: catalog, takeoff: takeoff, estimate: est, business: business, currency: "", taxPct: 0,
                                   title: title, message: message, validDays: nil, detail: .lines, depositPct: nil, images: urls, origin: origin,
                                   review: true, legend: legend)
            }, withdraw: open, progress: { busy = $0 })
            showForm = false
            if let url = link(token) { PrivateClipboard.copy(url); model.say(String(localized: "Client link ready — copied")) }
            await refresh()
        } catch { problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }

    /// The plans PDF with devices and lighting only (no crew wiring) — for the client.
    private func pdf() {
        pdfBusy = true
        let bundle = model.bundle, catalog = app.catalog, store = app.store
        let layers = Set(Layer.allCases).subtracting([.wiring])
        Task.detached(priority: .userInitiated) {
            let data = PDFExporter.planSheets(bundle: bundle, catalog: catalog, crew: false, layers: layers) { store.image($0) }
            let url = PDFExporter.write(data, name: "\(slug(bundle.project.address.isEmpty ? "job" : bundle.project.address))-plan-review.pdf")
            await MainActor.run { pdfBusy = false; share = SharedFile(url: url) }
        }
    }
}
