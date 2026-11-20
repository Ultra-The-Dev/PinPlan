import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const downloaded: { blob: Blob; name: string }[] = [];
vi.mock("@/lib/download", async (orig) => ({
  ...(await orig<typeof import("@/lib/download")>()),
  downloadBlob: (blob: Blob, name: string) => downloaded.push({ blob, name }),
}));

import { accountExportEntries, buildZip, crc32, downloadAccountExport, jobFileName, type AccountExportInput } from "@/lib/accountExport";
import { db } from "@/lib/db";
import type { DeviceType, DocPayment, SalesDoc } from "@/lib/types";

/** Minimal zip reader for the tests: walks the central directory and checks every entry's CRC. */
function readZip(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, dec.decode(data));
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

const doc = (id: string, projectId: string, extra: Partial<SalesDoc> = {}) =>
  ({
    id,
    projectId,
    kind: "invoice",
    status: "sent",
    number: `INV-${id}`,
    client: { name: "Client " + id, company: "", email: "" },
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    validUntil: null,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 10,
    total: 110,
    amountPaid: 50,
    balanceDue: 60,
    currency: "USD",
    deleted: false,
    ...extra,
  }) as unknown as SalesDoc;

describe("zip writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes a valid stored archive with UTF-8 names and binary data", () => {
    const bin = new Uint8Array([0, 255, 1, 254, 80, 75, 3, 4]);
    const zip = buildZip([
      { name: "a.txt", data: "hello" },
      { name: "dir/ü.json", data: '{"x":1}' },
      { name: "bin.dat", data: bin },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.txt", "dir/ü.json", "bin.dat"]);
    expect(files.get("a.txt")).toBe("hello");
    expect(files.get("dir/ü.json")).toBe('{"x":1}');
    expect(readZip(buildZip([]))).toEqual(new Map());
  });
});

describe("account export contents", () => {
  const input = (): AccountExportInput => ({
    exportedAt: "2026-11-20T10:00:00.000Z",
    jobs: [
      { backup: { project: { id: "p1aaaaaaaa", address: "12 Main St", clientName: "Acme" }, markers: [], images: [], salesDocs: [doc("d1", "p1aaaaaaaa")], salesPayments: [] } as never, products: [] },
      { backup: { project: { id: "p2bbbbbbbb", address: "12 Main St", clientName: "Other" }, markers: [], images: [], salesDocs: [], salesPayments: [] } as never, products: [] },
    ],
    catalog: [{ id: "cam", name: "Camera", category: "security", unit: "ea", unitPrice: 120, laborPrice: 40, defaultWire: "cat6", sort: 1 } as unknown as DeviceType],
    products: [],
    jobTemplates: [],
    salesDocs: [doc("d1", "p1aaaaaaaa"), doc("d2", ""), doc("d3", "p1aaaaaaaa", { deleted: true })],
    salesPayments: [{ id: "pay1", documentId: "d2", projectId: "", date: "2026-11-05", amount: 50, method: "cash", deleted: false } as unknown as DocPayment],
    settings: null,
    team: { name: "Sparky Co", myRole: "owner", members: [{ name: "Sam", role: "owner", email: null }] },
  });

  it("has one restorable backup per job, every sales document (job-less too), CSVs, catalog and team", () => {
    const entries = accountExportEntries(input());
    const names = entries.map((e) => e.name);
    expect(names).toEqual([
      "README.txt",
      "jobs/12-main-st-p1aaaaaa.pinplan.json",
      "jobs/12-main-st-p2bbbbbb.pinplan.json",
      "sales/documents.json",
      "sales/payments.json",
      "invoices-and-quotes.csv",
      "payments.csv",
      "catalog.csv",
      "products.json",
      "job-templates.json",
      "settings/company-settings.json",
      "settings/team.json",
    ]);
    const files = readZip(buildZip(entries));
    const job = JSON.parse(files.get("jobs/12-main-st-p1aaaaaa.pinplan.json")!);
    expect(job).toMatchObject({ format: "pinplan-backup", version: 1, projects: [{ project: { id: "p1aaaaaaaa" } }] });
    expect(job.catalog).toHaveLength(1);
    const docs = JSON.parse(files.get("sales/documents.json")!);
    expect(docs.map((d: SalesDoc) => d.id)).toEqual(["d1", "d2"]); // deleted ones left out, job-less kept
    const csv = files.get("invoices-and-quotes.csv")!.split("\r\n");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toContain("INV-d1");
    expect(csv[1]).toContain("12 Main St");
    expect(files.get("payments.csv")).toContain("INV-d2");
    expect(files.get("catalog.csv")).toContain("cam,Camera,security");
    expect(JSON.parse(files.get("settings/team.json")!)).toMatchObject({ name: "Sparky Co" });
  });

  it("gives every job a unique file name", () => {
    const used = new Set<string>();
    const a = jobFileName({ id: "same-id-1", address: "", clientName: "" }, used);
    const b = jobFileName({ id: "same-id-1", address: "", clientName: "" }, used);
    expect(a).toBe("jobs/job-same-id-.pinplan.json");
    expect(b).toBe("jobs/job-same-id--2.pinplan.json");
  });
});

describe("download from this device", () => {
  beforeEach(async () => {
    downloaded.length = 0;
    const d = db();
    await Promise.all([d.projects.clear(), d.salesDocs.clear(), d.salesPayments.clear(), d.deviceTypes.clear()]);
  });

  it("reads jobs and sales documents from IndexedDB without writing anything", async () => {
    const d = db();
    await d.projects.bulkPut([
      { id: "job1", address: "1 Elm St", clientName: "A", status: "estimate", deleted: false } as never,
      { id: "gone", address: "Deleted", clientName: "B", status: "estimate", deleted: true } as never,
    ]);
    await d.salesDocs.bulkPut([doc("s1", "job1"), doc("s2", "")]);
    const queued = await d.syncQueue.count();
    const n = await downloadAccountExport(null);
    expect(n).toBe(1);
    expect(await d.syncQueue.count()).toBe(queued);
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0].name).toMatch(/^pinplan-data-\d{4}-\d{2}-\d{2}\.zip$/);
    const files = readZip(new Uint8Array(await downloaded[0].blob.arrayBuffer()));
    expect([...files.keys()].filter((k) => k.startsWith("jobs/"))).toEqual(["jobs/1-elm-st-job1.pinplan.json"]);
    expect(JSON.parse(files.get("sales/documents.json")!).map((x: SalesDoc) => x.id).sort()).toEqual(["s1", "s2"]);
  });
});
