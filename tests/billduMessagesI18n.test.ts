// The Billdu routes answer in English; Settings → Billdu and the estimate's "Send to Billdu" show their fixed messages
// in the app's language (t(j.error)). Every fixed message a person can get there has a translation in every language.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillduError } from "@/lib/billdu/client";
import { credsErrorResponse, handleError } from "@/lib/billdu/route-helpers";
import { NOT_CONNECTED } from "@/lib/server/billduCreds";
import { ALREADY_SENDING, CLAIM_FAILED } from "@/lib/server/billduClaims";
import { PLAN_REQUIRED_MESSAGE } from "@/lib/server/planGate";
import { loadDictionary } from "@/lib/i18n/dictionaries";
import { LOCALES } from "@/lib/i18n/locales";

const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

afterEach(() => vi.restoreAllMocks());

describe("Billdu server messages are translated", () => {
  it("wrong keys, Billdu busy or down, not connected, and the send route's own refusals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messages = [
      await errorOf(handleError(new BillduError("Unauthorized", 401))),
      await errorOf(handleError(new BillduError("Too many", 429))),
      await errorOf(handleError(new Error("boom"))),
      await errorOf(credsErrorResponse(new Error("boom"))),
      NOT_CONNECTED,
      "The project needs a client name before sending to Billdu.",
      "There are no included estimate lines to send.",
      "Both API key and API secret are required.",
      "Billdu and prices are handled by the office. Ask an admin on your team.",
      "Couldn't load your Billdu connection. Try again in a minute.",
      "Couldn't save your Billdu connection. Try again in a minute.",
      "Couldn't disconnect Billdu. Try again in a minute.",
      ALREADY_SENDING,
      CLAIM_FAILED,
      PLAN_REQUIRED_MESSAGE,
    ];
    for (const { code } of LOCALES) {
      if (code === "en") continue;
      const dict = await loadDictionary(code);
      for (const m of messages) expect(dict[m], `${code}: ${m}`).toBeTruthy();
    }
  });

  it("the fixed messages listed above are the routes' own text", async () => {
    const { readFileSync } = await import("node:fs");
    const src = ["src/app/api/billdu/send/route.ts", "src/app/api/billdu/credentials/route.ts", "src/lib/server/billduCreds.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const m of ["The project needs a client name before sending to Billdu.", "There are no included estimate lines to send.", "Both API key and API secret are required.", "Billdu and prices are handled by the office. Ask an admin on your team."])
      expect(src).toContain(m);
  });
});
