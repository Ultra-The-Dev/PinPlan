import XCTest
@testable import PinPlanCore

final class SafeIdTests: XCTestCase {
    func testAcceptsAppAndWebIds() {
        for _ in 0..<200 { XCTAssertTrue(SafeId.isSafe(newId())) }
        XCTAssertTrue(SafeId.isSafe(newId(8)))
        XCTAssertTrue(SafeId.isSafe("V1StGXR8_Z5jdHi6B-myT"))   // nanoid
        XCTAssertTrue(SafeId.isSafe("cam-indoor"))
        XCTAssertTrue(SafeId.isSafe(String(repeating: "a", count: 64)))
        XCTAssertTrue(Catalog.seed().allSatisfy { SafeId.isSafe($0.id) })
    }

    func testRejectsPathsAndOddCharacters() {
        for bad in ["", "..", "../x", "../../Library/Preferences/x", "a/b", "/etc/passwd", "a\\b", "a.b", "a b", "a\0b",
                    "é", "a\n", "%2e%2e", "~", String(repeating: "a", count: 65)] {
            XCTAssertFalse(SafeId.isSafe(bad), bad)
        }
    }

    func testContainment() {
        let dir = URL(fileURLWithPath: "/tmp/pinplan/images", isDirectory: true)
        XCTAssertTrue(SafeId.isContained(dir.appendingPathComponent("abc.jpg"), in: dir))
        XCTAssertFalse(SafeId.isContained(dir.appendingPathComponent("../settings.json"), in: dir))
        XCTAssertFalse(SafeId.isContained(dir.appendingPathComponent("../images2/x.jpg"), in: dir))
        XCTAssertFalse(SafeId.isContained(dir, in: dir))
        XCTAssertEqual(SafeId.file("abc", ext: "jpg", in: dir)?.lastPathComponent, "abc.jpg")
        XCTAssertNil(SafeId.file("../abc", ext: "jpg", in: dir))
        XCTAssertNil(SafeId.file("", ext: "jpg", in: dir))
    }
}

final class BackupRestoreTests: XCTestCase {
    private func job(id: String = newId(), imageId: String = newId()) -> ProjectBundle {
        let p = Project(id: id, clientName: "Client", address: "1 Test St")
        var b = ProjectBundle(project: p)
        let sheet = Sheet(projectId: p.id, name: "Level 1", pageNumber: 1, order: 0, imageId: imageId, width: 100, height: 100)
        b.sheets = [sheet]
        b.markers = [Marker(projectId: p.id, sheetId: sheet.id, deviceTypeId: "cam-indoor", x: 0.5, y: 0.5, label: "C1")]
        return b
    }

    private func file(_ bundles: [ProjectBundle], catalog: [DeviceType] = [], products: [Product]? = nil) -> BackupFile {
        BackupFile(catalog: catalog, products: products, projects: bundles.map { b in
            BackupFile.ProjectEntry(bundle: b, images: b.storedImageIds.map { .init(id: $0, mime: "image/jpeg", width: 1, height: 1, data: "") })
        })
    }

