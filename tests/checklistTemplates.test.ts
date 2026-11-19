import { describe, expect, it } from "vitest";
import {
  addTemplate,
  allChecklistTemplates,
  CHECKLIST_TEMPLATES,
  checklistFromTemplate,
  normalizeTemplates,
  removeTemplate,
  renameTemplate,
  templateFromChecklist,
  uniqueTemplateName,
} from "@/lib/fieldDocs";
import type { Checklist, ChecklistTemplate } from "@/lib/types";

const seq = () => {
  let n = 0;
  return () => `id${++n}`;
};

const job: Checklist = {
  id: "c1",
  projectId: "p1",
  name: "Theater room",
  items: [
    { id: "i1", text: "  Screen wall blocking  ", requiresPhoto: true, done: true, doneBy: "Mike", doneAt: "2026-11-19T10:00:00Z", assignee: "Jane", due: "2026-11-20", note: "left side" },
    { id: "i2", text: "Projector power + HDMI", done: false },
    { id: "i3", text: "   " },
  ],
  createdAt: "2026-11-19T09:00:00Z",
  updatedAt: "2026-11-19T09:00:00Z",
};

const tpl = (id: string, name: string, items: ChecklistTemplate["items"] = []): ChecklistTemplate => ({ id, name, items, custom: true });

describe("checklist templates", () => {
  it("saves a job checklist as a template without job-specific state", () => {
    const t = templateFromChecklist(job, "  Theater ", seq(), "2026-11-19T12:00:00Z");
    expect(t).toEqual({
      id: "id1",
      name: "Theater",
      items: [
        { text: "Screen wall blocking", requiresPhoto: true },
        { text: "Projector power + HDMI", requiresPhoto: false },
      ],
      custom: true,
      createdAt: "2026-11-19T12:00:00Z",
      updatedAt: "2026-11-19T12:00:00Z",
    });
    expect(templateFromChecklist(job, "  ", seq()).name).toBe("Theater room");
  });

  it("starts a fresh checklist from a saved template (round trip)", () => {
    const t = templateFromChecklist(job, "Theater", seq());
    const c = checklistFromTemplate(t, "p2", seq(), "2026-11-21T08:00:00Z");
    expect(c.projectId).toBe("p2");
    expect(c.name).toBe("Theater");
    expect(c.items.map((i) => [i.text, i.requiresPhoto, i.done, i.assignee])).toEqual([
      ["Screen wall blocking", true, undefined, undefined],
      ["Projector power + HDMI", false, undefined, undefined],
    ]);
    expect(new Set(c.items.map((i) => i.id)).size).toBe(2);
  });

  it("lists saved templates (A→Z) before the built-ins", () => {
    const all = allChecklistTemplates([tpl("b", "Zone audio"), tpl("a", "Attic run")]);
    expect(all.map((t) => t.name).slice(0, 2)).toEqual(["Attic run", "Zone audio"]);
    expect(all.slice(2)).toEqual(CHECKLIST_TEMPLATES);
    expect(allChecklistTemplates(undefined)).toEqual(CHECKLIST_TEMPLATES);
    expect(CHECKLIST_TEMPLATES.every((t) => !t.custom)).toBe(true);
  });

  it("normalizes stored templates: drops broken rows and duplicate ids, cleans items", () => {
    const raw = [
      { id: "x", name: " Gate ", items: [{ text: " Keypad " }, { text: "" }, null, { requiresPhoto: true }] },
      { id: "x", name: "Duplicate" },
      { id: "", name: "No id" },
      { id: "y", name: "   " },
      { id: "z", name: "No items" },
      "junk",
    ];
    expect(normalizeTemplates(raw)).toEqual([
      { id: "x", name: "Gate", items: [{ text: "Keypad", requiresPhoto: false }], custom: true },
      { id: "z", name: "No items", items: [], custom: true },
    ]);
    expect(normalizeTemplates(null)).toEqual([]);
    expect(normalizeTemplates({})).toEqual([]);
  });

  it("keeps names unique when saving and renaming", () => {
    const list = [tpl("a", "Trim-out"), tpl("b", "Trim-out (2)")];
    expect(uniqueTemplateName("trim-out", list)).toBe("trim-out (3)");
    expect(uniqueTemplateName("Gate", list)).toBe("Gate");
    expect(uniqueTemplateName("Trim-out", list, "a")).toBe("Trim-out");
    expect(addTemplate(list, tpl("c", "Trim-out")).map((t) => t.name)).toEqual(["Trim-out", "Trim-out (2)", "Trim-out (3)"]);
  });

  it("renames and removes saved templates", () => {
    const list = [tpl("a", "Gate"), tpl("b", "Attic")];
    const renamed = renameTemplate(list, "a", " Driveway gate ", "2026-11-19T13:00:00Z");
    expect(renamed[0]).toMatchObject({ id: "a", name: "Driveway gate", updatedAt: "2026-11-19T13:00:00Z" });
    expect(renameTemplate(list, "a", "attic").find((t) => t.id === "a")?.name).toBe("attic (2)");
    expect(renameTemplate(list, "a", "  ")).toBe(list);
    expect(renameTemplate(list, "nope", "X")).toBe(list);
    expect(removeTemplate(list, "a").map((t) => t.id)).toEqual(["b"]);
  });
});
