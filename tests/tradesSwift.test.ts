// The iPad app's trade packs (ios/PinPlanCore/Sources/PinPlanCore/TradePacksData.swift) are generated from
// src/lib/trades.ts so the two apps can't drift. This test fails when the Swift file is out of date;
// regenerate with:  UPDATE_SWIFT=1 npx vitest run tests/tradesSwift.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRADE_PACKS, type TradeSeed } from "@/lib/trades";
import type { ChecklistTemplate } from "@/lib/types";

const FILE = path.resolve(__dirname, "../ios/PinPlanCore/Sources/PinPlanCore/TradePacksData.swift");

const q = (s: string) => JSON.stringify(s); // a JSON string is a valid Swift string literal for this text
const num = (n: number | undefined) => (n == null ? "nil" : Number.isInteger(n) ? `${n}` : `${n}`);
const dict = (r: Record<string, number>) => (Object.keys(r).length ? `[${Object.entries(r).map(([k, v]) => `${q(k)}: ${num(v)}`).join(", ")}]` : "[:]");

function seed(s: TradeSeed): string {
  return `TradeSeed(id: ${q(s.id)}, name: ${q(s.name)}, category: .${s.category}, symbol: ${q(s.symbol)}, abbrev: ${q(s.abbrev)}, shape: .${s.shape}, color: ${q(s.color)}, unit: .${s.unit}, defaultWire: ${q(s.defaultWire)}, defaultMount: .${s.defaultMount}, kind: .${s.kind}, unitPrice: ${num(s.unitPrice)}, laborPrice: ${num(s.laborPrice)}, description: ${s.description ? q(s.description) : "nil"}, va: ${num(s.va)}, breakerA: ${num(s.breakerA)}, volts: ${num(s.volts)}, poles: ${num(s.poles)})`;
}

function template(t: ChecklistTemplate): string {
  const items = t.items.map((i) => `(${q(i.text)}, ${i.requiresPhoto ? "true" : "false"})`).join(",\n                ");
  return `FieldDocs.Template(id: ${q(t.id)}, name: ${q(t.name)}, items: [\n                ${items},\n            ])`;
}

export function renderTradesSwift(): string {
  const packs = TRADE_PACKS.map((p) => {
    const lv = p.id === "lowvoltage";
    return `        TradePack(
            id: .${p.id}, name: ${q(p.name)}, short: ${q(p.short)},
            description: ${q(p.description)},
            examples: ${q(p.examples)}, color: ${q(p.color)},
            categories: [${p.categories.map((c) => `.init(id: .${c.id}, name: ${q(c.name)})`).join(", ")}],
            closets: [${p.closets.map((k) => `.${k === "switch" ? "`switch`" : k}`).join(", ")}],
            run: .init(one: ${q(p.run.one)}, many: ${q(p.run.many)}, hint: ${q(p.run.hint)}), closetNoun: ${q(p.closetNoun)}, wireNoun: ${q(p.wireNoun)},
            wireTypes: [${p.wireTypes.map(q).join(", ")}],
            wirePrices: ${dict(p.wirePrices)},
            catalog: ${lv ? "Catalog.seed().map(TradeSeed.init(lowVoltage:))" : `[\n                ${p.catalog.map(seed).join(",\n                ")},\n            ]`},
            checklists: ${lv ? 'FieldDocs.templates.filter { $0.id != "punch" }' : `[\n            ${p.checklists.map(template).join(",\n            ")},\n            ]`},
            scanHint: ${q(p.scanHint)}
        )`;
  });
  return `// GENERATED from src/lib/trades.ts by tests/tradesSwift.test.ts — do not edit by hand.
// Regenerate: UPDATE_SWIFT=1 npx vitest run tests/tradesSwift.test.ts
// swiftlint:disable all

extension Trades {
    public static let packs: [TradePack] = [
${packs.join(",\n")},
    ]
}
`;
}

describe("iPad trade packs", () => {
  it("TradePacksData.swift is generated from trades.ts", () => {
    const want = renderTradesSwift();
    if (process.env.UPDATE_SWIFT) writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });
});
