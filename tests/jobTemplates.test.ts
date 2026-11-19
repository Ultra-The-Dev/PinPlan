import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBundle } from "@/lib/db";
import {
  applyTemplate,
  applyTemplateParts,
  captureTemplate,
  chunked,
  DUPLICATE_CHUNK,
  duplicateImageIds,
  duplicateJob,
  estimateKeyRef,
  parseTemplatesFile,
  registerTemplatePart,
  templateParts,
  templatesFile,
  templateSummary,
  unregisterTemplatePart,
  validateTemplate,
  withoutPrices,
  type TemplateApplyContext,
} from "@/lib/jobTemplates";
import { computeTakeoff } from "@/lib/takeoff";
import { TABLES, toLocal, toRemote } from "@/lib/syncMap";
import type { Checklist, EstimateLine, Project } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const ts = "2026-11-11T00:00:00.000Z";
const NOW = "2026-11-19T12:00:00.000Z";

function idGen(prefix = "n") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "sample-job",
    clientName: "Jane Client",
    clientEmail: "jane@example.com",
    clientPhone: "555-0100",
    address: "12 Maple Ridge Rd",
    status: "approved",
    notes: "Gate code 1234",
    billduClientId: 77,
    billduDocs: [{ id: 1, type: "invoice", amount: 1000, createdAt: ts }],
    pricing: { markupPct: 30, wirePrices: { Cat6: 0.5 } },
    labels: ["Pre-wire", "Model home"],
    productChoices: { wap: "prod-u7", "wire:Cat6": "prod-cat6" },
    lat: 40.7,
    lng: -73.9,
    createdAt: ts,
    updatedAt: ts,
    ...over,
  };
}

const checklist: Checklist = {
  id: "cl1",
  projectId: "sample-job",
  name: "Pre-wire",
  items: [
    { id: "i1", text: "Label every cable", done: true, doneBy: "Sam", doneAt: ts, note: "done", assignee: "Sam", due: "2026-11-20", photoId: "ph1", commentId: "c1" },
    { id: "i2", text: "Photo of the rack", requiresPhoto: true, done: false },
  ],
  createdAt: ts,
  updatedAt: ts,
};

const lines: EstimateLine[] = [
  { id: "e1", projectId: "sample-job", key: "custom:permit", description: "Permit fee", qty: 1, unit: "each", unitPrice: 250, sort: 1, updatedAt: ts },
  { id: "e2", projectId: "sample-job", key: "dev:wap", unitPrice: 199, qty: 7, updatedAt: ts },
  { id: "e3", projectId: "sample-job", key: "dev:cam-indoor", qty: 4, updatedAt: ts }, // qty only: depends on the devices, dropped
  { id: "e4", projectId: "sample-job", key: "custom:old", description: "Removed line", removed: true, updatedAt: ts },
  { id: "e5", projectId: "sample-job", key: "custom:gone", description: "Deleted", deleted: true, updatedAt: ts },
  { id: "e6", projectId: "sample-job", key: "dev:retired-type", description: "Retired thing", unitPrice: 5, updatedAt: ts },
];

