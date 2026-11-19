import { describe, expect, it } from "vitest";
import { FORM_BUILTINS } from "@/lib/forms/builtins";
import {
  calcChoices,
  canDeleteForm,
  canEditForm,
  canEditTemplates,
  canReopenForm,
  computeCalcs,
  duplicateTemplate,
  emptyValues,
  failedItems,
  formHistory,
  formProgress,
  moveField,
  newFieldId,
  newJobForm,
  normalizeFormTemplates,
  parseNumber,
  punchItemsFromForm,
  reopenForm,
  searchTemplates,
  submitForm,
  templateFromJson,
  templatesForTrades,
  templateToJson,
  validateForm,
  validateTemplate,
} from "@/lib/forms/forms";
import { signatureLines, signedOnBehalf } from "@/lib/forms/signature";
import { toLocal, toRemote } from "@/lib/syncMap";
import type { Checklist, FormTemplate, JobForm } from "@/lib/types";

const NOW = "2026-11-19T15:00:00.000Z";
let n = 0;
const id = () => `id${++n}`;
const tm = FORM_BUILTINS.find((t) => t.id === "tm_tag")!;
const cable = FORM_BUILTINS.find((t) => t.id === "lv_cable_test")!;
const panel = FORM_BUILTINS.find((t) => t.id === "panel_inspection")!;

const form = (t: FormTemplate, values: Record<string, unknown> = {}, extra: Partial<JobForm> = {}): JobForm => ({
  ...newJobForm(t, "p1", id, NOW, "Mike"),
  ...extra,
  values: { ...emptyValues(t), ...values },
});

const simple: FormTemplate = {
  id: "t",
  name: "Simple",
  category: "other",
  version: 1,
  fields: [
    { id: "h", type: "heading", label: "Section" },
    { id: "name", type: "text", label: "Name", required: true },
    { id: "volts", type: "number", label: "Volts", min: 100, max: 130 },
    { id: "ok", type: "yesno", label: "OK", required: true },
    { id: "pick", type: "select", label: "Pick", options: ["A", "B"] },
    { id: "many", type: "multiselect", label: "Many", options: ["X", "Y"] },
    { id: "agree", type: "checkbox", label: "Agree", required: true },
    { id: "sig", type: "signature", label: "Sign", required: true },
    { id: "rows", type: "table", label: "Rows", required: true, columns: [{ id: "a", type: "text", label: "A", required: true }, { id: "n", type: "number", label: "N", min: 0 }] },
    { id: "total", type: "calc", label: "Total", calc: { op: "sum", of: "rows.n" } },
  ],
};

describe("numbers", () => {
  it("accepts a decimal comma and thousands separators", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("1,234,567")).toBe(1234567);
    expect(parseNumber(" 7 ")).toBe(7);
    expect(parseNumber("-.5")).toBe(-0.5);
    expect(parseNumber("12a")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
  });
});

describe("emptyValues", () => {
  it("starts lists empty, checkboxes off and dates on today", () => {
    expect(emptyValues(simple)).toEqual({ many: [], agree: false, rows: [] });
    expect(emptyValues(tm, { today: "2026-11-19" })).toMatchObject({ date: "2026-11-19", labor: [], materials: [], photos: [] });
  });
});

