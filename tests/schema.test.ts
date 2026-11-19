// Guards the contract between the sync engine and the Supabase schema: every column the app sends must exist,
// every required column must be sent, and every field of the app's row types must be synced (or be local-only).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TABLES, toRemote } from "@/lib/syncMap";
import type { SyncTable } from "@/lib/db";

const dir = path.resolve(__dirname, "../supabase/migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(dir, f), "utf8"))
  .join("\n");

/** column name -> { required } for each `create table public.x (...)`. */
function parseTables(src: string) {
  const out: Record<string, Record<string, { required: boolean }>> = {};
  const re = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const m of src.matchAll(re)) {
    const cols: Record<string, { required: boolean }> = {};
    for (const raw of m[2].split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      const cm = line.match(/^(\w+)\s+(\w+)/);
      if (!cm || /^(primary|unique|check|foreign|constraint)$/i.test(cm[1])) continue;
      const required = /not null/i.test(line) && !/default/i.test(line) && !/primary key/i.test(line);
      cols[cm[1]] = { required };
    }
    out[m[1]] = cols;
  }
  // Columns added later: `alter table public.x add column if not exists col type …`.
  for (const m of src.matchAll(/alter table (?:if exists )?public\.(\w+)\s+([\s\S]*?);/g)) {
    for (const c of m[2].matchAll(/add column (?:if not exists )?(\w+)\s+([^,]+)/g)) {
      (out[m[1]] ??= {})[c[1]] = { required: /not null/i.test(c[2]) && !/default/i.test(c[2]) };
    }
  }
  return out;
}

const schema = parseTables(sql);
const ts = "2026-11-12T00:00:00.000Z";

