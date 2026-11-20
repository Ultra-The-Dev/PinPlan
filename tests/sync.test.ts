import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A small in-memory stand-in for the Supabase client: enough of PostgREST (upsert, paged select, update) and storage
// for push/pull. `refuse` decides which rows the "database" refuses; a refused row fails its whole upsert, like Postgres.
type Row = Record<string, unknown>;
type Refusal = { code?: string; message: string; status?: number } | null;
const fake = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  refuse: null as null | ((table: string, row: Record<string, unknown>) => { code?: string; message: string; status?: number } | null),
  missingColumns: new Map<string, Set<string>>(),
  missingTables: new Set<string>(),
  uploadFails: false,
  upserts: [] as { table: string; ids: string[] }[],
  uploads: [] as string[],
  sheetPathUpdates: [] as string[],
  clock: Date.parse("2026-11-19T10:00:00Z"),
  /** What each select asked for, by table. */
  selects: [] as { table: string; cols: string }[],
  uploadTypes: new Map<string, string | undefined>(),
  /** Files in storage, by path; a function fails (or hangs) like a bad download. */
  files: new Map<string, Blob | (() => Promise<never>)>(),
  rpc: new Map<string, unknown>(),
  /** Makes rpc calls never answer (a stalled connection). */
  hangRpc: false,
}));

vi.mock("@/lib/supabase", () => {
  const tick = () => new Date((fake.clock += 1000)).toISOString();
  const missingTable = (name: string) => ({ code: "PGRST205", message: `Could not find the table 'public.${name}' in the schema cache` });
  const table = (name: string) => fake.tables.get(name) ?? fake.tables.set(name, new Map()).get(name)!;
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private sorted = false;
    private from = 0;
    private to = Infinity;
    private max = Infinity;
    constructor(private name: string) {}
    select(cols?: string) {
      fake.selects.push({ table: this.name, cols: cols ?? "*" });
      return this;
    }
    gte(col: string, v: string) {
      this.filters.push((r) => Date.parse(String(r[col])) >= Date.parse(v));
      return this;
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v);
      return this;
    }
    order() {
      this.sorted = true;
      return this;
    }
    range(a: number, b: number) {
      this.from = a;
      this.to = b;
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    maybeSingle() {
      return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
    }
    private rows() {
      let rows = [...table(this.name).values()].filter((r) => this.filters.every((f) => f(r)));
      if (this.sorted) rows = rows.sort((a, b) => String(a.synced_at).localeCompare(String(b.synced_at)) || String(a.id).localeCompare(String(b.id)));
      return rows.slice(this.from, Math.min(this.to + 1, this.from + this.max));
    }
    then<T>(ok: (v: { data: Row[] | null; error: { code: string; message: string } | null }) => T) {
      if (fake.missingTables.has(this.name)) return Promise.resolve({ data: null, error: missingTable(this.name) }).then(ok);
      return Promise.resolve({ data: this.rows(), error: null }).then(ok);
    }
  }
  const client = {
    from(name: string) {
      return {
        select: (cols?: string) => new Query(name).select(cols),
        async upsert(payload: Row[], opts?: { onConflict?: string }) {
          if (fake.missingTables.has(name)) return { error: missingTable(name), status: 404 };
          const missing = fake.missingColumns.get(name);
          for (const r of payload) for (const k of Object.keys(r)) if (missing?.has(k)) return { error: { code: "PGRST204", message: `Could not find the '${k}' column of '${name}' in the schema cache` }, status: 400 };
          for (const r of payload) {
            const no: Refusal = fake.refuse?.(name, r) ?? null;
            if (no) return { error: { code: no.code, message: no.message }, status: no.status ?? 400 };
          }
          fake.upserts.push({ table: name, ids: payload.map((r) => String(r.id)) });
          const at = tick();
          // Keyed by the conflict columns, like the table's unique key.
          const keyOf = (r: Row) => (opts?.onConflict ? opts.onConflict.split(",").map((c) => String(r[c])).join("|") : String(r.id));
          for (const r of payload) table(name).set(keyOf(r), { ...r, synced_at: at });
          return { error: null, status: 201 };
        },
        update(patch: Row) {
          return {
            async eq(col: string, v: unknown) {
              if (name === "sheets") fake.sheetPathUpdates.push(String(v));
              for (const r of table(name).values()) if (r[col] === v) Object.assign(r, patch);
              return { error: null };
            },
          };
        },
        insert: async () => ({ error: null }),
      };
    },
    rpc: (fn: string) => (fake.hangRpc ? new Promise(() => undefined) : Promise.resolve({ data: fake.rpc.get(fn) ?? null, error: null })),
    storage: {
      from: () => ({
        async upload(path: string, _blob: Blob, opts?: { contentType?: string }) {
          if (fake.uploadFails) return { error: { message: "storage unavailable" } };
          fake.uploads.push(path);
          fake.uploadTypes.set(path, opts?.contentType);
          return { error: null };
        },
        async download(path: string) {
          const f = fake.files.get(path);
          if (typeof f === "function") return f();
          return f ? { data: f, error: null } : { data: null, error: { message: "not found" } };
        },
      }),
    },
    auth: { signOut: async () => ({ error: null }) },
  };
  return { supabaseConfigured: true, getSupabase: () => client, PLANS_BUCKET: "plans" };
});
vi.mock("@/lib/docSettings", () => ({ pullDocSettings: async () => undefined }));
const pullCompany = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock("@/lib/companySettings", () => ({
  pullCompanySettings: async () => {
    pullCompany.calls += 1;
    if (pullCompany.fail) throw new Error("company_settings unavailable");
  },
}));
vi.mock("@/lib/team", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/team")>();
  return { ...mod, loadTeamIfStale: async () => mod.useTeam.getState() };
});

