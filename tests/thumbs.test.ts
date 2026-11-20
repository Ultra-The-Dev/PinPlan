import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { firstPhotos, PHOTO_PAGE } from "@/lib/photos";
import { ensureThumb, PHOTO_THUMB, SHEET_THUMB, thumbId, thumbSize, type ThumbMaker } from "@/lib/thumbs";

describe("thumbnail size", () => {
  it("fits the longest side, keeps the aspect ratio and never enlarges", () => {
    expect(thumbSize(4800, 3600, SHEET_THUMB)).toEqual({ width: 480, height: 360 });
    expect(thumbSize(1920, 2560, PHOTO_THUMB)).toEqual({ width: 300, height: 400 });
    expect(thumbSize(200, 100, SHEET_THUMB)).toEqual({ width: 200, height: 100 });
    expect(thumbSize(10000, 10, SHEET_THUMB)).toEqual({ width: 480, height: 1 });
    expect(thumbSize(0, 0, 400)).toEqual({ width: 400, height: 400 });
  });
});

describe("stored thumbnails", () => {
  let calls: { maxSide: number; size?: { width: number; height: number } }[] = [];
  const maker: ThumbMaker = async (blob, maxSide, size) => {
    calls.push({ maxSide, size });
    await new Promise((r) => setTimeout(r, 5));
    return { blob: new Blob(["thumb"], { type: "image/jpeg" }), ...thumbSize(size?.width ?? 1, size?.height ?? 1, maxSide) };
  };

  beforeEach(async () => {
    calls = [];
    await db().thumbs.clear();
    await db().images.clear();
    await db().syncQueue.clear();
    await db().images.put({ id: "img1", blob: new Blob(["big"], { type: "image/jpeg" }), width: 4800, height: 3600, mime: "image/jpeg" });
    await db().images.put({ id: "doc1", blob: new Blob(["%PDF"], { type: "application/pdf" }), width: 0, height: 0, mime: "application/pdf" });
  });

  it("makes a thumb once, stores it locally and reuses it", async () => {
    const [a, b] = await Promise.all([ensureThumb("img1", SHEET_THUMB, maker), ensureThumb("img1", SHEET_THUMB, maker)]);
    expect(a).toMatchObject({ id: thumbId("img1", SHEET_THUMB), imageId: "img1", width: 480, height: 360 });
    expect(b?.id).toBe(a?.id);
    expect(calls).toHaveLength(1);
    expect(calls[0].size).toEqual({ width: 4800, height: 3600 });
    await ensureThumb("img1", SHEET_THUMB, maker);
    expect(calls).toHaveLength(1);
    // A different size is a different thumb.
    await ensureThumb("img1", PHOTO_THUMB, maker);
    expect(calls).toHaveLength(2);
    expect(await db().thumbs.count()).toBe(2);
  });

  it("is local only: nothing is queued for sync", async () => {
    await ensureThumb("img1", SHEET_THUMB, maker);
    expect(await db().syncQueue.count()).toBe(0);
  });

  it("gives null for images not on this device or that aren't pictures, and when decoding fails", async () => {
    expect(await ensureThumb("missing", SHEET_THUMB, maker)).toBeNull();
    expect(await ensureThumb("doc1", SHEET_THUMB, maker)).toBeNull();
    expect(await ensureThumb("img1", SHEET_THUMB, async () => Promise.reject(new Error("decode")))).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await db().thumbs.count()).toBe(0);
  });

  it("decodes at most two full-size images at a time", async () => {
    for (let i = 0; i < 6; i++) await db().images.put({ id: `p${i}`, blob: new Blob(["x"]), width: 2560, height: 1920, mime: "image/jpeg" });
    let active = 0;
    let peak = 0;
    const slow: ThumbMaker = async (blob, maxSide, size) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { blob, ...thumbSize(size!.width, size!.height, maxSide) };
    };
    const out = await Promise.all(Array.from({ length: 6 }, (_, i) => ensureThumb(`p${i}`, PHOTO_THUMB, slow)));
    expect(out.every((t) => t?.width === 400 && t.height === 300)).toBe(true);
    expect(peak).toBe(2);
  });
});

describe("photo grid pages", () => {
  const groups = [
    { day: "2026-11-19", photos: ["a", "b", "c"] },
    { day: "2026-11-18", photos: ["d", "e"] },
    { day: "2026-11-17", photos: ["f"] },
  ];

  it("shows the newest photos first, a page at a time, keeping each day's full list", () => {
    expect(firstPhotos(groups, 4)).toEqual([
      { day: "2026-11-19", photos: ["a", "b", "c"], all: ["a", "b", "c"] },
      { day: "2026-11-18", photos: ["d"], all: ["d", "e"] },
    ]);
    expect(firstPhotos(groups, 3)).toHaveLength(1);
    expect(firstPhotos(groups, 100).flatMap((g) => g.photos)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(firstPhotos(groups, 0)).toEqual([]);
    expect(PHOTO_PAGE).toBeGreaterThanOrEqual(24);
  });
});
