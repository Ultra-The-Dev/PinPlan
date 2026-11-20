import SwiftUI
import PinPlanCore

/// Settings → Trades: what the company works on (same packs as the web app). The first one is the primary trade —
/// it names the device menu's sections, runs and closets. Turning a trade on adds its starting catalog and wire prices;
/// nothing the company already has is replaced or deleted.
struct TradeSettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var draft: [TradeId] = []
    @State private var loaded = false
    @State private var message: String?

    var body: some View {
        let office = app.cloud.can(.prices)
        SentenceForm {
            Section {
                ForEach(Trades.packs) { p in
                    tradeRow(p, office: office)
                }
            } footer: {
                Text(office ? "Pick one or more. The first one you pick is your main trade." : "Your company’s owner or office sets the trades.")
            }
            if office {
                Section {
                    Button {
                        let n = app.setTrades(draft)
                        message = n > 0 ? String(localized: "Saved. Added \(n) items to the price list.") : String(localized: "Saved.")
                    } label: { Label("Save trades", systemImage: "checkmark.circle") }
                    .disabled(draft.isEmpty || draft == app.trades)
                } footer: {
                    if let message { Text(message) }
                }
            }
        }
        .navigationTitle("Trades")
        .onAppear {
            if !loaded { draft = app.trades; loaded = true }
        }
    }

    @ViewBuilder
    private func tradeRow(_ p: TradePack, office: Bool) -> some View {
        let on = draft.contains(p.id)
        let primary = draft.first == p.id && draft.count > 1
        Button {
            if on { draft.removeAll { $0 == p.id } } else { draft.append(p.id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(on ? Color(hex: p.color) : Color.secondary)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).foregroundStyle(Color.primary)
                    Text(p.examples).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if primary { Text("Primary").font(.caption.bold()).foregroundStyle(.secondary) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!office)
        .swipeActions {
            if on && !primary && draft.count > 1 {
                Button("Make primary") { draft = [p.id] + draft.filter { $0 != p.id } }.tint(.blue)
            }
        }
    }
}
