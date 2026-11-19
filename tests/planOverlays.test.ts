import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { claimPlanInput, isLetterShortcut, modalOpen, planKeyBlocked, registerPlanInput, releaseAllPlanInput, repeatBlocked } from "@/lib/planOverlays";
// The real owners of plan input (registers their releases on import).
import { resetPlanUi } from "@/components/editor/overlays/planInputs";
import { useMarkups } from "@/components/markups/useMarkups";
import { canEditMeasurement, useMeasureUi } from "@/components/measure/measureUi";
import { useProgressUi } from "@/components/progress/progressStore";
import { useTasks } from "@/components/tasks/taskStore";
import { useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";

// ---- a tiny DOM stand-in for planKeyBlocked (vitest runs in node) ----

type Attrs = Record<string, string>;
interface FakeEl {
  tag: string;
  attrs: Attrs;
  parent: FakeEl | null;
  closest(sel: string): FakeEl | null;
}
/** Matches the simple selectors planKeyBlocked uses: tag, [attr], [attr=v], [attr='v'], tag[attr]. */
function matches(el: FakeEl, sel: string): boolean {
  return sel.split(",").some((one) => {
    const m = one.trim().match(/^([a-z]*)(?:\[([a-z-]+)(?:=(?:'([^']*)'|([^\]]*)))?\])?$/);
    if (!m) return false;
    const [, tag, attr, q, bare] = m;
    if (tag && el.tag !== tag) return false;
    if (!attr) return !!tag;
    if (!(attr in el.attrs)) return false;
    const want = q ?? bare;
    return want == null || el.attrs[attr] === want;
  });
}
function el(tag: string, attrs: Attrs = {}, parent: FakeEl | null = null): FakeEl {
  const e: FakeEl = {
    tag,
    attrs,
    parent,
    closest(sel) {
      for (let n: FakeEl | null = e; n; n = n.parent) if (matches(n, sel)) return n;
      return null;
    },
  };
  return e;
}
const noModal = { querySelector: () => null };
const withModal = { querySelector: (s: string) => (s.includes("aria-modal") ? ({} as Element) : null) };
const key = (k: string, target: FakeEl | null, extra: Partial<KeyboardEvent> = {}) => ({ key: k, target: target as unknown as EventTarget, ...extra });

describe("claimPlanInput", () => {
  it("releases every other owner, never the claimer", () => {
    const log: string[] = [];
    const off = [registerPlanInput("measure", () => log.push("measure")), registerPlanInput("markups", () => log.push("markups")), registerPlanInput("walk", () => log.push("walk"))];
    claimPlanInput("markups");
    expect(log.sort()).toEqual(["measure", "walk"]);
    off.forEach((f) => f());
    resetPlanUi();
  });

  it("a release that claims does not loop", () => {
    let n = 0;
    const off = registerPlanInput("links", () => {
      n++;
      claimPlanInput("links");
    });
    claimPlanInput("measure");
    releaseAllPlanInput();
    expect(n).toBe(2);
    off();
  });
});

describe("one tool owns plan taps (real stores)", () => {
  beforeEach(() => {
    resetPlanUi();
    useProgressUi.getState().set({ on: true });
  });
  it("Measure, Markups, Walk, the Link tool, a task drop and device tools close each other", () => {
    useMeasureUi.getState().setActive(true);
    expect(useMeasureUi.getState().active).toBe(true);

    useMarkups.getState().setOpen(true);
    expect(useMarkups.getState().open).toBe(true);
    expect(useMeasureUi.getState().active).toBe(false);

    // Walk: closes markups and puts the editor back on Select.
    useEditor.getState().setTool({ kind: "wire" });
    expect(useMarkups.getState().open).toBe(false);
    useProgressUi.getState().set({ walk: true });
    claimPlanInput("walk");
    expect(useEditor.getState().tool.kind).toBe("select");

    // A device tool stops walking.
    useEditor.getState().setTool({ kind: "place", deviceTypeId: "cam" });
    expect(useProgressUi.getState().walk).toBe(false);

    // The link tool closes the device tool.
    claimPlanInput("links");
    useSheetLinks.getState().setDrawing(true);
    expect(useEditor.getState().tool.kind).toBe("select");

    // A task drop closes the link tool.
    claimPlanInput("task-drop");
    useTasks.getState().arm({ kind: "new" });
    expect(useSheetLinks.getState().drawing).toBe(false);

    // Measure closes the drop; a markup tool (opens markups) closes Measure.
    useMeasureUi.getState().setActive(true);
    expect(useTasks.getState().drop).toBeNull();
    useMarkups.getState().setTool("pen");
    expect(useMeasureUi.getState().active).toBe(false);
    expect(useMarkups.getState().open).toBe(true);
  });

  it("selecting is not a tool: Select keeps Measure open", () => {
    useMeasureUi.getState().setActive(true);
    useEditor.getState().setTool({ kind: "select" });
    expect(useMeasureUi.getState().active).toBe(true);
  });

  it("resetPlanUi clears walk, measure and markups state (leaving the plan / another job)", () => {
    useMeasureUi.getState().setActive(true);
    useMeasureUi.getState().setDraft([0.1, 0.1, 0.2, 0.2], "s1");
    useMeasureUi.getState().select("m1");
    useMeasureUi.getState().setPanelOpen(true);
    useProgressUi.getState().set({ walk: true, sheet: { table: "markers", id: "x" }, pendingPhoto: { table: "markers", id: "x", to: "tested", label: "C1" } });
    useMarkups.getState().set({ open: true, selectedId: "k", listOpen: true });
    useTasks.getState().arm({ kind: "new" });
    resetPlanUi();
    const m = useMeasureUi.getState();
    expect([m.active, m.draft.length, m.selectedId, m.panelOpen]).toEqual([false, 0, null, false]);
    const p = useProgressUi.getState();
    expect([p.walk, p.sheet, p.pendingPhoto]).toEqual([false, null, null]);
    // The Progress view itself is a display preference: it stays.
    expect(p.on).toBe(true);
    const k = useMarkups.getState();
    expect([k.open, k.selectedId, k.listOpen]).toEqual([false, null, false]);
    expect(useTasks.getState().drop).toBeNull();
  });
});

describe("keyboard safety", () => {
  it("ignores keys in text fields and inside dialogs", () => {
    expect(planKeyBlocked(key("e", el("input")), noModal)).toBe(true);
    expect(planKeyBlocked(key("Delete", el("textarea")), noModal)).toBe(true);
    expect(planKeyBlocked(key("m", el("div", { contenteditable: "true" })), noModal)).toBe(true);
    const dialog = el("div", { role: "dialog" });
    expect(planKeyBlocked(key("Delete", el("div", {}, dialog)), noModal)).toBe(true);
    expect(planKeyBlocked(key("e", el("span", {}, el("div", { "aria-modal": "true" }))), noModal)).toBe(true);
  });

  it("ignores every key while any modal is open", () => {
    expect(planKeyBlocked(key("e", el("canvas")), withModal)).toBe(true);
    expect(modalOpen(withModal)).toBe(true);
    expect(modalOpen(noModal)).toBe(false);
  });

  it("leaves Space / Enter to a focused button, but other keys still work there", () => {
    const btn = el("button");
    expect(planKeyBlocked(key(" ", btn), noModal)).toBe(true);
    expect(planKeyBlocked(key("Enter", btn), noModal)).toBe(true);
    expect(planKeyBlocked(key("+", btn), noModal)).toBe(false);
    expect(planKeyBlocked(key("Escape", btn), noModal)).toBe(false);
    expect(planKeyBlocked(key("ArrowLeft", btn), noModal)).toBe(false);
    expect(planKeyBlocked(key("ArrowLeft", el("button", { role: "radio" })), noModal)).toBe(true);
  });

  it("plan keys on the plan itself are not blocked", () => {
    expect(planKeyBlocked(key("e", el("div", { "data-testid": "plan-view" })), noModal)).toBe(false);
    expect(planKeyBlocked(key("e", null), noModal)).toBe(false);
  });

  it("E and Delete don't repeat while held", () => {
    expect(repeatBlocked({ key: "e", repeat: true })).toBe(true);
    expect(repeatBlocked({ key: "E", repeat: true })).toBe(true);
    expect(repeatBlocked({ key: "Delete", repeat: true })).toBe(true);
    expect(repeatBlocked({ key: "Backspace", repeat: true })).toBe(true);
    expect(repeatBlocked({ key: "e", repeat: false })).toBe(false);
    expect(repeatBlocked({ key: "ArrowLeft", repeat: true })).toBe(false);
  });

  it("single-key shortcuts are single characters without ⌘ / Ctrl / Alt", () => {
    const k = (key: string, mod: Partial<KeyboardEvent> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mod });
    expect(isLetterShortcut(k("m"))).toBe(true);
    expect(isLetterShortcut(k("?"))).toBe(true);
    expect(isLetterShortcut(k("z", { metaKey: true }))).toBe(false);
    expect(isLetterShortcut(k("Escape"))).toBe(false);
    expect(isLetterShortcut(k("ArrowUp"))).toBe(false);
  });
});

describe("canEditMeasurement", () => {
  const editing = { editing: true, measuring: false };
  it("needs Edit mode or Measure open", () => {
    expect(canEditMeasurement("owner", { author: null }, "sam", { editing: false, measuring: false })).toBe(false);
    expect(canEditMeasurement("owner", { author: null }, "sam", { editing: false, measuring: true })).toBe(true);
    expect(canEditMeasurement("owner", { author: null }, "sam", editing)).toBe(true);
  });
  it("technicians change only their own; the office changes anyone's", () => {
    expect(canEditMeasurement("tech", { author: "Sam" }, "sam", editing)).toBe(true);
    expect(canEditMeasurement("tech", { author: "Alex" }, "sam", editing)).toBe(false);
    expect(canEditMeasurement("admin", { author: "Alex" }, "sam", editing)).toBe(true);
    expect(canEditMeasurement("owner", { author: "Alex" }, null, editing)).toBe(true);
    // No author recorded (older rows): anyone who may edit.
    expect(canEditMeasurement("tech", { author: "" }, "sam", editing)).toBe(true);
  });
});