    func testBackupWithTraversalIdsIsRefused() throws {
        XCTAssertTrue(file([job()]).unsafeIds.isEmpty)
        XCTAssertNoThrow(try file([job()]).validateIds())
        // Project id, sheet image, document file, source PDF, raw image entry, catalog type and product.
        XCTAssertEqual(file([job(id: "../../settings")]).unsafeIds, ["../../settings"])
        XCTAssertFalse(file([job(imageId: "../catalog")]).unsafeIds.isEmpty)
        var withDoc = job()
        withDoc.documents = [try JSONDecoder().decode(JobDocument.self, from: Data(#"{"id":"d1","projectId":"\#(withDoc.project.id)","name":"x","mime":"application/pdf","size":1,"fileId":"../x","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}"#.utf8))]
        XCTAssertEqual(withDoc.unsafeFileIds, ["../x"])
        var withPdf = job()
        withPdf.sheets[0].sourcePdfId = "a/b"
        XCTAssertEqual(withPdf.unsafeFileIds, ["a/b"])
        var f = file([job()])
        f.projects[0].images.append(.init(id: "../../x", mime: "image/jpeg", width: 1, height: 1, data: ""))
        XCTAssertEqual(f.unsafeIds, ["../../x"])
        var badType = Catalog.seed()[0]
        badType.id = "../t"
        XCTAssertEqual(file([], catalog: [badType]).unsafeIds, ["../t"])
        XCTAssertEqual(file([], products: [Product(id: "a/b", deviceTypeId: "cam-indoor", brand: "B", model: "M")]).unsafeIds, ["a/b"])
        XCTAssertThrowsError(try file([job(id: "..")]).validateIds())
        // Also when decoded from a file.
        let decoded = try BackupFile.decode(file([job(id: "../x")]).encoded())
        XCTAssertThrowsError(try decoded.validateIds())
    }

    func testPlanListsWhatItAddsOrReplaces() {
        let existing = job(), fresh = job()
        let seed = Catalog.seed()
        var newType = seed[0]; newType.id = "new-type"
        let localOld = Product(id: "p-old", deviceTypeId: "cam-indoor", brand: "A", model: "1")
        var older = localOld; older.updatedAt = "2020-01-01T00:00:00.000Z"
        var newer = localOld; newer.updatedAt = "2026-06-01T00:00:00.000Z"
        var future = Product(id: "p-future", deviceTypeId: "cam-indoor", brand: "F", model: "1"); future.updatedAt = "2099-01-01T00:00:00.000Z"
        var localFuture = future; localFuture.updatedAt = "2026-01-01T00:00:00.000Z"
        let added = Product(id: "p-new", deviceTypeId: "cam-indoor", brand: "N", model: "1")
        var localForOlder = localOld; localForOlder.updatedAt = "2026-01-01T00:00:00.000Z"

        let f = file([existing, fresh], catalog: seed + [newType], products: [newer, future, added])
        let now = "2026-11-20T00:00:00.000Z"
        let plan = BackupRestore.plan(f, existingProjectIds: [existing.project.id], catalog: seed,
                                      products: [localForOlder, localFuture], mayImportLibrary: true, now: now)
        XCTAssertEqual(plan.existingJobs.map(\.projectId), [existing.project.id])
        XCTAssertEqual(plan.newJobs.map(\.projectId), [fresh.project.id])
        XCTAssertEqual(plan.newCatalogTypes.map(\.id), ["new-type"])
        XCTAssertEqual(plan.newProducts.map(\.id), ["p-new"])
        // Newer than local and not in the future: replaces. A future date never wins.
        XCTAssertEqual(plan.newerProducts.map(\.id), ["p-old"])

        // A backup older than the local product never replaces it.
        let olderPlan = BackupRestore.plan(file([], products: [older]), existingProjectIds: [], catalog: seed, products: [localForOlder], mayImportLibrary: true, now: now)
        XCTAssertTrue(olderPlan.newerProducts.isEmpty)
        XCTAssertTrue(olderPlan.newProducts.isEmpty)

        var catalog = seed, products = [localForOlder, localFuture]
        BackupRestore.applyLibrary(plan, catalog: &catalog, products: &products, now: now)
        XCTAssertEqual(catalog.count, seed.count + 1)
        XCTAssertEqual(products.first { $0.id == "p-future" }?.updatedAt, localFuture.updatedAt)
        XCTAssertEqual(products.first { $0.id == "p-old" }?.updatedAt, now)
        XCTAssertNotNil(products.first { $0.id == "p-new" })
    }

    func testTechniciansBringInJobsOnly() {
        var newType = Catalog.seed()[0]; newType.id = "new-type"
        let f = file([job()], catalog: [newType], products: [Product(deviceTypeId: "cam-indoor", brand: "B", model: "M")])
        let plan = BackupRestore.plan(f, existingProjectIds: [], catalog: [], products: [], mayImportLibrary: false)
        XCTAssertEqual(plan.jobs.count, 1)
        XCTAssertFalse(plan.includesLibrary)
        XCTAssertTrue(plan.newProducts.isEmpty && plan.newCatalogTypes.isEmpty)
        var catalog: [DeviceType] = [], products: [Product] = []
        BackupRestore.applyLibrary(plan, catalog: &catalog, products: &products)
        XCTAssertTrue(catalog.isEmpty && products.isEmpty)
    }

    func testCopyGetsNewIdsEverywhere() throws {
        var b = job()
        b.salesDocs = []
        let old = b
        let (copy, files) = try BackupRestore.copyWithNewIds(b, keep: ["cam-indoor"])
        XCTAssertNotEqual(copy.project.id, old.project.id)
        XCTAssertTrue(SafeId.isSafe(copy.project.id))
        XCTAssertNotEqual(copy.sheets[0].id, old.sheets[0].id)
        XCTAssertEqual(copy.sheets[0].projectId, copy.project.id)
        XCTAssertNotEqual(copy.sheets[0].imageId, old.sheets[0].imageId)
        XCTAssertEqual(files[old.sheets[0].imageId], copy.sheets[0].imageId)
        XCTAssertNotEqual(copy.markers[0].id, old.markers[0].id)
        XCTAssertEqual(copy.markers[0].projectId, copy.project.id)
        XCTAssertEqual(copy.markers[0].sheetId, copy.sheets[0].id)
        // Catalog references stay.
        XCTAssertEqual(copy.markers[0].deviceTypeId, "cam-indoor")
        XCTAssertEqual(copy.markers[0].label, "C1")
        XCTAssertEqual(copy.project.address, old.project.address)
        XCTAssertEqual(copy.markers[0].x, 0.5)
        XCTAssertEqual(copy.markers[0].tentative, old.markers[0].tentative)
        XCTAssertTrue(copy.unsafeFileIds.isEmpty)
        // Ids passed as `keep` are never renamed, even when a row uses the same value.
        let kept = try BackupRestore.copyWithNewIds(b, keep: [old.sheets[0].id])
        XCTAssertEqual(kept.bundle.sheets[0].id, old.sheets[0].id)
    }
}