/** The sample job as a full bundle, with a closet-linked device, home runs, photos and deleted rows. */
function sampleBundle(): ProjectBundle {
  const s = buildSampleJob();
  const markers = [...s.markers];
  markers[0] = { ...markers[0], closetId: "closet-av", photoId: "ph-dev" };
  markers.push({ ...markers[1], id: "dead-marker", deleted: true });
  const runs = [
    ...s.runs,
    { id: "home-1", projectId: "sample-job", sheetId: markers[0].sheetId, kind: "wire" as const, points: [0, 0, 1, 1], wireType: "Cat6", markerId: markers[0].id, closetId: "closet-av", createdAt: ts, updatedAt: ts },
    { id: "home-dead", projectId: "sample-job", sheetId: "sheet-0", kind: "wire" as const, points: [0, 0, 1, 1], markerId: "dead-marker", closetId: "closet-av", createdAt: ts, updatedAt: ts, deleted: true },
  ];
  const sheets = [...s.sheets, { ...s.sheets[0], id: "dead-sheet", name: "Old", deleted: true }];
  const closets = [...s.closets, { ...s.closets[0], id: "dead-closet", deleted: true }];
  return {
    project: project(),
    sheets,
    markers,
    runs,
    closets,
    estimateLines: lines,
    photos: [{ id: "ph1", projectId: "sample-job", imageId: "pimg", width: 1, height: 1, takenAt: ts, createdAt: ts, updatedAt: ts }],
    photoComments: [],
    checklists: [checklist, { ...checklist, id: "cl-dead", name: "Deleted", deleted: true }],
    jobLogs: [{ id: "log1", projectId: "sample-job", date: "2026-11-19", body: "Pulled wire", createdAt: ts, updatedAt: ts }],
    documents: [],
  };
}

describe("captureTemplate", () => {
  it("strips the client, ids, ticks, dates and photos", () => {
    const t = captureTemplate(sampleBundle(), { name: " LV standard ", includePrices: true, trades: ["lowvoltage"] }, { id: "t1", now: NOW });
    const json = JSON.stringify(t);
    for (const leak of ["Jane Client", "jane@example.com", "555-0100", "12 Maple Ridge", "Gate code", "billdu", "40.7", "sample-job", "cl1", "\"i1\"", "doneBy", "doneAt", "2026-11-20", "ph1", "\"done\""])
      expect(json, leak).not.toContain(leak);
    expect(t).toMatchObject({ id: "t1", name: "LV standard", trades: ["lowvoltage"], createdAt: NOW, updatedAt: NOW });
    expect(t.payload.version).toBe(1);
    expect(t.payload.project).toEqual({
      pricing: { markupPct: 30, wirePrices: { Cat6: 0.5 } },
      productChoices: { wap: "prod-u7", "wire:Cat6": "prod-cat6" },
      labels: ["Pre-wire", "Model home"],
      trades: ["lowvoltage"],
    });
    expect(t.payload.checklists).toEqual([{ name: "Pre-wire", items: [{ text: "Label every cable", assignee: "Sam" }, { text: "Photo of the rack", requiresPhoto: true }] }]);
    // Custom line kept whole; the dev price override kept without its qty; qty-only, removed and deleted lines dropped.
    expect(t.payload.estimateLines).toEqual([
      { key: "custom:permit", description: "Permit fee", qty: 1, unit: "each", unitPrice: 250, sort: 1 },
      { key: "dev:wap", unitPrice: 199 },
      { key: "dev:retired-type", description: "Retired thing", unitPrice: 5 },
    ]);
  });

  it("leaves every price out when includePrices is false", () => {
    const t = captureTemplate(sampleBundle(), { name: "No prices", includePrices: false }, { id: "t2", now: NOW });
    expect(t.payload.project.pricing).toBeUndefined();
    expect(JSON.stringify(t)).not.toContain("unitPrice");
    expect(JSON.stringify(t)).not.toContain("markupPct");
    // A price-only override has nothing left; the custom line keeps its wording.
    expect(t.payload.estimateLines.map((l) => l.key)).toEqual(["custom:permit", "dev:retired-type"]);
  });

  it("can leave checklists, estimate lines out and keep notes", () => {
    const t = captureTemplate(sampleBundle(), { name: "x", includePrices: true, includeChecklists: false, includeEstimate: false, includeNotes: true }, { id: "t", now: NOW });
    expect(t.payload.checklists).toEqual([]);
    expect(t.payload.estimateLines).toEqual([]);
    expect(t.payload.project.notes).toBe("Gate code 1234");
  });
});

