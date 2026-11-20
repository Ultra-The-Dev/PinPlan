import { describe, expect, it } from "vitest";
import { fmtPct, roundPct } from "@/lib/percent";

describe("percentages", () => {
  it("keep and show at most three decimals (NYC 8.875% stays exact)", () => {
    expect(roundPct(8.875)).toBe(8.875);
    expect(fmtPct(8.875)).toBe("8.875");
    expect(fmtPct(8.87549)).toBe("8.875");
    expect(fmtPct(8.875000000001)).toBe("8.875");
    expect(fmtPct(8.5)).toBe("8.5");
    expect(fmtPct(8)).toBe("8");
    expect(fmtPct(0.1 + 0.2)).toBe("0.3");
    expect(fmtPct(null)).toBe("0");
    expect(roundPct(Number.NaN)).toBe(0);
  });
});