import { db, noteJobOpened, put, saveImage } from "@/lib/db";
import { __resetSyncForTests, __setSyncTimeLimitForTests, __syncForTests, discardRefused, retryRefused, signOut, useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import type { JobForm, Marker, Project, Sheet } from "@/lib/types";

const ts = "2026-11-19T09:00:00.000Z";
const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const sheet: Sheet = { id: "s1", projectId: "p1", name: "L1", pageNumber: 1, order: 0, imageId: "img-none", width: 100, height: 100, createdAt: ts, updatedAt: ts };
const marker = (id: string, label = id): Marker => ({
  id, projectId: "p1", sheetId: "s1", deviceTypeId: "cam-indoor", x: 0.5, y: 0.5, label, room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts,
});
/** A job another device made, waiting on the server to be pulled. */
const remoteJob = { id: "p-remote", client_name: "Other device", address: "2 Test St", status: "estimate", billdu_docs: [], created_at: ts, updated_at: ts, deleted: false, synced_at: "2026-11-19T09:30:00.000Z" };

const queue = () => db().syncQueue.toArray();

// localStorage for the node test environment (pull watermarks, recently opened jobs, sign-out).
const storage = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = new Proxy(
  {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  },
  {
    ownKeys: () => [...storage.keys()],
    getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && storage.has(k) ? { enumerable: true, configurable: true, value: storage.get(k) } : undefined),
  },
);
const remote = (t: string) => fake.tables.get(t) ?? new Map<string, Row>();

beforeEach(async () => {
  fake.tables.clear();
  fake.refuse = null;
  fake.missingColumns.clear();
  fake.missingTables.clear();
  fake.uploadFails = false;
  fake.upserts.length = 0;
  fake.uploads.length = 0;
  fake.sheetPathUpdates.length = 0;
  fake.selects.length = 0;
  fake.uploadTypes.clear();
  fake.files.clear();
  fake.rpc.clear();
  fake.hangRpc = false;
  storage.clear();
  pullCompany.calls = 0;
  pullCompany.fail = false;
  fake.tables.set("projects", new Map([["p-remote", { ...remoteJob }]]));
  __resetSyncForTests();
  useTeam.setState({ role: null, billing: null, userId: "u1", ready: true });
  useSyncStatus.setState({ error: null, refused: 0, pending: 0 });
  await db().delete();
  await db().open();
  await put("projects", project);
  await put("sheets", sheet);
});