describe("applyTemplate", () => {
  const template = captureTemplate(sampleBundle(), { name: "LV", includePrices: true }, { id: "t", now: NOW });
  const fresh = project({ id: "new-job", clientName: "Bob", address: "1 Elm", pricing: undefined, labels: ["Service"], productChoices: null, notes: "" });

  it("makes fresh ids and unticked checklists", () => {
    const r = applyTemplate(template, fresh, NOW, idGen("x"));
    expect(r.checklists).toHaveLength(1);
    const c = r.checklists[0];
    expect(c.projectId).toBe("new-job");
    expect(c.id).toMatch(/^x\d+$/);
    expect(c.items.every((i) => i.done === false && !i.doneBy && !i.doneAt && !i.photoId && !i.due)).toBe(true);
    expect(c.items[1].requiresPhoto).toBe(true);
    const ids = [c.id, ...c.items.map((i) => i.id), ...r.estimateLines.map((l) => l.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.estimateLines.every((l) => l.projectId === "new-job" && l.id.startsWith("x"))).toBe(true);
    // Custom lines get a new key per job; computed keys stay.
    expect(r.estimateLines.find((l) => l.description === "Permit fee")!.key).toMatch(/^custom:x\d+$/);
    expect(r.estimateLines.some((l) => l.key === "dev:wap" && l.unitPrice === 199)).toBe(true);
    expect(r.project).toMatchObject({ pricing: { markupPct: 30 }, productChoices: { wap: "prod-u7" }, labels: ["Service", "Pre-wire", "Model home"] });
  });

  it("skips missing device types and products with warnings", () => {
    const r = applyTemplate(template, fresh, NOW, idGen(), { deviceTypeIds: new Set(["wap", "cam-indoor"]), productIds: new Set(["prod-cat6"]) });
    expect(r.estimateLines.some((l) => l.key === "dev:retired-type")).toBe(false);
    expect(r.project.productChoices).toEqual({ "wire:Cat6": "prod-cat6" });
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/Retired thing/);
    expect(r.warnings.join(" ")).toMatch(/product/);
  });

  it("never gives a technician prices or estimate lines", () => {
    const r = applyTemplate(template, fresh, NOW, idGen(), { includePrices: false });
    expect(r.project.pricing).toBeUndefined();
    expect(r.estimateLines).toEqual([]);
    expect(r.checklists).toHaveLength(1);
    expect(JSON.stringify(withoutPrices(template))).not.toMatch(/unitPrice|markupPct/);
  });

  it("writes everything through applyTemplateParts", async () => {
    const written: Record<string, { id: string }[]> = {};
    let patch: Partial<Project> = {};
    const ctx: TemplateApplyContext = {
      project: fresh,
      now: NOW,
      newId: idGen(),
      includePrices: true,
      warnings: [],
      write: async (table, rows) => void (written[table] = [...(written[table] ?? []), ...rows]),
    };
    const warnings = await applyTemplateParts(template, ctx, async (p) => void (patch = p));
    expect(warnings).toEqual([]);
    expect(written.checklists).toHaveLength(1);
    expect(written.estimateLines).toHaveLength(3);
    expect(patch.productChoices).toEqual({ wap: "prod-u7", "wire:Cat6": "prod-cat6" });
    expect(templateSummary(template)).toBe("1 checklist · 3 estimate lines · 2 product choices · 2 labels · pricing");
  });
});

