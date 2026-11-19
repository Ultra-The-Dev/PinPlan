import SwiftUI
import MapKit
import PinPlanCore

/// Every job's photos in one feed, newest first (CompanyCam-style company feed). Tap a photo to open its job.
struct AllPhotosView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void
    @State private var search = ""
    @State private var tag: String?

    private struct Item: Identifiable { let photo: Photo; let job: String; var id: String { photo.id } }

    private var all: [Item] {
        app.projects.filter { $0.project.deleted != true }.flatMap { b in
            b.livePhotos.map { Item(photo: $0, job: b.project.address.isEmpty ? (b.project.clientName.isEmpty ? "Untitled job" : b.project.clientName) : b.project.address) }
        }
    }

    var body: some View {
        let items = all
        let tags = FieldDocs.tagOptions(items.map(\.photo)).filter { t in items.contains { ($0.photo.tags ?? []).contains(t) } }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let shown = items.filter { i in
            (tag == nil || (i.photo.tags ?? []).contains(tag!)) &&
            (q.isEmpty || "\(i.job) \(i.photo.caption ?? "") \(i.photo.room ?? "") \(i.photo.takenBy ?? "") \((i.photo.tags ?? []).joined(separator: " "))".lowercased().contains(q))
        }
        let days = Dictionary(grouping: shown) { FieldDocs.localDay($0.photo.takenAt) }
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(tags.prefix(16), id: \.self) { t in
                                    let on = tag == t
                                    Button { tag = on ? nil : t } label: {
                                        Text(t).font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                                            .background(on ? Color.accentColor : Color(.secondarySystemFill), in: Capsule())
                                            .foregroundStyle(on ? Color.white : Color.primary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    if items.isEmpty {
                        ContentUnavailableView("No photos yet", systemImage: "camera", description: Text("Photos taken on any job show up here, newest first."))
                            .padding(.top, 40)
                    } else if shown.isEmpty {
                        ContentUnavailableView.search(text: search)
                    }
                    ForEach(days.keys.sorted(by: >), id: \.self) { d in
                        let group = days[d]!.sorted { $0.photo.takenAt > $1.photo.takenAt }
                        Text("\(dayTitle(d)) · \(group.count)").font(.headline)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120, maximum: 200), spacing: 6)], spacing: 6) {
                            ForEach(group) { i in
                                Button { dismiss(); onOpen(i.photo.projectId) } label: {
                                    PhotoThumb(photo: i.photo)
                                        .overlay(alignment: .bottomLeading) {
                                            Text(i.job).font(.caption2.weight(.semibold)).lineLimit(1).foregroundStyle(.white)
                                                .padding(.horizontal, 6).padding(.vertical, 3).background(.black.opacity(0.55), in: Capsule()).padding(5)
                                        }
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(i.photo.caption ?? "Photo") — \(i.job)")
                            }
                        }
                    }
                }
                .padding()
            }
            .searchable(text: $search, prompt: "Job, caption, room, person")
            .navigationTitle("All photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}

/// Jobs on a map, coloured by status. A job gets its place from its first GPS photo or from the Job tab.
struct JobsMapView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void

    private func color(_ s: ProjectStatus) -> Color { s == .estimate ? .orange : s == .approved ? .brand : .green }

    var body: some View {
        let placed = app.projects.filter { $0.project.deleted != true && $0.project.lat != nil && $0.project.lng != nil }
        let unplaced = app.projects.filter { $0.project.deleted != true && ($0.project.lat == nil || $0.project.lng == nil) }
        NavigationStack {
            VStack(spacing: 0) {
                Map(initialPosition: .automatic) {
                    ForEach(placed, id: \.project.id) { b in
                        Annotation(b.project.address.isEmpty ? b.project.clientName : b.project.address,
                                   coordinate: CLLocationCoordinate2D(latitude: b.project.lat!, longitude: b.project.lng!)) {
                            Button { dismiss(); onOpen(b.project.id) } label: {
                                Image(systemName: "house.fill").font(.caption.weight(.bold)).foregroundStyle(.white)
                                    .frame(width: 30, height: 30).background(color(b.project.status), in: Circle())
                                    .overlay(Circle().stroke(.white, lineWidth: 2)).shadow(radius: 2)
                            }
                            .accessibilityLabel("Open \(b.project.address)")
                        }
                    }
                }
                .mapControls { MapUserLocationButton(); MapCompass() }
                HStack(spacing: 14) {
                    ForEach([ProjectStatus.estimate, .approved, .installed], id: \.self) { s in
                        Label(s.rawValue.capitalized, systemImage: "circle.fill").font(.caption).foregroundStyle(color(s))
                    }
                    Spacer()
                    if !unplaced.isEmpty {
                        Menu("\(unplaced.count) not on the map") {
                            ForEach(unplaced, id: \.project.id) { b in
                                Button(b.project.address.isEmpty ? "Untitled job" : b.project.address) { dismiss(); onOpen(b.project.id) }
                            }
                        }
                        .font(.caption)
                    }
                }
                .padding()
                .background(.bar)
            }
            .navigationTitle("Jobs map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .overlay {
                if placed.isEmpty {
                    ContentUnavailableView("No jobs on the map yet", systemImage: "map",
                                           description: Text("Take a photo on site with location on, or set the location on the job’s Job tab."))
                        .background(.regularMaterial)
                }
            }
        }
    }
}
