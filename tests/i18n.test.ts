import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpolate, normalizeKey, placeholders, pluralCategory, translate, translatePlural } from "@/lib/i18n/core";
import { localeFromLanguages } from "@/lib/i18n/locales";
import { localeOnAuth } from "@/lib/i18n/account";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { RU_AREAS } from "@/lib/i18n/ru";
import type { Dictionary } from "@/lib/i18n/types";
import * as i18n from "@/lib/i18n";
import { checkDictionaries, extractKeys, scanSources } from "../scripts/check-i18n.mjs";

const dict: Dictionary = {
  "New job": "Новый объект",
  "Hello {name}": "Здравствуйте, {name}",
  "{n} device": { one: "{n} устройство", few: "{n} устройства", many: "{n} устройств", other: "{n} устройства" },
  "{n} device on {sheet}": { one: "{n} устройство на листе {sheet}", few: "{n} устройства на листе {sheet}", many: "{n} устройств на листе {sheet}" },
  Empty: "",
};

describe("core", () => {
  it("interpolates named placeholders and leaves unknown ones visible", () => {
    expect(interpolate("Hi {name}, {n} left", { name: "Ann", n: 3 })).toBe("Hi Ann, 3 left");
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
    expect(interpolate("Hi {name}")).toBe("Hi {name}");
    expect(placeholders("{b} and {a} and {b}")).toEqual(["a", "b"]);
  });

  it("translates, and falls back to the English key", () => {
    expect(translate(dict, "ru", "New job")).toBe("Новый объект");
    expect(translate(dict, "ru", "Hello {name}", { name: "Иван" })).toBe("Здравствуйте, Иван");
    expect(translate(dict, "ru", "Not translated {x}", { x: 1 })).toBe("Not translated 1");
    expect(translate(dict, "ru", "Empty")).toBe("Empty");
    // Object.prototype names are not translations.
    expect(translate(dict, "ru", "constructor")).toBe("constructor");
    expect(translate({}, "en", "New job")).toBe("New job");
  });

  it("uses Russian plural categories", () => {
    const cases: [number, string][] = [
      [1, "one"], [21, "one"], [101, "one"],
      [2, "few"], [3, "few"], [4, "few"], [22, "few"], [34, "few"],
      [0, "many"], [5, "many"], [11, "many"], [12, "many"], [14, "many"], [25, "many"], [111, "many"],
    ];
    for (const [n, cat] of cases) expect(pluralCategory("ru", n), String(n)).toBe(cat);
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
  });

  it("tn picks the right Russian form", () => {
    const tn = (n: number) => translatePlural(dict, "ru", "{n} device", "{n} devices", n);
    expect(tn(1)).toBe("1 устройство");
    expect(tn(21)).toBe("21 устройство");
    expect(tn(3)).toBe("3 устройства");
    expect(tn(5)).toBe("5 устройств");
    expect(tn(11)).toBe("11 устройств");
    expect(tn(1.5)).toBe("1.5 устройства"); // fractions → "other"
    expect(translatePlural(dict, "ru", "{n} device on {sheet}", "{n} devices on {sheet}", 2, { sheet: "E1" })).toBe("2 устройства на листе E1");
  });

  it("tn falls back to English one/other", () => {
    expect(translatePlural(dict, "ru", "{n} job", "{n} jobs", 1)).toBe("1 job");
    expect(translatePlural(dict, "ru", "{n} job", "{n} jobs", 5)).toBe("5 jobs");
    expect(translatePlural({}, "en", "{n} device", "{n} devices", 0)).toBe("0 devices");
    expect(translatePlural({}, "en", "{n} device", "{n} devices", 1)).toBe("1 device");
  });

  it("t() on a plural entry uses vars.n", () => {
    expect(translate(dict, "ru", "{n} device", { n: 4 })).toBe("4 устройства");
  });

  it("normalizes <T> children", () => {
    expect(normalizeKey("\n  Plans, counts,\n    quotes  ")).toBe("Plans, counts, quotes");
  });

  it("detects Russian from the browser languages", () => {
    expect(localeFromLanguages(["ru-RU", "en-US"])).toBe("ru");
    expect(localeFromLanguages(["RU"])).toBe("ru");
    expect(localeFromLanguages(["de-DE", "ru"])).toBe("ru");
    expect(localeFromLanguages(["en-GB", "ru"])).toBe("en");
    expect(localeFromLanguages(["uk-UA"])).toBe("en");
    expect(localeFromLanguages([])).toBe("en");
    expect(localeFromLanguages(undefined)).toBe("en");
  });
});