describe("push: one bad row never stops syncing", () => {
  it("sets a refused row aside, sends the rest and still pulls", async () => {
    await put("markers", marker("m1"));
    await put("markers", marker("m-bad"));
    await put("markers", marker("m2"));
    fake.refuse = (t, r) => (t === "markers" && r.id === "m-bad" ? { code: "23514", message: 'new row violates check constraint "markers_x_check"' } : null);

    await __syncForTests("u1");

    expect([...remote("markers").keys()].sort()).toEqual(["m1", "m2"]);
    const refused = await db().syncRefused.toArray();
    expect(refused).toMatchObject([{ id: "markers:m-bad", table: "markers", rowId: "m-bad", code: "23514", projectId: "p1" }]);
    expect(await queue()).toEqual([]);
    // The pull ran: the other device's job is here.
    expect(await db().projects.get("p-remote")).toMatchObject({ clientName: "Other device" });
    expect(useSyncStatus.getState()).toMatchObject({ refused: 1, pending: 0, error: null });
  });

  it("forgets the refusal once the row goes through", async () => {
    await put("markers", marker("m-bad"));
    fake.refuse = (t, r) => (t === "markers" && r.id === "m-bad" ? { code: "22P02", message: "invalid input syntax" } : null);
    await __syncForTests("u1");
    expect(await db().syncRefused.count()).toBe(1);
    fake.refuse = null;
    await put("markers", marker("m-bad", "CAM-9"));
    await __syncForTests("u1");
    expect(await db().syncRefused.count()).toBe(0);
    expect(remote("markers").get("m-bad")).toMatchObject({ label: "CAM-9" });
  });

  it("keeps edits queued and still pulls when the network fails", async () => {
    await put("markers", marker("m1"));
    fake.refuse = (t) => (t === "markers" ? { message: "TypeError: Failed to fetch", status: 0 } : null);
    await __syncForTests("u1");
    expect(await db().projects.get("p-remote")).toBeTruthy();
    expect((await queue()).filter((q) => q.table === "markers")).toHaveLength(1);
    expect(await db().syncRefused.count()).toBe(0);
    expect(useSyncStatus.getState().error).toMatch(/Failed to fetch/);
  });

  it("keeps edits queued (not refused) while the subscription is inactive", async () => {
    await put("markers", marker("m1"));
    fake.refuse = (t) => (t === "markers" ? { code: "P0001", message: "Northpin subscription inactive" } : null);
    await __syncForTests("u1");
    expect(await db().syncRefused.count()).toBe(0);
    expect((await queue()).some((q) => q.table === "markers")).toBe(true);
    expect(useSyncStatus.getState().readOnly).toBe(true);
    expect(await db().projects.get("p-remote")).toBeTruthy();
  });

  it("drops a technician's refused edit and takes the server's copy", async () => {
    useTeam.setState({ role: "tech" });
    const form = { id: "f1", projectId: "p1", templateId: "t", name: "Rough-in", template: { id: "t", name: "Rough-in", category: "inspection", fields: [], version: 1 }, status: "draft", values: { a: 1 }, createdAt: ts, updatedAt: ts } as unknown as JobForm;
    fake.tables.set("job_forms", new Map([["f1", { id: "f1", project_id: "p1", template_id: "t", name: "Rough-in", status: "submitted", values: { a: 2 }, created_at: ts, updated_at: ts, deleted: false, synced_at: "2026-11-19T09:00:00.000Z" }]]));
    await put("forms", form);
    fake.refuse = (t) => (t === "job_forms" ? { code: "42501", message: "new row violates row-level security policy" } : null);
    await __syncForTests("u1");
    expect(await db().forms.get("f1")).toMatchObject({ status: "submitted", values: { a: 2 } });
    expect(await db().syncRefused.count()).toBe(0);
    expect(await queue()).toEqual([]);
  });

  it("never pushes the catalog or products from a technician's device", async () => {
    useTeam.setState({ role: "tech" });
    await put("deviceTypes", { id: "dt1", name: "Camera" } as never);
    await put("products", { id: "pr1", deviceTypeId: "dt1", brand: "B", model: "M" } as never);
    await __syncForTests("u1");
    expect(remote("device_types").size).toBe(0);
    expect(remote("products").size).toBe(0);
    expect((await queue()).filter((q) => q.table === "deviceTypes" || q.table === "products")).toEqual([]);
  });
});

