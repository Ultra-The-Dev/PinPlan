import SwiftUI
import PinPlanCore

struct TakeoffView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @Environment(\.exportPlacement) private var exportPlacement
    @State private var share: SharedFile?
    @State private var busy = false

    var body: some View {
        let t = model.takeoff
        let tot = t.total
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    Text("Counted only from placed devices and runs. (n?) = tentative, listed separately.").font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    Button { csv() } label: { Label("CSV", systemImage: "tablecells") }.buttonStyle(.bordered)
                    Button { pdf() } label: { Label(busy ? "Building…" : "Plans PDF", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent).disabled(busy || model.sheets.isEmpty)
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    StatTile(label: "Cameras", value: "\(tot.count(["cam-indoor", "cam-outdoor"]))", sub: "\(tot.counts["cam-outdoor"] ?? 0) outdoor")
                    StatTile(label: "Wi-Fi APs", value: "\(tot.counts["wap"] ?? 0)")
                    StatTile(label: "Speakers", value: "\(tot.counts["speaker"] ?? 0)", sub: (tot.tentative["speaker"] ?? 0) > 0 ? "\(tot.tentative["speaker"]!) tentative" : nil)
                    StatTile(label: "TVs", value: "\(tot.counts["tv"] ?? 0)")
                    StatTile(label: "LED", value: "\(tot.ledTotalFt.clean) LF", sub: "\(tot.ledZones) zones")
                    StatTile(label: "Cable", value: "\(tot.wireFt.values.reduce(0, +).clean) ft", sub: "\(tot.wireRuns.values.reduce(0, +)) home runs")
                }
                ScrollView(.horizontal) {
                    Grid(alignment: .trailing, horizontalSpacing: 18, verticalSpacing: 8) {
                        GridRow {
                            Text("Item").gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text($0.name) }
                            Text("Total").bold()
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Divider()
                        ForEach(app.liveCatalog.filter { d in (tot.counts[d.id] ?? 0) > 0 || (tot.ledFt[d.id] ?? 0) > 0 || (tot.ledTentativeFt[d.id] ?? 0) > 0 }) { d in
                            GridRow {
                                HStack { DeviceSymbol(type: d, size: 20); Text(d.name) }.gridColumnAlignment(.leading)
                                ForEach(t.floors) { f in cell(d, f.bucket) }
                                cell(d, tot).bold()
                            }
                        }
                        Divider()
                        GridRow {
                            Text("LED zones").gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text("\($0.bucket.ledZones)") }
                            Text("\(tot.ledZones)").bold()
                        }
                        GridRow {
                            Text("LED total").bold().gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text("\($0.bucket.ledTotalFt.clean) LF") }
                            Text("\(tot.ledTotalFt.clean) LF").bold()
                        }
                        ForEach(tot.wireFt.keys.sorted(), id: \.self) { w in
                            GridRow {
                                Text("\(w) cable").gridColumnAlignment(.leading)
                                ForEach(t.floors) { Text("\(($0.bucket.wireFt[w] ?? 0).clean) ft") }
                                Text("\((tot.wireFt[w] ?? 0).clean) ft").bold()
                            }
                        }
                        ForEach(ClosetKind.allCases) { k in
                            if (tot.closets[k] ?? 0) > 0 {
                                GridRow {
                                    Text(Catalog.closetInfo(k).name).gridColumnAlignment(.leading)
                                    ForEach(t.floors) { Text("\($0.bucket.closets[k] ?? 0)") }
                                    Text("\(tot.closets[k] ?? 0)").bold()
                                }
                            }
                        }
                    }
                    .font(.subheadline.monospacedDigit())
                    .padding()
                }
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                if tot.unmeasuredRuns > 0 {
                    Label("\(tot.unmeasuredRuns) run(s) have no length yet. Set each sheet's scale or type the LF on the run.", systemImage: "exclamationmark.triangle")
                        .font(.callout).foregroundStyle(.orange)
                }
                let tentative = model.bundle.liveMarkers.filter(\.tentative)
                if !tentative.isEmpty {
                    Text("Tentative items (\(tentative.count))").font(.headline)
                    ForEach(tentative) { m in
                        Button { model.focusOn(.marker(m.id)) } label: {
                            HStack {
                                Text(m.label).bold()
                                Text(app.type(m.deviceTypeId)?.name ?? "").foregroundStyle(.secondary)
                                Spacer()
                                Text(model.sheets.first { $0.id == m.sheetId }?.name ?? "").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .shareSheet($share)
    }

    @ViewBuilder
    private func cell(_ d: DeviceType, _ b: TakeoffBucket) -> some View {
        if d.kind == .led {
            let v = b.ledFt[d.id] ?? 0, tn = b.ledTentativeFt[d.id] ?? 0
            Text(v == 0 && tn == 0 ? "—" : "\(v.clean) LF" + (tn > 0 ? " (\(tn.clean)?)" : "")).foregroundStyle(v == 0 && tn == 0 ? .tertiary : .primary)
        } else {
            let v = b.counts[d.id] ?? 0, tn = b.tentative[d.id] ?? 0
            Text(v == 0 ? "—" : "\(v)" + (tn > 0 ? " (\(tn)?)" : "")).foregroundStyle(v == 0 ? .tertiary : .primary)
        }
    }

    private func csv() {
        let text = TakeoffCalculator.csv(model.takeoff, catalog: app.catalog)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(model.bundle.project.address))-takeoff.csv")
        try? text.write(to: url, atomically: true, encoding: .utf8)
        share = SharedFile(url: url)
    }

    private func pdf() {
        busy = true
        let bundle = model.bundle, catalog = app.catalog, store = app.store
        Task.detached(priority: .userInitiated) {
            let data = PDFExporter.planSheets(bundle: bundle, catalog: catalog, crew: false) { store.image($0) }
            let url = PDFExporter.write(data, name: "\(slug(bundle.project.address))-marked-plans.pdf")
            await MainActor.run { busy = false; share = SharedFile(url: url) }
        }
    }
}
