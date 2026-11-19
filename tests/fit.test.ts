import { describe, expect, it } from "vitest";
import { containRect } from "@/lib/fit";

describe("containRect", () => {
  it("letterboxes a landscape photo in a tall (phone) box", () => {
    expect(containRect(375, 600, 4 / 3)).toEqual({ x: 0, y: (600 - 281.25) / 2, w: 375, h: 281.25 });
  });
  it("pillarboxes a portrait photo in a wide box", () => {
    expect(containRect(1000, 600, 3 / 4)).toEqual({ x: (1000 - 450) / 2, y: 0, w: 450, h: 600 });
  });
  it("fills a box of the same shape", () => {
    expect(containRect(400, 300, 4 / 3)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it("falls back to the whole box for a missing size", () => {
    expect(containRect(400, 300, NaN)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(containRect(400, 300, Infinity)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(containRect(400, 300, 0)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});
