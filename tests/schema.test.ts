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
  return out;
}

const schema = parseTables(sql);
const ts = "2026-11-12T00:00:00.000Z";

// One fully-populated local row per synced table (every optional field set).
const SAMPLES: Record<SyncTable, Record<string, unknown>> = {
  projects: { id: "p", clientName: "c", clientEmail: "e", clientPhone: "t", address: "a", status: "estimate", notes: "n", billduClientId: 1, billduDocs: [], pricing: {}, createdAt: ts, updatedAt: ts, deleted: false },
  sheets: { id: "s", projectId: "p", name: "Attic", pageNumber: 1, order: 0, imageId: "i", imageUrl: "local-only", width: 10, height: 10, pxPerFt: 2, pxPerInch: 72, scaleLabel: "1/4", createdAt: ts, updatedAt: ts, deleted: false },
  deviceTypes: { id: "d", name: "n", category: "security", symbol: "C", abbrev: "CAM", shape: "circle", color: "#000", unit: "each", unitPrice: 1, laborPrice: 1, defaultWire: "Cat6", defaultMount: "ceiling", kind: "device", billduProductId: 1, sort: 0, archived: false, updatedAt: ts, deleted: false },
  markers: { id: "m", projectId: "p", sheetId: "s", deviceTypeId: "d", x: 0.5, y: 0.5, label: "l", room: "r", mount: "ceiling", wireType: "Cat6", closetId: "c", tentative: true, notes: "n", photoId: "ph", createdAt: ts, updatedAt: ts, deleted: false },
  runs: { id: "r", projectId: "p", sheetId: "s", kind: "led", deviceTypeId: "d", points: [0, 0, 1, 1], measuredFt: 1, typedFt: 2, zone: "1", switchLabel: "S1", steps: 3, lfPerStep: 1, wireType: "Cat6", markerId: "m", closetId: "c", tentative: false, notes: "n", createdAt: ts, updatedAt: ts, deleted: false },
  closets: { id: "c", projectId: "p", sheetId: "s", kind: "equipment", x: 0.1, y: 0.1, name: "EQ", notes: "n", createdAt: ts, updatedAt: ts, deleted: false },
  estimateLines: { id: "e", projectId: "p", key: "dev:d", description: "x", qty: 1, unit: "each", unitPrice: 1, removed: false, include: true, sort: 1, updatedAt: ts, deleted: false },
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