describe("active language and persistence", () => {
  let store: Record<string, string>;
  const doc = { documentElement: { lang: "en" } };
  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    });
  });
  afterEach(() => {
    i18n.setLocale("en", { remember: false });
    vi.unstubAllGlobals();
  });

  it("starts in English on the server", () => {
    expect(i18n.useLocaleStore.getInitialState().locale).toBe("en");
  });

  it("follows the browser when nothing is saved", () => {
    vi.stubGlobal("navigator", { languages: ["ru-RU"], language: "ru-RU" });
    i18n.initLocale();
    expect(i18n.getLocale()).toBe("ru");
    expect(doc.documentElement.lang).toBe("ru");
    expect(store["pinplan.lang"]).toBeUndefined(); // detection is not a choice
  });

  it("saves the choice under pinplan.lang and prefers it over the browser", () => {
    i18n.setLocale("ru");
    expect(store["pinplan.lang"]).toBe("ru");
    expect(i18n.t("Settings")).toBe("Настройки");
    expect(i18n.t("Not in any dictionary")).toBe("Not in any dictionary");
    i18n.setLocale("en", { remember: false });
    i18n.initLocale();
    expect(i18n.getLocale()).toBe("ru");
    expect(doc.documentElement.lang).toBe("ru");
  });

  it("ignores garbage and survives blocked storage", () => {
    store["pinplan.lang"] = "xx";
    expect(i18n.storedLocale()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(i18n.storedLocale()).toBeNull();
    expect(() => i18n.setLocale("ru")).not.toThrow();
    expect(i18n.getLocale()).toBe("ru");
  });

  it("makeT binds a language", () => {
    const t = i18n.makeT("ru");
    expect(t("Sign out")).toBe("Выйти");
    expect(t.locale).toBe("ru");
    expect(t.tn("{n} job", "{n} jobs", 2)).toBe("2 jobs");
  });

  it("formats with the active language and keeps the currency", () => {
    const d = new Date(Date.UTC(2026, 10, 20, 12));
    expect(i18n.fmtDate(d, { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }, "en")).toBe("November 20, 2026");
    expect(i18n.fmtDate(d, { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }, "ru")).toBe("20 ноября 2026 г.");
    expect(i18n.fmtDate("not a date")).toBe("");
    expect(i18n.fmtNumber(1234.5, undefined, "en")).toBe("1,234.5");
    expect(i18n.fmtNumber(1234.5, undefined, "ru").replace(/\s/g, " ")).toBe("1 234,5");
    expect(i18n.fmtCurrency(1234.5, "USD", undefined, "en")).toBe("$1,234.50");
    expect(i18n.fmtCurrency(1234.5, "USD", undefined, "ru").replace(/\s/g, " ")).toBe("1 234,50 $");
    expect(i18n.fmtCurrency(10, "NOPE", undefined, "en")).toBe("10.00 NOPE");
    i18n.setLocale("ru", { remember: false });
    expect(i18n.fmtCurrency(5, "EUR").replace(/\s/g, " ")).toBe("5,00 €");
  });
});

