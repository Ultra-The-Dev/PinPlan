// The iPad app's built-in form templates come from src/lib/forms/builtins.ts so the two apps can't drift:
//   tests/fixtures/formBuiltins.json                                   (read by FormsTests.swift, which checks equality)
//   ios/PinPlanCore/Sources/PinPlanCore/FormBuiltinsData.swift        (the same JSON, embedded in the app)
// This test fails when either is out of date; regenerate with:  UPDATE_SWIFT=1 npx vitest run tests/formsSwift.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORM_BUILTINS } from "@/lib/forms/builtins";

const FIXTURE = path.resolve(__dirname, "fixtures/formBuiltins.json");
const SWIFT = path.resolve(__dirname, "../ios/PinPlanCore/Sources/PinPlanCore/FormBuiltinsData.swift");

export const builtinsJson = () => JSON.stringify(FORM_BUILTINS, null, 2) + "\n";

export function renderFormsSwift(): string {
  return `// GENERATED from src/lib/forms/builtins.ts by tests/formsSwift.test.ts — do not edit by hand.
// Regenerate: UPDATE_SWIFT=1 npx vitest run tests/formsSwift.test.ts
// swiftlint:disable all

let formBuiltinsJSON = #"""
${builtinsJson().trimEnd()}
"""#
`;
}

describe("iPad form templates", () => {
  it("formBuiltins.json and FormBuiltinsData.swift are generated from builtins.ts", () => {
    if (process.env.UPDATE_SWIFT) {
      writeFileSync(FIXTURE, builtinsJson());
      writeFileSync(SWIFT, renderFormsSwift());
    }
    expect(readFileSync(FIXTURE, "utf8")).toBe(builtinsJson());
    expect(readFileSync(SWIFT, "utf8")).toBe(renderFormsSwift());
  });
});