describe("images", () => {
  it("a failed upload stays queued without stopping the rows", async () => {
    const imageId = await saveImage(new Blob(["x"], { type: "image/png" }), 10, 10);
    await put("sheets", { ...sheet, imageId });
    await put("markers", marker("m1"));
    fake.uploadFails = true;
    await __syncForTests("u1");
    expect(remote("markers").has("m1")).toBe(true);
    expect((await queue()).filter((q) => q.table === "images")).toHaveLength(1);
    expect(useSyncStatus.getState().error).toBeNull();
  });

  it("only sheet images patch sheets.image_path", async () => {
    const plan = await saveImage(new Blob(["p"], { type: "image/png" }), 10, 10);
    const photo = await saveImage(new Blob(["q"], { type: "image/jpeg" }), 10, 10);
    await put("sheets", { ...sheet, imageId: plan });
    await put("photos", { id: "ph1", projectId: "p1", imageId: photo, width: 10, height: 10, takenAt: ts, createdAt: ts, updatedAt: ts } as never);
    await __syncForTests("u1");
    expect(fake.uploads.sort()).toEqual([`p1/${plan}`, `p1/${photo}`].sort());
    expect(fake.sheetPathUpdates).toEqual([plan]);
    expect((await queue()).filter((q) => q.table === "images")).toEqual([]);
  });
});

describe("column gaps", () => {
  it("keeps the rows queued, tagged, until the column exists, and the warning visible", async () => {
    fake.missingColumns.set("projects", new Set(["labels"]));
    await put("projects", { ...project, labels: ["urgent"] });
    await __syncForTests("u1");
    expect(remote("projects").get("p1")).not.toHaveProperty("labels");
    const q = (await queue()).filter((x) => x.table === "projects");
    expect(q).toMatchObject([{ rowId: "p1", retryWhenColumn: "projects.labels" }]);
    expect(useSyncStatus.getState().error).toMatch(/projects\.labels/);

    // A background sync doesn't resend it while the column is still missing; the warning stays.
    const before = fake.upserts.filter((u) => u.table === "projects").length;
    await __syncForTests("u1", null, false);
    expect(fake.upserts.filter((u) => u.table === "projects").length).toBe(before);
    expect(useSyncStatus.getState().error).toMatch(/projects\.labels/);

    // The migration is run: "Sync now" sends the column and the warning goes.
    fake.missingColumns.clear();
    await __syncForTests("u1");
    expect(remote("projects").get("p1")).toMatchObject({ labels: ["urgent"] });
    expect((await queue()).filter((x) => x.table === "projects")).toEqual([]);
    expect(useSyncStatus.getState().error).toBeNull();
  });
});

describe("refused changes", () => {
  it("Discard puts the cloud copy back (or removes a row the cloud never had)", async () => {
    await put("markers", marker("m-new"));
    await put("markers", marker("m-old", "LOCAL"));
    fake.tables.set("markers", new Map([["m-old", { id: "m-old", project_id: "p1", sheet_id: "s1", device_type_id: "cam-indoor", x: 0.5, y: 0.5, label: "CLOUD", created_at: ts, updated_at: ts, deleted: false, synced_at: "2026-11-19T08:00:00.000Z" }]]));
    fake.refuse = (t) => (t === "markers" ? { code: "23503", message: "foreign key violation" } : null);
    await __syncForTests("u1");
    expect(useSyncStatus.getState().refused).toBe(2);
    await discardRefused();
    expect(await db().markers.get("m-new")).toBeUndefined();
    expect(await db().markers.get("m-old")).toMatchObject({ label: "CLOUD" });
    expect(useSyncStatus.getState().refused).toBe(0);
  });

  it("Try again queues them and syncs", async () => {
    await put("markers", marker("m1"));
    fake.refuse = (t) => (t === "markers" ? { code: "42501", message: "permission denied" } : null);
    await __syncForTests("u1");
    expect(await db().syncRefused.count()).toBe(1);
    fake.refuse = null;
    await retryRefused();
    expect(remote("markers").has("m1")).toBe(true);
    expect(await db().syncRefused.count()).toBe(0);
  });
});

describe("company settings", () => {
  it("every sync brings the company's details in step, for technicians too", async () => {
    await __syncForTests("u1");
    expect(pullCompany.calls).toBe(1);
    useTeam.setState({ role: "tech" });
    await __syncForTests("u1");
    expect(pullCompany.calls).toBe(2);
  });

  it("a failure there never fails the sync", async () => {
    pullCompany.fail = true;
    await put("markers", marker("m1"));
    await __syncForTests("u1");
    expect(remote("markers").has("m1")).toBe(true);
    expect(useSyncStatus.getState().error).toBeNull();
  });
});

// ---------------- prices (20261125000100_price_split_stale_writes.sql) ----------------

