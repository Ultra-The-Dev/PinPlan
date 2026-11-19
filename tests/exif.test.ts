import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readExif } from "@/lib/exif";

describe("EXIF", () => {
  it("reads GPS and the time a photo was taken", () => {
    const b = readFileSync(path.join(__dirname, "fixtures/gps-photo.jpg"));
    const info = readExif(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    expect(info.lat).toBeCloseTo(40.7484, 3);
    expect(info.lng).toBeCloseTo(-73.9857, 3);
    const d = new Date(info.takenAt!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 19, 14, 3]);
  });

  it("returns nothing for non-JPEG or EXIF-less data", () => {
    expect(readExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({});
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({});
  });
});