describe("validateForm", () => {
  it("flags required answers, checkbox, signature and the empty table", () => {
    const issues = validateForm(form(simple));
    expect(issues.map((i) => i.fieldId)).toEqual(["name", "ok", "agree", "sig", "rows"]);
    expect(issues.find((i) => i.fieldId === "sig")?.message).toBe("Signature required");
  });

  it("checks min/max with a decimal comma and the options", () => {
    const f = form(simple, { name: "x", ok: "na", agree: true, volts: "99,5", pick: "C", many: ["X", "Z"], rows: [{ _id: "r", a: "1" }] }, { signatures: [{ fieldId: "sig", name: "J", imageId: "i", signedAt: NOW }] });
    expect(validateForm(f)).toEqual([
      { fieldId: "volts", message: "Must be at least 100" },
      { fieldId: "pick", message: "Pick one of the options" },
      { fieldId: "many", message: "Pick from the options" },
    ]);
    expect(validateForm({ ...f, values: { ...f.values, volts: 131, pick: "A", many: ["X"] } })).toEqual([{ fieldId: "volts", message: "Must be 130 or less" }]);
    expect(validateForm({ ...f, values: { ...f.values, volts: "120", pick: "A", many: [] } })).toEqual([]);
  });

  it("validates tables per row and ignores blank rows", () => {
    const f = form(simple, { name: "x", ok: "yes", agree: true, rows: [{ _id: "1", a: "ok", n: 2 }, { _id: "2" }, { _id: "3", n: "-1" }] }, { signatures: [{ fieldId: "sig", name: "J", imageId: "i", signedAt: NOW }] });
    const issues = validateForm(f);
    expect(issues).toEqual([
      { fieldId: "rows", row: 2, columnId: "a", message: "Row 3: A — required" },
      { fieldId: "rows", row: 2, columnId: "n", message: "Row 3: N — must be at least 0" },
    ]);
  });

  it("T&M tag needs both signatures before submit", () => {
    const f = form(tm, { date: "2026-11-19", description: "Moved 2 cameras", labor: [{ _id: "a", name: "Mike", hours: 2 }] });
    expect(validateForm(f).map((i) => i.fieldId)).toEqual(["sig_customer", "sig_ours"]);
    const signed = { ...f, signatures: ["sig_customer", "sig_ours"].map((fieldId) => ({ fieldId, name: "X", imageId: "i", signedAt: NOW })) };
    expect(validateForm(signed)).toEqual([]);
  });
});

describe("computeCalcs", () => {
  it("adds up T&M labor hours (with a decimal comma) and materials", () => {
    const f = form(tm, { labor: [{ _id: "a", name: "Mike", hours: 2.5 }, { _id: "b", name: "Ana", hours: "1,5" }, { _id: "c", name: "", hours: "" }], materials: [{ _id: "m", item: "Cat6", qty: 3 }] });
    expect(computeCalcs(f.template, f.values)).toEqual({ total_hours: 4, total_materials: 3 });
    expect(computeCalcs(tm, emptyValues(tm))).toEqual({ total_hours: 0, total_materials: 0 });
  });

  it("counts failures and supports avg/min/max on fields and columns", () => {
    const f = form(cable, { cables: [{ label: "D1", length: 100, pass: "yes" }, { label: "D2", length: 50, pass: "no" }, { label: "D3", pass: "no" }] });
    expect(computeCalcs(f.template, f.values)).toEqual({ failures: 2, total_length: 150 });
    const t: FormTemplate = {
      ...simple,
      fields: [
        { id: "a", type: "number", label: "A" },
        { id: "rows", type: "table", label: "R", columns: [{ id: "n", type: "number", label: "N" }] },
        { id: "avg", type: "calc", label: "Avg", calc: { op: "avg", of: "rows.n" } },
        { id: "min", type: "calc", label: "Min", calc: { op: "min", of: "rows.n" } },
        { id: "max", type: "calc", label: "Max", calc: { op: "max", of: "rows.n" } },
        { id: "one", type: "calc", label: "One", calc: { op: "sum", of: "a" } },
      ],
    };
    expect(computeCalcs(t, { a: "2,5", rows: [{ n: 1 }, { n: 2 }, { n: 4 }] })).toEqual({ avg: 2.333333, min: 1, max: 4, one: 2.5 });
    expect(computeCalcs(t, { rows: [] })).toEqual({ avg: null, min: null, max: null, one: 0 });
  });
});

describe("formProgress", () => {
  it("counts answered and required fields (signatures included, headings and calcs not)", () => {
    const f = form(simple, { name: "x", ok: "no", rows: [{ a: "1" }] });
    expect(formProgress(f)).toEqual({ answered: 3, total: 8, required: 5, requiredDone: 3, pct: 38 });
    const signed = { ...f, signatures: [{ fieldId: "sig", name: "J", imageId: "i", signedAt: NOW }] };
    expect(formProgress(signed)).toMatchObject({ answered: 4, requiredDone: 4 });
  });
});

describe("failedItems and punch items", () => {
  it("lists No answers from fields and table rows", () => {
    const f = form(panel, { cover: "yes", directory: "no", torque: "na" });
    expect(failedItems(f)).toEqual([{ fieldId: "directory", text: "Circuit directory filled in — No" }]);
    const c = form(cable, { cables: [{ label: "D1", pass: "yes" }, { label: "D7", pass: "no" }, { pass: "no" }] });
    expect(failedItems(c).map((x) => x.text)).toEqual(["Cables: D7 — Pass: No", "Cables: Row 3 — Pass: No"]);
  });

  it("adds them to the punch list once", () => {
    const f = form(panel, { directory: "no", clearance: "no" });
    const first = punchItemsFromForm([], f, id, NOW);
    expect(first.created).toBe(true);
    expect(first.checklist.name).toBe("Punch list");
    expect(first.added.map((i) => i.text)).toEqual(["Circuit directory filled in — No", "Working clearance kept clear — No"]);
    const again = punchItemsFromForm([first.checklist as Checklist], f, id, NOW);
    expect(again.added).toEqual([]);
    expect(again.created).toBe(false);
  });
});