const camera = { id: "dt1", name: "Camera", category: "security", symbol: "C", abbrev: "CAM", shape: "circle", color: "#000000", unit: "each", unitPrice: 250, laborPrice: 80, defaultWire: "Cat6", defaultMount: "ceiling", kind: "device", sort: 1, updatedAt: ts };
const remoteCamera = (owner: string, extra: Row = {}) => ({ owner_id: owner, id: "dt1", name: "Camera", category: "security", symbol: "C", abbrev: "CAM", shape: "circle", color: "#000000", unit: "each", unit_price: 0, labor_price: 0, default_wire: "Cat6", default_mount: "ceiling", kind: "device", sort_order: 1, updated_at: ts, deleted: false, synced_at: "2026-11-19T09:30:00.000Z", ...extra });
const priceTables = ["device_type_prices", "product_prices", "project_finance", "job_template_pricing"];

describe("prices: office only, never select *", () => {
  it("never selects '*' on any table, and never the price columns of the catalog, products and jobs", async () => {
    await __syncForTests("u1");
    expect(fake.selects.length).toBeGreaterThan(0);
    for (const s of fake.selects) expect(s.cols, s.table).not.toBe("*");
    for (const s of fake.selects.filter((x) => ["device_types", "products", "projects"].includes(x.table))) {
      expect(s.cols.split(","), s.table).not.toContain("unit_price");
      expect(s.cols.split(","), s.table).not.toContain("labor_price");
      expect(s.cols.split(","), s.table).not.toContain("pricing");
      expect(s.cols.split(","), s.table).not.toContain("billdu_docs");
    }
    // The office does read the price tables.
    expect(fake.selects.map((s) => s.table)).toEqual(expect.arrayContaining(priceTables));
  });

  it("the office pushes prices to the price tables (and the old columns, for older builds)", async () => {
    await put("deviceTypes", camera as never);
    await put("projects", { ...project, pricing: { markupPct: 30 }, billduClientId: 7 });
    await __syncForTests("u1");
    expect(remote("device_type_prices").get("undefined|dt1")).toMatchObject({ device_type_id: "dt1", unit_price: 250, labor_price: 80 });
    expect(remote("device_types").get("undefined|dt1")).toMatchObject({ unit_price: 250 });
    expect(remote("project_finance").get("p1")).toMatchObject({ project_id: "p1", pricing: { markupPct: 30 }, billdu_client_id: 7 });
  });

  it("a technician's device never pulls or pushes prices", async () => {
    useTeam.setState({ role: "tech" });
    await put("projects", { ...project, pricing: { markupPct: 0 }, billduClientId: 9, notes: "gate code" });
    await __syncForTests("u1");
    const sent = remote("projects").get("p1")!;
    expect(sent).toMatchObject({ notes: "gate code" });
    expect(sent).not.toHaveProperty("pricing");
    expect(sent).not.toHaveProperty("billdu_client_id");
    expect(sent).not.toHaveProperty("billdu_docs");
    for (const t of priceTables) {
      expect(fake.selects.some((s) => s.table === t), t).toBe(false);
      expect(remote(t).size, t).toBe(0);
    }
  });

  it("pulled prices land on the company's catalog rows; another owner's rows are ignored", async () => {
    fake.rpc.set("my_billing_owner", "boss");
    fake.tables.set("device_types", new Map([["boss|dt1", remoteCamera("boss")], ["admin|dt2", remoteCamera("admin", { id: "dt2", name: "Admin's own" })]]));
    fake.tables.set("device_type_prices", new Map([
      ["boss|dt1", { owner_id: "boss", device_type_id: "dt1", unit_price: 300, labor_price: 90, billdu_product_id: 12, updated_at: ts, synced_at: "2026-11-19T09:30:00.000Z" }],
      ["admin|dt2", { owner_id: "admin", device_type_id: "dt2", unit_price: 1, labor_price: 1, updated_at: ts, synced_at: "2026-11-19T09:30:00.000Z" }],
    ]));
    fake.tables.set("project_finance", new Map([["p-remote", { project_id: "p-remote", pricing: { markupPct: 25 }, billdu_docs: [{ id: 1 }], billdu_client_id: 4, updated_at: ts, synced_at: "2026-11-19T09:30:00.000Z" }]]));
    await __syncForTests("u1");
    expect(await db().deviceTypes.get("dt1")).toMatchObject({ name: "Camera", ownerId: "boss", unitPrice: 300, laborPrice: 90, billduProductId: 12 });
    expect(await db().deviceTypes.get("dt2")).toBeUndefined();
    expect(await db().projects.get("p-remote")).toMatchObject({ clientName: "Other device", pricing: { markupPct: 25 }, billduClientId: 4 });
  });

  it("while the company owner can't be told, the catalog waits for the next sync instead of being skipped", async () => {
    // my_billing_owner gives nothing and the team isn't loaded for this user yet.
    useTeam.setState({ userId: null, team: null });
    // A later row (another owner's) would carry the watermark well past the company's row.
    fake.tables.set("device_types", new Map([["boss|dt1", remoteCamera("boss")], ["admin|dt2", remoteCamera("admin", { id: "dt2", synced_at: "2026-11-19T12:00:00.000Z" })]]));
    await __syncForTests("u1");
    expect(await db().deviceTypes.get("dt1")).toBeUndefined();
    fake.rpc.set("my_billing_owner", "boss");
    await __syncForTests("u1");
    expect(await db().deviceTypes.get("dt1")).toMatchObject({ name: "Camera", ownerId: "boss" });
  });

  it("a pulled catalog row (prices stored blank) keeps this device's prices", async () => {
    fake.rpc.set("my_billing_owner", "u1");
    await db().deviceTypes.put({ ...camera, unitPrice: 199 } as never);
    fake.tables.set("device_types", new Map([["u1|dt1", remoteCamera("u1", { name: "Camera (renamed)", updated_at: "2026-11-19T09:10:00.000Z" })]]));
    await __syncForTests("u1");
    expect(await db().deviceTypes.get("dt1")).toMatchObject({ name: "Camera (renamed)", unitPrice: 199, laborPrice: 80 });
  });

  it("a local price edit waiting to go up isn't overwritten by the server's price", async () => {
    fake.rpc.set("my_billing_owner", "u1");
    await put("deviceTypes", { ...camera, unitPrice: 500 } as never);
    // The push fails (offline), so the edit stays queued; the pull still runs.
    fake.refuse = (t) => (t === "device_types" ? { message: "TypeError: Failed to fetch", status: 0 } : null);
    fake.tables.set("device_type_prices", new Map([["u1|dt1", { owner_id: "u1", device_type_id: "dt1", unit_price: 1, labor_price: 1, updated_at: "2026-11-19T11:00:00.000Z", synced_at: "2026-11-19T09:30:00.000Z" }]]));
    await __syncForTests("u1");
    expect(await db().deviceTypes.get("dt1")).toMatchObject({ unitPrice: 500 });
  });

  it("a cloud database without the price tables yet keeps syncing (old columns carry the prices)", async () => {
    for (const t of priceTables) fake.missingTables.add(t);
    await put("deviceTypes", camera as never);
    await __syncForTests("u1");
    expect(remote("device_types").get("undefined|dt1")).toMatchObject({ unit_price: 250 });
    expect((await queue()).filter((q) => q.table === "deviceTypes")).toEqual([]);
    expect(useSyncStatus.getState().lastSyncAt).toBeTruthy();
  });
});

