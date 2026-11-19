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
  uploadFails: false,
  upserts: [] as { table: string; ids: string[] }[],
  uploads: [] as string[],
  sheetPathUpdates: [] as string[],
  clock: Date.parse("2026-11-19T10:00:00Z"),
}));

vi.mock("@/lib/supabase", () => {
  const tick = () => new Date((fake.clock += 1000)).toISOString();
  const table = (name: string) => fake.tables.get(name) ?? fake.tables.set(name, new Map()).get(name)!;
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private sorted = false;
    private from = 0;
    private to = Infinity;
    private max = Infinity;
    constructor(private name: string) {}
    select() {
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
    then<T>(ok: (v: { data: Row[]; error: null }) => T) {
      return Promise.resolve({ data: this.rows(), error: null }).then(ok);
    }
  }
  const client = {
    from(name: string) {
      return {
        select: () => new Query(name).select(),
        async upsert(payload: Row[]) {
          const missing = fake.missingColumns.get(name);
          for (const r of payload) for (const k of Object.keys(r)) if (missing?.has(k)) return { error: { code: "PGRST204", message: `Could not find the '${k}' column of '${name}' in the schema cache` }, status: 400 };
          for (const r of payload) {
            const no: Refusal = fake.refuse?.(name, r) ?? null;
            if (no) return { error: { code: no.code, message: no.message }, status: no.status ?? 400 };
          }
          fake.upserts.push({ table: name, ids: payload.map((r) => String(r.id)) });
          const at = tick();
          for (const r of payload) table(name).set(String(r.id), { ...r, synced_at: at });
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
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        async upload(path: string) {
          if (fake.uploadFails) return { error: { message: "storage unavailable" } };
          fake.uploads.push(path);
          return { error: null };
        },
        download: async () => ({ data: null, error: { message: "not found" } }),
      }),
    },
    auth: { signOut: async () => ({ error: null }) },
  };
  return { supabaseConfigured: true, getSupabase: () => client, PLANS_BUCKET: "plans" };
});
vi.mock("@/lib/docSettings", () => ({ pullDocSettings: async () => undefined }));
vi.mock("@/lib/team", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/team")>();
  return { ...mod, loadTeamIfStale: async () => mod.useTeam.getState() };
});

import { db, put, saveImage } from "@/lib/db";
import { __resetSyncForTests, __syncForTests, discardRefused, retryRefused, useSyncStatus } from "@/lib/sync";
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
const remote = (t: string) => fake.tables.get(t) ?? new Map<string, Row>();

beforeEach(async () => {
  fake.tables.clear();
  fake.refuse = null;
  fake.missingColumns.clear();
  fake.uploadFails = false;
  fake.upserts.length = 0;
  fake.uploads.length = 0;
  fake.sheetPathUpdates.length = 0;
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
    fake.refuse = (t) => (t === "markers" ? { code: "P0001", message: "PinPlan subscription inactive" } : null);
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
