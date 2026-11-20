import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { isTaskDropKey } from "@/components/tasks/taskStore";
import { setLetterShortcuts } from "@/lib/planOverlays";

/** A stand-in element: `closest` matches when any of its "ancestors" matches one of the selectors. */
const el = (...tags: string[]) => ({ closest: (sel: string) => (sel.split(",").some((s) => tags.includes(s.trim())) ? {} : null) }) as unknown as EventTarget;
const key = (over: Partial<Parameters<typeof isTaskDropKey>[0]> = {}) => ({ key: "T", shiftKey: true, metaKey: false, ctrlKey: false, altKey: false, repeat: false, target: el("div"), ...over });

describe("Shift+T (drop a task)", () => {
  afterEach(() => setLetterShortcuts(true));

  it("is Shift+T only", () => {
    expect(isTaskDropKey(key())).toBe(true);
    expect(isTaskDropKey(key({ key: "t" }))).toBe(true);
    expect(isTaskDropKey(key({ shiftKey: false, key: "t" }))).toBe(false);
    expect(isTaskDropKey(key({ metaKey: true }))).toBe(false);
    expect(isTaskDropKey(key({ ctrlKey: true }))).toBe(false);
    expect(isTaskDropKey(key({ altKey: true }))).toBe(false);
    expect(isTaskDropKey(key({ key: "R" }))).toBe(false);
  });

  it("follows the plan's shared key rules", () => {
    // Typing a capital T in any text field (not just input/textarea) or inside a dialog doesn't drop a task.
    expect(isTaskDropKey(key({ target: el("input") }))).toBe(false);
    expect(isTaskDropKey(key({ target: el("[role=combobox]") }))).toBe(false);
    expect(isTaskDropKey(key({ target: el("[contenteditable='true']") }))).toBe(false);
    expect(isTaskDropKey(key({ target: el("[role=dialog]") }))).toBe(false);
    // Held down: once.
    expect(isTaskDropKey(key({ repeat: true }))).toBe(false);
    // Letter shortcuts switched off ("?").
    setLetterShortcuts(false);
    expect(isTaskDropKey(key())).toBe(false);
  });
});