// One fully-populated local row per synced table (every optional field set).
const SAMPLES: Record<SyncTable, Record<string, unknown>> = {
  projects: { id: "p", clientName: "c", clientEmail: "e", clientPhone: "t", address: "a", status: "estimate", notes: "n", billduClientId: 1, billduDocs: [], pricing: {}, productChoices: { wap: "pr" }, labels: ["Pre-wire"], lat: 40.7, lng: -73.9, createdAt: ts, updatedAt: ts, deleted: false },
  sheets: { id: "s", projectId: "p", name: "Attic", pageNumber: 1, order: 0, imageId: "i", imageUrl: "local-only", width: 10, height: 10, pxPerFt: 2, pxPerInch: 72, scaleLabel: "1/4", createdAt: ts, updatedAt: ts, deleted: false },
  deviceTypes: { id: "d", name: "n", category: "security", symbol: "C", icon: "camera", abbrev: "CAM", shape: "circle", color: "#000", unit: "each", unitPrice: 1, laborPrice: 1, defaultWire: "Cat6", defaultMount: "ceiling", kind: "device", billduProductId: 1, sort: 0, archived: false, updatedAt: ts, deleted: false },
  products: { id: "pr", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", sku: "U7-Pro", unitPrice: 189, laborPrice: 95, notes: "n", archived: false, updatedAt: ts, deleted: false },
  markers: { id: "m", projectId: "p", sheetId: "s", deviceTypeId: "d", x: 0.5, y: 0.5, label: "l", room: "r", mount: "ceiling", wireType: "Cat6", wires: ["HDMI", "Cat6"], productId: "pr", closetId: "c", circuit: "12", tentative: true, notes: "n", photoId: "ph", install: { status: "installed", by: "a", at: ts, photoIds: ["ph"], test: null, history: [] }, createdAt: ts, updatedAt: ts, deleted: false },
  runs: { id: "r", projectId: "p", sheetId: "s", kind: "led", deviceTypeId: "d", points: [0, 0, 1, 1], measuredFt: 1, typedFt: 2, zone: "1", switchLabel: "S1", steps: 3, lfPerStep: 1, wireType: "Cat6", wireTypes: ["HDMI", "Cat6"], markerId: "m", closetId: "c", circuit: { number: "3/5", breakerA: 30, volts: 240, poles: 2, description: "Dryer" }, tentative: false, notes: "n", install: { status: "tested", test: { pass: true, value: "0.4 dB" } }, createdAt: ts, updatedAt: ts, deleted: false },
  closets: { id: "c", projectId: "p", sheetId: "s", kind: "equipment", x: 0.1, y: 0.1, name: "EQ", notes: "n", createdAt: ts, updatedAt: ts, deleted: false },
  photos: { id: "ph", projectId: "p", imageId: "i", width: 4032, height: 3024, takenAt: ts, takenBy: "a@b.c", lat: 40.7, lng: -73.9, caption: "c", tags: ["pre-wire"], annotations: [], markerId: "m", sheetId: "s", room: "Den", beforeId: "ph0", checklistId: "cl", checklistItemId: "it", createdAt: ts, updatedAt: ts, deleted: false },
  photoComments: { id: "pc", projectId: "p", photoId: "ph", author: "a", text: "t", createdAt: ts, updatedAt: ts, deleted: false },
  checklists: { id: "cl", projectId: "p", name: "Pre-wire", items: [], createdAt: ts, updatedAt: ts, deleted: false },
  jobLogs: { id: "jl", projectId: "p", date: "2026-11-19", title: "t", body: "b", author: "a", photoIds: ["ph"], report: { crew: [{ name: "Ana", hours: 8 }] }, createdAt: ts, updatedAt: ts, deleted: false },
  documents: { id: "doc", projectId: "p", name: "permit.pdf", mime: "application/pdf", size: 10, fileId: "f", createdAt: ts, updatedAt: ts, deleted: false },
  estimateLines: { id: "e", projectId: "p", key: "dev:d", description: "x", qty: 1, unit: "each", unitPrice: 1, removed: false, include: true, sort: 1, updatedAt: ts, deleted: false },
  salesDocs: {
    id: "sd", projectId: "p", kind: "invoice", title: "t", number: "INV-1", status: "sent", issueDate: "2026-11-19", dueDate: "2026-12-19", validUntil: "2026-12-19", termsDays: 30,
    client: { name: "c" }, lines: [], discount: { type: "pct", value: 5 }, taxes: [], fees: [], deposit: null, deductions: [], currency: "USD", notes: "n", terms: "t", footer: "f", internalNotes: "i",
    options: {}, subtotal: 1, discountTotal: 0, taxTotal: 0, total: 1, amountPaid: 0, balanceDue: 1, source: "quote", convertedFrom: "q", invoiceType: "deposit", billedPct: 50,
    shareToken: "tok", shareHash: "h", sentAt: ts, viewedAt: ts, respondedAt: ts, signerName: "s", signature: "data:", clientNote: "c", paidAt: "2026-11-20", voidedAt: ts,
    createdAt: ts, updatedAt: ts, deleted: false,
  },
  salesPayments: { id: "sp", projectId: "p", documentId: "sd", amount: 10, date: "2026-11-19", method: "check", reference: "1001", note: "n", voided: false, createdAt: ts, updatedAt: ts, deleted: false },
  jobTemplates: { id: "jt", name: "LV standard", description: "d", trades: ["lowvoltage"], payload: { version: 1, project: {}, checklists: [], estimateLines: [] }, createdBy: "0b6c7f2e-8d1a-4f55-9a2b-1c3d4e5f6a7b", createdAt: ts, updatedAt: ts, deleted: false },
};
const LOCAL_ONLY = new Set(["imageUrl"]);
const SERVER_SET = new Set(["owner_id", "synced_at", "image_path"]);

describe("sync mapping matches the Supabase schema", () => {
  for (const table of Object.keys(TABLES) as SyncTable[]) {
    const spec = TABLES[table];
    it(`${table} → public.${spec.remote}`, () => {
      const cols = schema[spec.remote];
      expect(cols, `table ${spec.remote} missing from migrations`).toBeTruthy();
      const remote = toRemote(table, SAMPLES[table]);
      for (const col of Object.keys(remote)) expect(Object.keys(cols), `${spec.remote}.${col} is sent but not in the schema`).toContain(col);
      for (const [col, meta] of Object.entries(cols)) {
        if (meta.required && !SERVER_SET.has(col)) expect(Object.keys(remote), `${spec.remote}.${col} is required but never sent`).toContain(col);
      }
      for (const key of Object.keys(SAMPLES[table])) {
        if (!LOCAL_ONLY.has(key)) expect(Object.keys(spec.columns), `${table}.${key} is never synced`).toContain(key);
      }
    });
  }

  it("parses the secret store table", () => {
    expect(Object.keys(schema.app_secrets)).toEqual(expect.arrayContaining(["name", "payload", "updated_at"]));
  });
});
