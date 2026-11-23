import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultJobTab, isJobTab, JOB_TABS, jobHref, LEGACY_TABS, phoneTabs, resolveJobTab, switchTabQuery, withParam } from "@/lib/tabRoutes";

const q = (s: string) => Object.fromEntries(new URLSearchParams(s));

describe("resolveJobTab", () => {
  it("has the seven tabs in order", () => {
    expect([...JOB_TABS]).toEqual(["overview", "plan", "takeoff", "tasks", "photos", "money", "field"]);
  });

  it("keeps every tab as it is", () => {
    for (const t of JOB_TABS) {
      const r = resolveJobTab(`id=p1&tab=${t}`, true);
      expect(r.tab).toBe(t);
      expect(r.redirect).toBe(false);
      expect(q(r.query)).toEqual({ id: "p1", tab: t });
    }
  });

  it("maps every old tab id to the new tab and sub-view", () => {
    const want: Record<string, Record<string, string>> = {
      sheets: { tab: "plan", manage: "1" },
      estimate: { tab: "money", step: "pricing" },
      billing: { tab: "money", step: "quote" },
      changes: { tab: "money", step: "changes" },
      crew: { tab: "takeoff", view: "wiring" },
      info: { tab: "overview" },
    };
    expect(Object.keys(LEGACY_TABS).sort()).toEqual(Object.keys(want).sort());
    for (const [old, params] of Object.entries(want)) {
      const r = resolveJobTab(`id=p1&tab=${old}`, true);
      expect(r.redirect).toBe(true);
      expect(r.tab).toBe(params.tab);
      expect(q(r.query)).toEqual({ id: "p1", ...params });
    }
  });

  it("keeps the other params of an old link (invoice, photo, task)", () => {
    expect(q(resolveJobTab("id=p1&tab=billing&doc=d9", true).query)).toEqual({ id: "p1", tab: "money", step: "quote", doc: "d9" });
    expect(q(resolveJobTab("id=p1&tab=photos&photo=ph2", true).query)).toEqual({ id: "p1", tab: "photos", photo: "ph2" });
  });

  it("sends the old Field sections for tasks and photos to their own tabs", () => {
    const tasks = resolveJobTab("id=p1&tab=field&section=tasks&tf=&task=t1", true);
    expect(tasks.redirect).toBe(true);
    expect(q(tasks.query)).toEqual({ id: "p1", tab: "tasks", tf: "", task: "t1" });
    // My Tasks links had no section: a task or task filter meant the task list.
    expect(q(resolveJobTab("id=p1&tab=field&tf=&task=t1", true).query)).toEqual({ id: "p1", tab: "tasks", tf: "", task: "t1" });
    expect(q(resolveJobTab("id=p1&tab=field&tf=s:open", false).query)).toEqual({ id: "p1", tab: "tasks", tf: "s:open" });
    const photos = resolveJobTab("id=p1&tab=field&section=photos&photo=ph2", false);
    expect(photos.redirect).toBe(true);
    expect(q(photos.query)).toEqual({ id: "p1", tab: "photos", photo: "ph2" });
    // Other Field sections stay.
    expect(q(resolveJobTab("id=p1&tab=field&section=logs", true).query)).toEqual({ id: "p1", tab: "field", section: "logs" });
    expect(resolveJobTab("id=p1&tab=field&section=logs", true).redirect).toBe(false);
  });

  it("doesn't override a sub-view the link already names", () => {
    expect(q(resolveJobTab("id=p1&tab=sheets&manage=0", true).query).manage).toBe("0");
  });

  it("opens the plan for everyone", () => {
    expect(defaultJobTab()).toEqual({ tab: "plan", params: {} });
    const office = resolveJobTab("id=p1", true);
    expect(office.tab).toBe("plan");
    expect(office.redirect).toBe(true);
    const tech = resolveJobTab("id=p1", false);
    expect(q(tech.query)).toEqual({ id: "p1", tab: "plan" });
    expect(resolveJobTab("id=p1&tab=nonsense", true).tab).toBe("plan");
  });

  it("never opens Money for technicians, even from old links", () => {
    for (const t of ["money", "estimate", "billing", "changes"]) {
      const r = resolveJobTab(`id=p1&tab=${t}&step=quote`, false);
      expect(r.tab).toBe("plan");
      expect(r.redirect).toBe(true);
      expect(q(r.query).step).toBeUndefined();
    }
    // Everything else stays open to them.
    for (const t of ["overview", "plan", "takeoff", "tasks", "photos", "field"]) expect(resolveJobTab(`id=p1&tab=${t}`, false).tab).toBe(t);
  });
});

