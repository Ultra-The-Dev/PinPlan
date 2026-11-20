import SwiftUI
import PinPlanCore

/// Send the client a link to review the plans and price, pick options and sign online (opens the web app's /p page).
struct ClientProposalView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var rows: [CloudSync.ProposalRow]?
    @State private var problem: String?
    @State private var busy: String?
    @State private var showForm = false
    @State private var title = ""
    @State private var message = ""
    @State private var validDays = 30
    @State private var deposit = "50"
    @State private var detail: ProposalSnapshot.Detail = .lines
    @State private var plans = true

    private var serverReady: Bool { !app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty }
    private func link(_ id: String) -> URL? { URL(string: Proposals.url(base: app.settings.serverURL, token: id)) }

    var body: some View {
        SentenceForm {
            if !app.cloud.signedIn || !serverReady {
                Section {
                    Text("Client links need cloud sync and the PinPlan server address (the client opens the link on your web app).")
                        .foregroundStyle(.secondary)
                    if !app.cloud.signedIn { NavigationLink("Set up cloud sync") { CloudSyncView() } }
                    if !serverReady { NavigationLink("Set the PinPlan server") { ServerSetupView() } }
                }
            } else {
                ForEach(rows?.filter { $0.status != "revoked" } ?? []) { r in
                    Section { row(r) } header: { Text(statusText(r)).textCase(nil) }
                }
                if rows == nil { Section { ProgressView() } }
                Section {
                    if showForm { form } else {
                        Button {
                            showForm = true
                        } label: { Label((rows ?? []).contains { $0.status != "revoked" } ? String(localized: "Send an updated quote") : String(localized: "Get client link"), systemImage: "signature") }
                    }
                } footer: {
                    if !showForm { Text("The client sees your business details, the scope, the plans, this quote and your terms. Optional items show as add-ons they can tick.") }
                }
                if let n = rows?.filter({ $0.status == "revoked" }).count, n > 0 {
                    Section { Text("\(n) earlier links withdrawn").font(.caption).foregroundStyle(.secondary) }
                }
            }
            if let problem { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
        }
        .navigationTitle("Quote for the client")
        .task { await refresh() }
        .refreshable { await refresh() }
    }

    @ViewBuilder private var form: some View {
        TextField("Title (optional)", text: $title)
        TextField("Message to the client", text: $message, axis: .vertical).lineLimit(3...8)
        Stepper("Valid for \(validDays) days", value: $validDays, in: 7...120, step: 7)
        LabeledContent("Deposit %") { TextField("none", text: $deposit).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
        Picker("Prices shown", selection: $detail) { Text("Every line").tag(ProposalSnapshot.Detail.lines); Text("Section totals").tag(ProposalSnapshot.Detail.sections) }
        Toggle("Include the marked-up plans", isOn: $plans)
        HStack {
            Button("Cancel") { showForm = false }.buttonStyle(.bordered)
            Spacer()
            Button { Task { await publish() } } label: { Text(busy ?? String(localized: "Get client link")) }.buttonStyle(.borderedProminent).disabled(busy != nil)
        }
    }

    private func statusText(_ r: CloudSync.ProposalRow) -> String {
        switch r.status {
        case "sent": return String(localized: "Sent — not opened yet")
        case "viewed": return String(localized: "Opened by the client")
        case "accepted": return String(localized: "Approved")
        case "declined": return String(localized: "Declined")
        default: return r.status.capitalized
        }
    }

    @ViewBuilder private func row(_ r: CloudSync.ProposalRow) -> some View {
        let cur = r.snapshot.currency
        if r.status == "accepted" {
            Label("\(r.client_name ?? String(localized: "The client")) approved · \(Money.format(r.accepted_total ?? 0, currency: cur))", systemImage: "checkmark.seal.fill").foregroundStyle(Color.approved)
            let chosen = r.snapshot.lines.filter { (r.chosen_options ?? []).contains($0.key) }
            if !chosen.isEmpty { Text("Options: " + chosen.map(\.description).joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
            if let sig = r.signature, let data = Data(base64Encoded: String(sig.split(separator: ",").last ?? "")), let img = UIImage(data: data) {
                Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 60).background(.white)
            }
            if let d = r.snapshot.depositPct { Text("Next: send the \(d.clean)% deposit invoice from Money.").font(.caption).foregroundStyle(.secondary) }
        }
        if r.status == "declined" { Text("\(r.client_name ?? String(localized: "The client")) declined\(r.client_note.map { ": “\($0)”" } ?? ".")") }
        if let url = link(r.id) {
            ShareLink(item: url, subject: Text(r.snapshot.title), message: Text("Here is your quote — you can review it and approve it online:")) {
                Label("Share link", systemImage: "square.and.arrow.up")
            }
            Button { UIPasteboard.general.url = url; model.say(String(localized: "Link copied")) } label: { Label("Copy link", systemImage: "doc.on.doc") }
            Link(destination: url) { Label("Open", systemImage: "safari") }
        }
        if r.status == "sent" || r.status == "viewed" {
            Button("Withdraw", role: .destructive) { Task { try? await app.cloud.withdrawProposal(r.id); await refresh() } }
        }
    }

    private func refresh() async {
        guard app.cloud.signedIn else { return }
        do {
            // Plan reviews (no prices) live on the Takeoff tab's "Send plan to client".
            let list = try await app.cloud.proposals(projectId: model.bundle.project.id).filter { !$0.snapshot.isReview }
            rows = list
            applyAcceptance(list)
        } catch { problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }

    /// A client accepted: approve the job and switch on the options they picked (once — the job is then approved).
    private func applyAcceptance(_ list: [CloudSync.ProposalRow]) {
        guard let a = list.first(where: { $0.status == "accepted" }), model.bundle.project.status == .estimate else { return }
        let chosen = Set(a.chosen_options ?? [])
        model.editSilently { b in
            for l in a.snapshot.lines where l.optional { b.upsertEstimateLine(key: l.key) { $0.include = chosen.contains(l.key) } }
            b.project.status = .approved
            b.project.updatedAt = isoNow()
        }
        model.say(a.client_name.map { String(localized: "\($0) approved the quote — job approved") } ?? String(localized: "The client approved the quote — job approved"))
    }

    private func publish() async {
        problem = nil
        busy = String(localized: "Preparing…")
        defer { busy = nil }
        let b = model.bundle, catalog = app.catalog, store = app.store
        let pricing = model.pricing
        let est = b.estimate(catalog: catalog, products: app.products, pricing: pricing)
        let takeoff = TakeoffCalculator.compute(b)
        var images: [String: Data] = [:]
        if plans {
            busy = String(localized: "Drawing plans…")
            images = await Task.detached(priority: .userInitiated) { Self.render(b, catalog: catalog, store: store) }.value
        }
        let token = Proposals.newToken()
        let open = (rows ?? []).filter { $0.status == "sent" || $0.status == "viewed" }.map(\.id)
        let business = app.business
        let origin = app.settings.serverURL
        let dep = Double(deposit.replacingOccurrences(of: ",", with: "."))
        do {
            try await app.cloud.publishProposal(token: token, projectId: b.project.id, images: images, build: { urls in
                Proposals.snapshot(bundle: b, catalog: catalog, takeoff: takeoff, estimate: est, business: business, currency: pricing.currency,
                                   taxPct: pricing.taxPct, title: title, message: message, validDays: validDays, detail: detail, depositPct: dep, images: urls, origin: origin)
            }, withdraw: open, progress: { busy = $0 })
            showForm = false
            if let url = link(token) { UIPasteboard.general.url = url; model.say(String(localized: "Client link ready — copied")) }
            await refresh()
        } catch { problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }

    /// Each sheet with devices and lighting (no crew wiring), as JPEG.
    nonisolated static func render(_ b: ProjectBundle, catalog: [DeviceType], store: Store) -> [String: Data] {
        var out: [String: Data] = [:]
        let layers = Set(Layer.allCases).subtracting([.wiring])
        for s in b.liveSheets {
            let k = min(1, 2400 / max(s.width, s.height))
            let size = CGSize(width: s.width * k, height: s.height * k)
            let fmt = UIGraphicsImageRendererFormat()
            fmt.scale = 1
            let img = UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
                PDFExporter.drawSheet(ctx.cgContext, sheet: s, image: store.image(s.imageId), bundle: b, catalog: catalog, layers: layers, labels: false,
                                      in: CGRect(origin: .zero, size: size), symbolScale: 2)
            }
            if let d = img.jpegData(compressionQuality: 0.82) { out[s.id] = d }
        }
        return out
    }
}
