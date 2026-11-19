import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/renderSheet", () => ({ renderSheet: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

const { linkFolder, removeLinkFiles } = await import("@/lib/proposalCloud");

function fakeBucket(files: { name: string; id?: string | null }[]) {
  const removed: string[][] = [];
  const listed: string[] = [];
  return {
    removed,
    listed,
    list: async (path: string) => {
      listed.push(path);
      return { data: files, error: null };
    },
    remove: async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    },
  };
}

describe("withdrawn link files", () => {
  it("knows where proposal and photo report images live", () => {
    expect(linkFolder("u1", "tok_aaaaaaaaaaaaaaaaaaaa", "proposal")).toBe("u1/tok_aaaaaaaaaaaaaaaaaaaa");
    expect(linkFolder("u1", "rep_aaaaaaaaaaaaaaaaaaaa", "report")).toBe("u1/reports/rep_aaaaaaaaaaaaaaaaaaaa");
  });

  it("deletes every file in the link's folder", async () => {
    const b = fakeBucket([{ name: "s1.jpg", id: "a" }, { name: "s2.jpg", id: "b" }]);
    expect(await removeLinkFiles(b, "u1/tok_aaaaaaaaaaaaaaaaaaaa")).toBe(2);
    expect(b.listed).toEqual(["u1/tok_aaaaaaaaaaaaaaaaaaaa"]);
    expect(b.removed).toEqual([["u1/tok_aaaaaaaaaaaaaaaaaaaa/s1.jpg", "u1/tok_aaaaaaaaaaaaaaaaaaaa/s2.jpg"]]);
  });

  it("skips sub-folders and placeholders", async () => {
    const b = fakeBucket([{ name: "nested", id: null }, { name: ".emptyFolderPlaceholder", id: "x" }, { name: "p1.jpg", id: "c" }]);
    expect(await removeLinkFiles(b, "u1/reports/rep_aaaaaaaaaaaaaaaaaaaa")).toBe(1);
    expect(b.removed).toEqual([["u1/reports/rep_aaaaaaaaaaaaaaaaaaaa/p1.jpg"]]);
  });

  it("never touches a whole user folder or a malformed path", async () => {
    for (const folder of ["u1", "u1/", "", "u1/a/b/c", "../u2/tok"]) {
      const b = fakeBucket([{ name: "x.jpg", id: "a" }]);
      expect(await removeLinkFiles(b, folder)).toBe(0);
      expect(b.removed).toEqual([]);
    }
  });

  it("does nothing when the folder is empty or can't be listed", async () => {
    const empty = fakeBucket([]);
    expect(await removeLinkFiles(empty, "u1/tok_aaaaaaaaaaaaaaaaaaaa")).toBe(0);
    const failing = { list: async () => ({ data: null, error: { message: "denied" } }), remove: vi.fn() };
    expect(await removeLinkFiles(failing, "u1/tok_aaaaaaaaaaaaaaaaaaaa")).toBe(0);
    expect(failing.remove).not.toHaveBeenCalled();
  });
});