describe("duplicateJob", () => {
  const bundle = sampleBundle();
  const out = duplicateJob(bundle, { address: "Lot 12", clientName: "Builder Co", includeChecklists: "reset", includeEstimate: true }, idGen("d"), NOW);

  it("remaps every reference and leaves nothing dangling", () => {
    const sheetIds = new Set(out.sheets.map((s) => s.id));
    const markerIds = new Set(out.markers.map((m) => m.id));
    const closetIds = new Set(out.closets.map((c) => c.id));
    const old = new Set([...bundle.sheets, ...bundle.markers, ...bundle.runs, ...bundle.closets].map((x) => x.id));
    for (const m of out.markers) {
      expect(sheetIds.has(m.sheetId)).toBe(true);
      if (m.closetId) expect(closetIds.has(m.closetId)).toBe(true);
      expect(m.photoId).toBeNull();
    }
    for (const r of out.runs) {
      expect(sheetIds.has(r.sheetId)).toBe(true);
      if (r.markerId) expect(markerIds.has(r.markerId)).toBe(true);
      if (r.closetId) expect(closetIds.has(r.closetId)).toBe(true);
    }
    for (const c of out.closets) expect(sheetIds.has(c.sheetId)).toBe(true);
    for (const row of [...out.sheets, ...out.markers, ...out.runs, ...out.closets, ...out.estimateLines, ...out.checklists]) {
      expect(old.has(row.id)).toBe(false);
      expect(row.projectId).toBe(out.project.id);
    }
    const home = out.runs.find((r) => r.kind === "wire")!;
    expect(home.markerId).toBe(out.markers[0].id);
    expect(home.closetId).toBe(out.closets[0].id);
    expect(out.markers[0].closetId).toBe(out.closets[0].id);
    const all = [out.project.id, ...[...out.sheets, ...out.markers, ...out.runs, ...out.closets, ...out.estimateLines, ...out.checklists].map((x) => x.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("skips deleted rows and never copies photos, logs or billing", () => {
    const ids = JSON.stringify(out);
    expect(out.sheets.some((s) => s.name === "Old")).toBe(false);
    expect(out.sheets).toHaveLength(4);
    expect(out.markers).toHaveLength(bundle.markers.length - 1);
    expect(out.runs).toHaveLength(bundle.runs.length - 1);
    expect(out.closets).toHaveLength(1);
    expect(out.checklists).toHaveLength(1);
    expect(out.estimateLines).toHaveLength(lines.filter((l) => !l.deleted).length);
    expect(out).not.toHaveProperty("photos");
    expect(out).not.toHaveProperty("jobLogs");
    expect(ids).not.toContain("Pulled wire");
    expect(out.project).toMatchObject({ address: "Lot 12", clientName: "Builder Co", status: "estimate", billduDocs: [], labels: ["Pre-wire", "Model home"] });
    expect(out.project.billduClientId).toBeUndefined();
    expect(out.project.lat).toBeUndefined();
  });

  it("keeps labels, calibration and estimate keys; resets checklists", () => {
    expect(out.markers.map((m) => m.label)).toEqual(bundle.markers.filter((m) => !m.deleted).map((m) => m.label));
    expect(out.sheets.every((s) => s.pxPerFt === 12)).toBe(true);
    expect(out.estimateLines.map((l) => l.key).sort()).toEqual(lines.filter((l) => !l.deleted).map((l) => l.key).sort());
    const items = out.checklists[0].items;
    expect(items.every((i) => i.done === false && !i.doneBy && !i.photoId && !i.due && !i.note)).toBe(true);
    expect(items[0].assignee).toBe("Sam");
  });

  it("gives the same takeoff as the original", () => {
    const strip = (t: ReturnType<typeof computeTakeoff>) => JSON.parse(JSON.stringify(t, (k, v) => (k === "sheetId" ? undefined : v)));
    expect(strip(computeTakeoff(out))).toEqual(strip(computeTakeoff(bundle)));
    expect(computeTakeoff(out).floors.map((f) => f.sheetId)).toEqual(out.sheets.map((s) => s.id));
  });

  it("uses copied plan images and honours the skip options", () => {
    expect(duplicateImageIds(bundle)).toEqual(["img"]);
    const o = duplicateJob(bundle, { includeChecklists: "skip", includeEstimate: false, includeCounts: false, imageMap: { img: "img-copy" } }, idGen(), NOW);
    expect(o.sheets.every((s) => s.imageId === "img-copy")).toBe(true);
    expect(o.markers).toEqual([]);
    expect(o.runs).toEqual([]);
    expect(o.checklists).toEqual([]);
    expect(o.estimateLines).toEqual([]);
    expect(o.project.clientName).toBe("Jane Client");
  });

  it("writes big jobs in chunks of 200", () => {
    const rows = Array.from({ length: 512 }, (_, i) => ({ id: String(i) }));
    expect(chunked(rows).map((c) => c.length)).toEqual([200, 200, 112]);
    expect(DUPLICATE_CHUNK).toBe(200);
  });
});

describe("template parts registry", () => {
  afterEach(() => unregisterTemplatePart("forms"));

  it("has the built-ins and can't lose them", () => {
    expect(templateParts().map((p) => p.key)).toEqual(["checklists", "estimate"]);
    unregisterTemplatePart("checklists");
    registerTemplatePart({ key: "estimate", capture: () => "hijack", apply: async () => {} });
    expect(templateParts().map((p) => p.key)).toEqual(["checklists", "estimate"]);
    expect(templateParts()[1].label).toBe("Estimate lines");
  });

  it("round-trips an extension part", async () => {
    const applied: unknown[] = [];
    registerTemplatePart({
      key: "forms",
      label: "Forms",
      capture: (b) => ({ count: b.checklists.length, names: ["Inspection"] }),
      apply: async (data, ctx) => void applied.push({ data, project: ctx.project.id }),
    });
    const t = captureTemplate(sampleBundle(), { name: "x", includePrices: true }, { id: "t", now: NOW });
    expect(t.payload.parts).toEqual({ forms: { count: 2, names: ["Inspection"] } });
    const back = JSON.parse(JSON.stringify(t));
    const ctx: TemplateApplyContext = { project: project({ id: "p2" }), now: NOW, newId: idGen(), includePrices: true, warnings: [], write: async () => {} };
    await applyTemplateParts(back, ctx, async () => {});
    expect(applied).toEqual([{ data: { count: 2, names: ["Inspection"] }, project: "p2" }]);
  });

  it("ignores an unknown part with a warning", () => {
    const v = validateTemplate({ version: 1, project: {}, checklists: [], estimateLines: [], parts: { schedule: { x: 1 } } });
    expect(v.ok).toBe(true);
    expect(v.payload.parts).toBeUndefined();
    expect(v.warnings[0]).toMatch(/schedule/);
  });
});

describe("validateTemplate", () => {
  it("rejects damaged payloads and newer versions", () => {
    expect(validateTemplate(null).ok).toBe(false);
    expect(validateTemplate("x").ok).toBe(false);
    expect(validateTemplate({ version: 0 }).ok).toBe(false);
    expect(validateTemplate({ version: "1" }).ok).toBe(false);
    const newer = validateTemplate({ version: 2, checklists: [] });
    expect(newer.ok).toBe(false);
    expect(newer.error).toMatch(/newer version/);
  });

  it("normalises what it can and drops bad entries", () => {
    const v = validateTemplate({
      project: { labels: ["A", 3, ""], productChoices: { wap: "p", bad: 4 }, pricing: { markupPct: 10 }, extra: true },
      checklists: [{ name: "C", items: [{ text: "ok", requiresPhoto: "yes", future: 1 }, { text: "" }, 5] }, "junk"],
      estimateLines: [{ key: "custom:a", unitPrice: "12" }, { key: "nokey" }, { description: "no key" }],
      futureField: 1,
    });
    expect(v.ok).toBe(true);
    expect(v.payload).toEqual({
      version: 1,
      project: { labels: ["A"], productChoices: { wap: "p" }, pricing: { markupPct: 10 } },
      checklists: [{ name: "C", items: [{ text: "ok" }] }],
      estimateLines: [{ key: "custom:a" }],
    });
  });

  it("keeps only pricing fields the estimate understands", () => {
    const v = validateTemplate({
      project: { pricing: { markupPct: "30", taxPct: 8, laborMode: "weird", includeTentative: true, wirePrices: { Cat6: 0.4, Bad: "x" }, hack: 1 } },
    });
    expect(v.payload.project.pricing).toEqual({ taxPct: 8, includeTentative: true, wirePrices: { Cat6: 0.4 } });
    expect(validateTemplate({ project: { pricing: { nope: 1 } } }).payload.project.pricing).toBeUndefined();
  });

  it("checks the product or device type behind every kind of estimate key", () => {
    expect(estimateKeyRef("dev:cam")).toEqual({ type: "cam" });
    expect(estimateKeyRef("optlabor:cam")).toEqual({ type: "cam" });
    expect(estimateKeyRef("labor:prod:p1")).toEqual({ product: "p1" });
    expect(estimateKeyRef("optprod:p1")).toEqual({ product: "p1" });
    expect(estimateKeyRef("labor:wire:Cat6")).toBeNull();
    expect(estimateKeyRef("wire:Cat6")).toBeNull();
    expect(estimateKeyRef("closet:mdf")).toBeNull();
    expect(estimateKeyRef("custom:x")).toBeNull();
    const t = {
      payload: {
        version: 1 as const,
        project: {},
        checklists: [],
        estimateLines: [
          { key: "prod:gone", description: "Old camera", unitPrice: 5 },
          { key: "labor:retired", description: "Labor — retired", unitPrice: 5 },
          { key: "prod:p1", unitPrice: 7 },
        ],
      },
    };
    const r = applyTemplate(t, project({ id: "new" }), NOW, idGen(), { deviceTypeIds: new Set(["cam"]), productIds: new Set(["p1"]) });
    expect(r.estimateLines.map((l) => l.key)).toEqual(["prod:p1"]);
    expect(r.warnings).toHaveLength(2);
  });

  it("exports and imports templates with fresh ids", () => {
    const t = captureTemplate(sampleBundle(), { name: "LV", description: "Standard", includePrices: true }, { id: "t", now: NOW });
    const file = templatesFile([t, { ...t, id: "gone", name: "Gone", deleted: true }], NOW);
    const back = parseTemplatesFile(file, NOW, idGen("imp"));
    expect(back.templates).toHaveLength(1);
    expect(back.templates[0]).toMatchObject({ id: "imp1", name: "LV", description: "Standard", payload: t.payload });
    expect(() => parseTemplatesFile("{", NOW, idGen())).toThrow(/invalid JSON/);
    expect(() => parseTemplatesFile("{}", NOW, idGen())).toThrow(/templates file/);
    const bad = parseTemplatesFile(JSON.stringify({ templates: [{ name: "Future", payload: { version: 9 } }] }), NOW, idGen());
    expect(bad.templates).toEqual([]);
    expect(bad.warnings[0]).toMatch(/Future/);
  });
});

describe("job template sync mapping", () => {
  it("round-trips through the remote row; the database sets team and author", () => {
    const t = captureTemplate(sampleBundle(), { name: "LV", description: "d", includePrices: true, trades: ["lowvoltage"] }, { id: "t", now: NOW });
    const remote = toRemote("jobTemplates", { ...t, createdBy: "someone@example.com" } as unknown as Record<string, unknown>);
    expect(remote).toMatchObject({ id: "t", name: "LV", description: "d", trades: ["lowvoltage"], deleted: false, created_by: null });
    expect(remote).not.toHaveProperty("team_id");
    expect(remote.payload).toEqual(t.payload);
    const uid = "0b6c7f2e-8d1a-4f55-9a2b-1c3d4e5f6a7b";
    expect(toRemote("jobTemplates", { id: "x", createdBy: uid }).created_by).toBe(uid);
    expect(toRemote("jobTemplates", { id: "x" }).payload).toEqual({ version: 1, project: {}, checklists: [], estimateLines: [] });
    const back = toLocal("jobTemplates", { ...remote, team_id: "team", created_by: uid, created_at: "2026-11-19T12:00:00+00:00", updated_at: "2026-11-19T12:00:00+00:00", synced_at: "x" });
    expect(back).toEqual({ ...t, deleted: false, createdBy: uid });
    expect(TABLES.jobTemplates.remote).toBe("job_templates");
  });
});