describe("permissions", () => {
  const draft = form(simple);
  const done = submitForm(draft, "Mike", NOW);
  it("drafts are editable by everyone; submitted forms by nobody", () => {
    for (const r of [null, "owner", "admin", "tech"] as const) {
      expect(canEditForm(r, draft)).toBe(true);
      expect(canEditForm(r, done)).toBe(false);
    }
  });
  it("only the office reopens, deletes submitted forms and builds templates", () => {
    expect([null, "owner", "admin", "tech"].map((r) => canReopenForm(r as never, done))).toEqual([true, true, true, false]);
    expect(canReopenForm("admin", draft)).toBe(false);
    expect([null, "owner", "admin", "tech"].map((r) => canDeleteForm(r as never, done))).toEqual([true, true, true, false]);
    expect(canDeleteForm("tech", draft)).toBe(true);
    expect(canEditTemplates("tech")).toBe(false);
    expect(canEditTemplates("admin")).toBe(true);
  });
  it("reopening sets draft and appends a note", () => {
    expect(done).toMatchObject({ status: "submitted", submittedBy: "Mike", submittedAt: NOW });
    const r = reopenForm(done, "Office", "2026-11-20T10:00:00.000Z", "wrong hours");
    expect(r.status).toBe("draft");
    expect(r.submittedAt).toBeNull();
    expect(formHistory(r)).toEqual([{ at: "2026-11-20T10:00:00.000Z", by: "Office", text: "Reopened (submitted 2026-11-19 by Mike): wrong hours" }]);
    expect(formHistory(reopenForm(submitForm(r, "Mike", NOW), "Office", NOW))).toHaveLength(2);
    // The form's answers survive.
    expect(validateForm(r)).toEqual(validateForm(done));
  });
});

