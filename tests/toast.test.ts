import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TOASTS, TOAST_MS, toast, useToasts } from "@/lib/toast";

const texts = () => useToasts.getState().toasts.map((t) => t.text);

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [], paused: false });
  });
  afterEach(() => {
    for (const t of useToasts.getState().toasts) useToasts.getState().dismiss(t.id);
    vi.useRealTimers();
  });

  it("errors stay about 10 seconds, news goes sooner", () => {
    toast("Saved");
    toast("Upload failed", "error");
    expect(TOAST_MS.error).toBeGreaterThanOrEqual(10000);
    vi.advanceTimersByTime(TOAST_MS.success + 1);
    expect(texts()).toEqual(["Upload failed"]);
    vi.advanceTimersByTime(TOAST_MS.error - TOAST_MS.success - 100);
    expect(texts()).toEqual(["Upload failed"]);
    vi.advanceTimersByTime(200);
    expect(texts()).toEqual([]);
  });

  it("pausing (hover or focus) keeps toasts up, resuming runs the time that was left", () => {
    toast("Upload failed", "error");
    vi.advanceTimersByTime(4000);
    useToasts.getState().pause();
    vi.advanceTimersByTime(60000);
    expect(texts()).toEqual(["Upload failed"]);
    // A toast that arrives while paused waits too.
    toast("Saved");
    vi.advanceTimersByTime(60000);
    expect(texts()).toEqual(["Upload failed", "Saved"]);
    useToasts.getState().resume();
    vi.advanceTimersByTime(TOAST_MS.success + 1);
    expect(texts()).toEqual(["Upload failed"]);
    vi.advanceTimersByTime(TOAST_MS.error - 4000 - TOAST_MS.success);
    expect(texts()).toEqual([]);
  });

  it("dismiss removes one at once; only the newest few are kept", () => {
    const id = toast("A", "error");
    useToasts.getState().dismiss(id);
    expect(texts()).toEqual([]);
    for (let i = 0; i < MAX_TOASTS + 2; i++) toast(`T${i}`);
    expect(texts()).toHaveLength(MAX_TOASTS);
    expect(texts()[MAX_TOASTS - 1]).toBe(`T${MAX_TOASTS + 1}`);
  });
});
