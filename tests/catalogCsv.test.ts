import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog";
import { applyPriceList, catalogToCsv, parseCsv } from "@/lib/catalogCsv";

describe("price list CSV", () => {
  const catalog = seedCatalog();

  it("round-trips: export then import changes nothing", () => {
    const r = applyPriceList(catalogToCsv(catalog), catalog);
    expect(r.updated).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
    expect(r.unmatched).toHaveLength(0);
  });

  it("parses quotes, commas and semicolon-separated files", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("name;price\nTV;1.299,50\n")).toEqual([["name", "price"], ["TV", "1.299,50"]]);
  });

  it("updates prices matched by id or by name, with $ signs and thousands separators", () => {
    const csv = "id,name,price,labor\ncam-indoor,,$249.00,120\n,in-ceiling speaker,\"1,189\",\n";
    const r = applyPriceList(csv, catalog);
    expect(r.errors).toEqual([]);
    const cam = r.updated.find((t) => t.id === "cam-indoor")!;
    expect([cam.unitPrice, cam.laborPrice]).toEqual([249, 120]);
    const spk = r.updated.find((t) => t.id === "speaker")!;
    expect(spk.unitPrice).toBe(1189);
    expect(spk.laborPrice).toBe(0);
  });

  it("reports bad numbers and unknown items, and can create new types", () => {
    const csv = "name,category,unit,price,labor\nIndoor camera,security,each,abc,\nDoorbell camera,security,each,199,60\nGarage LED,lighting,LF,12,4\nMystery,nowhere,each,1,1\n";
    const r = applyPriceList(csv, catalog, { createMissing: true, newId: (() => { let i = 0; return () => `n${i++}`; })() });
    expect(r.errors[0]).toMatch(/Line 2/);
    expect(r.created.map((t) => [t.name, t.unit, t.kind, t.unitPrice])).toEqual([
      ["Doorbell camera", "each", "device", 199],
      ["Garage LED", "LF", "led", 12],
    ]);
    expect(r.unmatched).toEqual(["Mystery"]);
  });

  it("rejects files without a name/id or price column", () => {
    expect(applyPriceList("foo,bar\n1,2\n", catalog).errors[0]).toMatch(/id or name/);
    expect(applyPriceList("name,notes\nTV,x\n", catalog).errors[0]).toMatch(/price or labor/);
  });
});