describe("account language", () => {
  it("applies the account language on a real sign-in", () => {
    expect(localeOnAuth({ event: "SIGNED_IN", accountLang: "ru", deviceChoice: "en", current: "en" })).toEqual({ apply: "ru", save: null });
    expect(localeOnAuth({ event: "SIGNED_IN", accountLang: "ru", deviceChoice: null, current: "ru" })).toEqual({ apply: null, save: null });
  });
  it("on reload only fills in when the device never chose", () => {
    expect(localeOnAuth({ event: "INITIAL_SESSION", accountLang: "ru", deviceChoice: "en", current: "en" })).toEqual({ apply: null, save: null });
    expect(localeOnAuth({ event: "INITIAL_SESSION", accountLang: "ru", deviceChoice: null, current: "en" })).toEqual({ apply: "ru", save: null });
  });
  it("gives an account without a language the device's choice", () => {
    expect(localeOnAuth({ event: "SIGNED_IN", accountLang: undefined, deviceChoice: "ru", current: "ru" })).toEqual({ apply: null, save: "ru" });
    expect(localeOnAuth({ event: "SIGNED_IN", accountLang: "klingon", deviceChoice: null, current: "en" })).toEqual({ apply: null, save: null });
  });
});

describe("dictionaries and checker", () => {
  it("merges every area into the Russian dictionary", () => {
    const n = Object.values(RU_AREAS).reduce((s, d) => s + Object.keys(d).length, 0);
    expect(Object.keys(DICTIONARIES.ru).length).toBeLessThanOrEqual(n);
    expect(DICTIONARIES.ru["Settings"]).toBe("Настройки");
    expect(Object.keys(DICTIONARIES.en)).toHaveLength(0);
  });

  it("extracts t / tn / msg / <T> literals", () => {
    const src = `
      const a = t("New job");
      const b = t('It\\'s {n}', { n });
      const c = t.tn("{n} device", "{n} devices", n);
      const d = tn(
        "{n} job",
        "{n} jobs", n);
      const e = msg("Pricing");
      x.t("not mine"); format("nope"); const t2 = it("also not");
      <T>
        Plans, counts &amp; quotes
      </T>
      <T vars={{ name }}>{"Hi {name}"}</T>
      <T>{label}</T>
    `;
    const keys = extractKeys(src).map((k: { key: string; other?: string; kind: string }) => [k.kind, k.key, k.other]);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["t", "New job", undefined],
        ["t", "It's {n}", undefined],
        ["tn", "{n} device", "{n} devices"],
        ["tn", "{n} job", "{n} jobs"],
        ["msg", "Pricing", undefined],
        ["T", "Plans, counts & quotes", undefined],
        ["T", "Hi {name}", undefined],
      ]),
    );
    expect(keys).toHaveLength(7);
  });

  it("fails on placeholder mismatches, missing plural forms and conflicting areas", () => {
    const used = new Map([
      ["{n} device", { files: new Set(["a.tsx:1"]), plural: "{n} devices" }],
      ["{n} pin", { files: new Set(["a.tsx:2"]), plural: "{count} pins" }],
      ["Missing", { files: new Set(["b.tsx:3"]) }],
      ["Hi {name}", { files: new Set(["c.tsx:1"]) }],
    ]);
    const { errors, missing, unused } = checkDictionaries(
      {
        a: { "Hi {name}": "Привет, {имя}", "{n} device": { one: "{n} устройство", few: "{n} устройства" }, Same: "Одно" },
        b: { Same: "Другое" },
      },
      used,
    );
    expect(errors.join("\n")).toMatch(/Hi \{name\}.*placeholders/);
    expect(errors.join("\n")).toMatch(/needs "many"/);
    expect(errors.join("\n")).toMatch(/Same.*different translation/);
    expect(errors.join("\n")).toMatch(/\{n\} pin.*different placeholders/);
    expect(missing.map((m: { key: string }) => m.key)).toEqual(["{n} pin", "Missing"]);
    expect(unused).toContain('a.ts "Same"'.replace("a.ts", "ru/a.ts"));
  });

  it("the real Russian dictionaries pass the checker", () => {
    const { errors } = checkDictionaries(RU_AREAS, scanSources());
    expect(errors).toEqual([]);
  });
});