describe("phone bottom bar", () => {
  it("office: Plan · Tasks · Photos · Money · More (Overview, Takeoff, Field)", () => {
    expect(phoneTabs(true)).toEqual({ bar: ["plan", "tasks", "photos", "money"], more: ["overview", "takeoff", "field"] });
  });
  it("technicians: Plan · Tasks · Photos · Field · More (Overview, Takeoff), never Money", () => {
    expect(phoneTabs(false)).toEqual({ bar: ["plan", "tasks", "photos", "field"], more: ["overview", "takeoff"] });
  });
  it("every tab is in the bar or under More, once", () => {
    for (const office of [true, false]) {
      const { bar, more } = phoneTabs(office);
      const all = [...bar, ...more].sort();
      expect(new Set(all).size).toBe(all.length);
      expect(all).toEqual(JOB_TABS.filter((t) => office || t !== "money").sort());
    }
  });
});

describe("tab links", () => {
  it("builds job links", () => {
    expect(jobHref("p 1", "plan", { manage: "1", x: null })).toBe("/project?id=p+1&tab=plan&manage=1");
  });

  it("switching tab drops the old tab's sub-view but keeps the job", () => {
    expect(q(switchTabQuery("id=p1&tab=money&step=quote&doc=d1", "field"))).toEqual({ id: "p1", tab: "field" });
    expect(q(switchTabQuery("id=p1&tab=photos&device=m1&photo=x", "money", { step: "invoices" }))).toEqual({ id: "p1", tab: "money", step: "invoices" });
    expect(q(withParam("id=p1&tab=takeoff&view=wiring", "view", null))).toEqual({ id: "p1", tab: "takeoff" });
  });
});

// Every `?tab=` written in the app (links, router pushes, emails, the job-health next step) must land on a real tab.
describe("every tab link in src resolves", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(__dirname, "..", "src"));
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const literal = [...src.matchAll(/[?&]tab=([a-z]+)/g)].map((m) => m[1]);
  // `tab=${…}` built from a ternary of string literals, e.g. `tab=${review ? "takeoff" : "estimate"}`.
  const ternary = [...src.matchAll(/tab=\$\{[^}]*\?\s*"([a-z]+)"\s*:\s*"([a-z]+)"\s*\}/g)].flatMap((m) => [m[1], m[2]]);
  // The job-health next step (`tab=${s.next.tab}`) uses the JobTab ids from jobSummary.ts.
  const jobSummary = readFileSync(join(__dirname, "..", "src", "lib", "jobSummary.ts"), "utf8");
  const jobTabType = jobSummary.match(/export type JobTab =([^;]+);/)?.[1] ?? "";
  const nextStep = [...jobTabType.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  const all = [...new Set([...literal, ...ternary, ...nextStep])].sort();

  it("finds the links", () => {
    expect(literal.length).toBeGreaterThan(10);
    expect(nextStep).toContain("info");
    expect(all).toEqual(expect.arrayContaining(["billing", "estimate", "field", "plan", "sheets", "takeoff"]));
  });

  it.each(all)("tab=%s", (t) => {
    expect(isJobTab(t) || t in LEGACY_TABS).toBe(true);
    const r = resolveJobTab(`id=p1&tab=${t}`, true);
    expect(JOB_TABS).toContain(r.tab);
    // Known ids never fall back to the default tab by accident.
    if (t !== "info" && t !== "overview") expect(r.tab).not.toBe("overview");
  });
});
