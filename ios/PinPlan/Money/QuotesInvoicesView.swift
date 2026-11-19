import SwiftUI
import PinPlanCore

/// The job's quotes, invoices and credit notes, read-only (they are made and sent on the web, docs/documents.md).
/// Office only: technicians never see prices. Cloud sync brings them down; nothing here changes them.
struct QuotesInvoicesView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        let docs = model.bundle.liveSalesDocs
        let day = FieldDocs.localDay(isoNow())
        let totals = SalesDocs.totals(docs)
        let currency = docs.first?.currency ?? model.pricing.currency
        SentenceList {
            if !app.cloud.can(.prices) {
                Section { Text("Quotes and invoices are handled by the office.").foregroundStyle(.secondary) }
            } else if docs.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("No quotes or invoices yet").font(.headline)
                        Text(app.cloud.signedIn
                             ? "Make quotes and invoices on the web. They show up here after the next sync."
                             : "Make quotes and invoices on the web, and sign in to cloud sync to see them here.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    webButton
                }
            } else {
                Section {
                    LabeledContent("Invoiced", value: SalesDocs.money(totals.invoiced, currency: currency))
                    if totals.credited > 0 { LabeledContent("Credited", value: SalesDocs.money(totals.credited, currency: currency)) }
                    LabeledContent("Paid", value: SalesDocs.money(totals.paid, currency: currency))
                    LabeledContent {
                        Text(SalesDocs.money(totals.balanceDue, currency: currency)).bold().foregroundStyle(totals.balanceDue > 0 ? Color.primary : Color.secondary)
                    } label: { Text("Balance due").bold() }
                }
                Section(sentence: "Documents") {
                    ForEach(docs) { d in DocRow(doc: d, status: SalesDocs.displayStatus(d, day: day)) }
                }
                Section {
                    webButton
                } footer: {
                    Text("Quotes and invoices are made, sent and paid on the web. This list is read-only.")
                }
            }
        }
        .navigationTitle("Quotes & invoices")
    }

    @ViewBuilder private var webButton: some View {
        if let s = BillingLogic.webURL(origin: app.settings.serverURL, path: "project?id=\(model.bundle.project.id)&tab=billing"), let url = URL(string: s) {
            Button { openURL(url) } label: { Label("Open on the web", systemImage: "safari") }
        } else {
            ServerSetupPrompt(feature: "Opening quotes and invoices on the web")
        }
    }
}

private struct DocRow: View {
    let doc: SalesDoc
    let status: SalesDocDisplayStatus

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(SalesDocs.name(doc)).font(.body.weight(.semibold)).monospacedDigit()
                (Text(doc.kind.label + " · ").foregroundColor(.secondary) + Text(status.label).foregroundColor(tone) + Text(dateText).foregroundColor(.secondary))
                    .font(.caption)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(SalesDocs.money(doc.total, currency: doc.currency)).monospacedDigit()
                if doc.kind == .invoice && doc.status != .draft && doc.status != .void && doc.balanceDue > 0 {
                    Text("\(SalesDocs.money(doc.balanceDue, currency: doc.currency)) due").font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var dateText: String { (doc.issueDate ?? "").isEmpty ? "" : " · " + (doc.issueDate ?? "") }

    private var tone: Color {
        switch status {
        case .overdue, .declined: return .red
        case .paid, .accepted: return .green
        default: return .secondary
        }
    }
}