describe("files", () => {
  it("uploads only safe types with their content type; SVG and HTML go up as plain downloads", async () => {
    const svg = await saveImage(new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), 0, 0);
    const html = await saveImage(new Blob(["<script>"], { type: "text/html" }), 0, 0);
    const pdf = await saveImage(new Blob(["%PDF"], { type: "application/pdf" }), 0, 0);
    for (const [id, fileId, mime] of [["d1", svg, "image/svg+xml"], ["d2", html, "text/html"], ["d3", pdf, "application/pdf"]])
      await put("documents", { id, projectId: "p1", name: id, mime, size: 1, fileId, createdAt: ts, updatedAt: ts } as never);
    await __syncForTests("u1");
    expect(fake.uploadTypes.get(`p1/${svg}`)).toBe("application/octet-stream");
    expect(fake.uploadTypes.get(`p1/${html}`)).toBe("application/octet-stream");
    expect(fake.uploadTypes.get(`p1/${pdf}`)).toBe("application/pdf");
  });

  const remotePhoto = (id: string, projectId: string, imageId: string) => ({ id, project_id: projectId, image_id: imageId, width: 1, height: 1, taken_at: ts, created_at: ts, updated_at: ts, deleted: false, synced_at: "2026-11-19T09:30:00.000Z" });

  it("downloads files only for recently opened jobs (plus each job's cover plan)", async () => {
    noteJobOpened("p1");
    fake.tables.set("photos", new Map([["ph1", remotePhoto("ph1", "p1", "i1")], ["ph2", remotePhoto("ph2", "p-remote", "i2")]]));
    fake.tables.set("sheets", new Map([["s-remote", { id: "s-remote", project_id: "p-remote", name: "L1", page_number: 1, sort_order: 0, image_id: "plan-r", image_path: "p-remote/plan-r", width: 1, height: 1, created_at: ts, updated_at: ts, deleted: false, synced_at: "2026-11-19T09:30:00.000Z" }]]));
    for (const path of ["p1/i1", "p-remote/i2", "p-remote/plan-r"]) fake.files.set(path, new Blob(["x"], { type: "image/jpeg" }));
    await __syncForTests("u1");
    expect(await db().images.get("i1")).toBeTruthy();
    expect(await db().images.get("plan-r")).toBeTruthy(); // the job list's cover
    expect(await db().images.get("i2")).toBeUndefined(); // a job never opened here
  });

  it("one failing download doesn't stop the others or the sync", async () => {
    noteJobOpened("p1");
    fake.tables.set("photos", new Map([["ph1", remotePhoto("ph1", "p1", "i1")], ["ph3", remotePhoto("ph3", "p1", "i3")]]));
    fake.files.set("p1/i1", () => Promise.reject(new TypeError("Failed to fetch")));
    fake.files.set("p1/i3", new Blob(["x"], { type: "image/jpeg" }));
    await __syncForTests("u1");
    expect(await db().images.get("i3")).toBeTruthy();
    expect(useSyncStatus.getState().error).toBeNull();
    expect(useSyncStatus.getState().lastSyncAt).toBeTruthy();
  });

  it("a full device stops downloading and says so, without failing the sync", async () => {
    noteJobOpened("p1");
    fake.tables.set("photos", new Map([["ph1", remotePhoto("ph1", "p1", "i1")], ["ph3", remotePhoto("ph3", "p1", "i3")]]));
    fake.files.set("p1/i1", new Blob(["x"], { type: "image/jpeg" }));
    fake.files.set("p1/i3", new Blob(["y"], { type: "image/jpeg" }));
    const spy = vi.spyOn(db().images, "put").mockImplementation(() => Promise.reject(Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" })) as never);
    await put("markers", marker("m1"));
    await __syncForTests("u1");
    expect(spy).toHaveBeenCalledTimes(1); // stopped after the first
    spy.mockRestore();
    expect(remote("markers").has("m1")).toBe(true);
    expect(useSyncStatus.getState().error).toMatch(/storage is full/i);
  });
});

describe("running syncs", () => {
  it("“Sync now” during a sync runs again afterwards instead of being dropped", async () => {
    await Promise.all([__syncForTests("u1"), __syncForTests("u1")]);
    expect(pullCompany.calls).toBe(2);
  });

  it("a sync that hangs gives up after the time limit and the next one runs", async () => {
    __setSyncTimeLimitForTests(50);
    fake.hangRpc = true;
    await __syncForTests("u1");
    expect(useSyncStatus.getState().error).toMatch(/took longer/);
    fake.hangRpc = false;
    await put("markers", marker("m9"));
    await __syncForTests("u1");
    expect(remote("markers").has("m9")).toBe(true);
  });
});

describe("sign out", () => {
  const win = globalThis as { window?: unknown };
  it("keeps the jobs when changes wait to sync, and always forgets the per-user keys (not the team cache)", async () => {
    storage.set("pinplan.pendingInvite", "{}");
    storage.set("pinplan.recentJobs", "{}");
    storage.set("pinplan.team", "{}");
    win.window = { location: { reload: vi.fn() } };
    try {
      await signOut();
      expect(await db().projects.get("p1")).toBeTruthy(); // p1 is still queued
      expect(storage.has("pinplan.pendingInvite")).toBe(false);
      expect(storage.has("pinplan.recentJobs")).toBe(false);
      expect(storage.get("pinplan.team")).toBe("{}");
    } finally {
      delete win.window;
    }
  });

  it("removes the jobs by default when everything is synced", async () => {
    await __syncForTests("u1");
    expect(await queue()).toEqual([]);
    const reload = vi.fn();
    win.window = { location: { reload } };
    try {
      await signOut();
      expect(reload).toHaveBeenCalled();
      await db().open();
      expect(await db().projects.count()).toBe(0);
    } finally {
      delete win.window;
    }
  });
});
