// PlanGestures hand-off of drags to plan overlays (claimDrag): drawing / moving with one pointer, a second finger
// cancelling into a pinch, a still press not becoming a long-press while an overlay holds it, and the plain pan when
// nobody claims the drag.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanGestures, type GestureHandlers } from "@/lib/planGestures";
import type { PlanViewport } from "@/lib/planViewport";

type Listener = (e: unknown) => void;

function setup(over: Partial<GestureHandlers> = {}) {
  const listeners = new Map<string, Listener>();
  const el = {
    addEventListener: (t: string, fn: Listener) => listeners.set(t, fn),
    removeEventListener: (t: string) => listeners.delete(t),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => {},
  };
  const vp = {
    transform: { scale: 1, x: 0, y: 0 },
    limits: { min: 0.1, max: 8, fit: 1 },
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
    panBy: vi.fn(),
    fling: vi.fn(),
    set: vi.fn(),
  };
  const calls: string[] = [];
  const h: GestureHandlers = {
    hitAt: () => null,
    canDrag: () => false,
    onTap: () => calls.push("tap"),
    onDoubleTap: () => calls.push("double"),
    onLongPress: () => calls.push("long"),
    onDragStart: () => calls.push("devDragStart"),
    onDragMove: () => {},
    onDragEnd: () => {},
    onEdgeSwipe: () => calls.push("edge"),
    onTwoFingerTap: () => calls.push("twoTap"),
    forcePan: () => false,
    ...over,
  };
  const g = new PlanGestures(el as unknown as HTMLElement, vp as unknown as PlanViewport, h);
  let t = 0;
  const fire = (type: string, id: number, x: number, y: number, pointerType = "touch") =>
    listeners.get(type)!({ pointerId: id, clientX: x, clientY: y, pointerType, button: 0, timeStamp: (t += 16), target: null, shiftKey: false, metaKey: false, ctrlKey: false });
  return { g, vp, calls, fire };
}

describe("PlanGestures: overlay drags", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hands a one-finger drag to the overlay that claims it, from where the press began", () => {
    const moves: { x: number; y: number }[] = [];
    const ends: [number, boolean][] = [];
    let start: { x: number; y: number } | null = null;
    const { g, vp, fire } = setup({
      claimDrag: (s) => ((start = s.screen), true),
      claimedDragMove: (p) => moves.push(p),
      claimedDragEnd: (p, cancelled) => ends.push([p.x, cancelled]),
    });
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 105, 100); // inside the touch slop: still a press
    expect(start).toBeNull();
    fire("pointermove", 1, 130, 100);
    expect(start).toEqual({ x: 100, y: 100 });
    fire("pointermove", 1, 160, 110);
    fire("pointerup", 1, 170, 110);
    expect(moves.map((p) => p.x)).toEqual([130, 160]);
    expect(ends).toEqual([[170, false]]);
    expect(vp.panBy).not.toHaveBeenCalled();
    expect(g.last).toBe("claimed");
  });

  it("pans when no overlay claims the drag", () => {
    const { vp, fire } = setup({ claimDrag: () => false });
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 140, 100);
    expect(vp.panBy).toHaveBeenCalled();
  });

  it("a second finger cancels the overlay's drag and pinches", () => {
    const ends: boolean[] = [];
    const { vp, fire } = setup({ claimDrag: () => true, claimedDragEnd: (_p, c) => ends.push(c) });
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 140, 100);
    fire("pointerdown", 2, 300, 100);
    expect(ends).toEqual([true]);
    fire("pointermove", 2, 340, 100);
    expect(vp.set).toHaveBeenCalled(); // pinch transform
    fire("pointerup", 1, 140, 100);
    fire("pointerup", 2, 340, 100);
    expect(ends).toEqual([true]); // not ended twice
  });

  it("a still press stays a press while an overlay holds long-presses (pause, then draw)", () => {
    let claimed = false;
    const { calls, fire } = setup({ holdLongPress: () => true, claimDrag: () => (claimed = true) });
    fire("pointerdown", 1, 100, 100);
    vi.advanceTimersByTime(1000);
    expect(calls).not.toContain("long");
    fire("pointermove", 1, 140, 100);
    expect(claimed).toBe(true);
  });

  it("long-presses as usual otherwise", () => {
    const { calls, fire } = setup();
    fire("pointerdown", 1, 100, 100);
    vi.advanceTimersByTime(1000);
    expect(calls).toContain("long");
  });

  it("a tap is still a tap (no claim asked)", () => {
    const claim = vi.fn(() => true);
    const { calls, fire } = setup({ claimDrag: claim });
    fire("pointerdown", 1, 100, 100, "mouse");
    fire("pointerup", 1, 101, 100, "mouse");
    expect(claim).not.toHaveBeenCalled();
    expect(calls).toEqual(["tap"]);
  });
});