describe("templates", () => {
  it("rejects duplicate ids, bad calc refs and too many columns", () => {
    const dup: FormTemplate = { ...simple, fields: [...simple.fields, { id: "name", type: "text", label: "Again" }] };
    expect(validateTemplate(dup)).toContain("Two fields share the id “name”");
    const bad: FormTemplate = { ...simple, fields: [...simple.fields, { id: "c2", type: "calc", label: "Bad", calc: { op: "sum", of: "rows.zzz" } }] };
    expect(validateTemplate(bad)).toEqual(["Calculation “Bad” refers to “rows.zzz”, which isn't on the form"]);
    const wrongType: FormTemplate = { ...simple, fields: [...simple.fields, { id: "c3", type: "calc", label: "Typed", calc: { op: "sum", of: "name" } }] };
    expect(validateTemplate(wrongType)).toEqual(["Calculation “Typed” can't use “Name” (needs a number)"]);
    const wide: FormTemplate = { ...simple, fields: [{ id: "t", type: "table", label: "Wide", columns: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, type: "text" as const, label: `C${i}` })) }] };
    expect(validateTemplate(wide)).toEqual(["Table “Wide” has more than 8 columns"]);
    const badCol: FormTemplate = { ...simple, fields: [{ id: "t", type: "table", label: "T", columns: [{ id: "p", type: "photo", label: "P" }] }] };
    expect(validateTemplate(badCol)).toEqual(["Table “T”: a column can't be a photo field"]);
    expect(validateTemplate({ ...simple, fields: [{ id: "s", type: "select", label: "S", options: [] }] })).toEqual(["“S” needs at least one option"]);
    expect(validateTemplate(simple)).toEqual([]);
  });

  it("every built-in is valid, with unique ids", () => {
    expect(new Set(FORM_BUILTINS.map((t) => t.id)).size).toBe(FORM_BUILTINS.length);
    for (const t of FORM_BUILTINS) {
      expect(validateTemplate(t), t.name).toEqual([]);
      expect(t.builtin).toBe(true);
    }
    const tmTag = FORM_BUILTINS.find((t) => t.category === "tm")!;
    expect(tmTag.fields.filter((f) => f.type === "signature")).toHaveLength(2);
  });

  it("imports and exports JSON, refusing broken templates", () => {
    const json = templateToJson(tm);
    const back = templateFromJson(json);
    expect(back.errors).toEqual([]);
    expect(back.template).toEqual({ ...tm, builtin: undefined } as unknown as FormTemplate);
    expect(templateFromJson("{nope").errors).toEqual(["That file isn't valid JSON"]);
    expect(templateFromJson({ id: "x", name: "X", category: "other", fields: [] }).errors).toEqual(["Add at least one field"]);
    expect(normalizeFormTemplates([tm, { id: "bad" }, tm, "x"]).map((t) => t.id)).toEqual(["tm_tag"]);
    expect(normalizeFormTemplates([tm])[0].builtin).toBeUndefined();
  });

  it("duplicates a built-in to customise", () => {
    const copy = duplicateTemplate(tm, () => "new", NOW, [{ ...tm, name: "T&M tag (copy)" }]);
    expect(copy).toMatchObject({ id: "new", name: "T&M tag (copy 2)", version: 1 });
    expect(copy.builtin).toBeUndefined();
    expect(tm.builtin).toBe(true);
    expect(newFieldId(copy.fields, "Total hours")).toBe("total_hours_2");
    expect(newFieldId(copy.fields, "Inspector")).toBe("inspector");
    expect(moveField([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveField([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it("keeps the snapshot when the template changes later", () => {
    const t: FormTemplate = JSON.parse(JSON.stringify(simple));
    const f = newJobForm(t, "p", id, NOW, "Mike");
    t.fields.push({ id: "later", type: "text", label: "Later" });
    t.name = "Renamed";
    expect(f.template.fields.map((x) => x.id)).not.toContain("later");
    expect(f.name).toBe("Simple");
  });

  it("puts the company's and its trades' templates first", () => {
    const mine = { ...simple, id: "mine" };
    const { suggested, others } = templatesForTrades([mine, ...FORM_BUILTINS], ["electrical"]);
    expect(suggested.map((t) => t.id)).toEqual(["mine", "rough_in_request", "panel_inspection", "jha", "tm_tag", "walkthrough"]);
    expect(others.map((t) => t.id)).toEqual(["lv_cable_test", "fa_device_test"]);
    expect(searchTemplates(FORM_BUILTINS, "megger").map((t) => t.id)).toEqual(["panel_inspection"]);
    expect(calcChoices(tm, "sum").map((c) => c.of)).toEqual(["labor.hours", "materials.qty"]);
  });
});

describe("signatures", () => {
  it("says when a signature was collected for someone else", () => {
    expect(signedOnBehalf({ name: "Mike", signedBy: "mike" })).toBe(false);
    expect(signedOnBehalf({ name: "Jane (inspector)", signedBy: "Mike" })).toBe(true);
    expect(signatureLines({ fieldId: "s", name: "Jane", role: "Inspector", imageId: "i", signedAt: NOW, signedBy: "Mike" }, "Nov 19")).toEqual([
      "Jane (Inspector)",
      "Signed Nov 19",
      "Signed on behalf · collected by Mike",
    ]);
  });
});

describe("sync", () => {
  it("maps forms to job_forms and back", () => {
    const f = submitForm(form(tm, { labor: [{ _id: "a", name: "Mike", hours: 2 }] }, { sheetId: "s1", x: 0.25, y: 0.75, photoIds: ["ph"], signatures: [{ fieldId: "sig_ours", name: "Mike", imageId: "img", signedAt: NOW }] }), "Mike", NOW);
    const r = toRemote("forms", f as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ project_id: "p1", template_id: "tm_tag", status: "submitted", sheet_id: "s1", x: 0.25, photo_ids: ["ph"], submitted_by: "Mike", marker_id: null, deleted: false });
    expect(r.values).toEqual(f.values);
    expect(r.template).toEqual(f.template);
    const back = toLocal("forms", { ...r, submitted_at: "2026-11-19 15:00:00+00", updated_at: "2026-11-19T15:00:00+00:00" });
    expect(back).toMatchObject({ projectId: "p1", templateId: "tm_tag", status: "submitted", submittedAt: NOW, signatures: f.signatures, values: f.values });
    expect(back).not.toHaveProperty("markerId");
    expect(toRemote("forms", { id: "x", projectId: "p", template: tm })).toMatchObject({ status: "draft", values: {} });
  });
});
