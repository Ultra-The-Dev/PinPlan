// GET /api/cron/billing-reminders: trial reminders at 3 days and 1 day left, each sent once.
// Supabase REST and Resend are a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "https://sb.example.co";
const DAY = 86_400_000;

interface Team {
  id: string;
  name: string;
  owner_id: string;
  plan_status: string;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
  billing_email: string | null;
  trial_reminder_3d_at: string | null;
  trial_reminder_1d_at: string | null;
  [k: string]: unknown;
}

describe("trial reminders cron", () => {
  let teams: Team[];
  let enforce: boolean;
  let emails: { to: string[]; subject: string; key: string | null }[];
  let resendStatus: number;

  const team = (id: string, daysLeft: number, p: Partial<Team> = {}): Team => ({
    id,
    name: `Co ${id}`,
    owner_id: `owner-${id}`,
    plan_status: "trialing",
    trial_ends_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
    stripe_subscription_id: null,
    billing_email: null,
    trial_reminder_3d_at: null,
    trial_reminder_1d_at: null,
    ...p,
  });
  const run = async (auth = "Bearer cron-secret") => {
    const { GET } = await import("@/app/api/cron/billing-reminders/route");
    return GET(new Request("https://app.example.com/api/cron/billing-reminders", { headers: auth ? { Authorization: auth } : {} }));
  };

  beforeEach(() => {
    vi.resetModules();
    enforce = true;
    emails = [];
    resendStatus = 200;
    teams = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("STRIPE_PRICE_BASE", "price_base");
    vi.stubEnv("STRIPE_PRICE_SEAT", "price_seat");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Northpin <billing@example.com>");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = decodeURIComponent(String(input instanceof Request ? input.url : input));
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        if (url === "https://api.resend.com/emails") {
          if (resendStatus !== 200) return Response.json({ name: "application_error" }, { status: resendStatus });
          const b = JSON.parse(String(init!.body));
          emails.push({ to: b.to, subject: b.subject, key: headers.get("idempotency-key") });
          return Response.json({ id: `em_${emails.length}` });
        }
        if (headers.get("authorization") !== "Bearer service-key") return new Response("no", { status: 401 });
        if (url.startsWith(`${SB}/rest/v1/billing_settings`)) return Response.json([{ enforce }]);
        if (url.startsWith(`${SB}/rest/v1/team_members?team_id=`)) {
          const id = /team_id=eq\.([^&]+)/.exec(url)![1];
          return Response.json([{ email: `owner@${id}.test`, name: "Olive" }]);
        }
        if (url.startsWith(`${SB}/rest/v1/teams?`)) {
          if (method === "GET") {
            // The cron's query: trialing, no subscription, ends within 3 days, a reminder still to send.
            const now = Date.now();
            return Response.json(
              teams.filter((t) => {
                const end = t.trial_ends_at ? new Date(t.trial_ends_at).getTime() : 0;
                return t.plan_status === "trialing" && !t.stripe_subscription_id && end > now && end <= now + 3 * DAY && (!t.trial_reminder_3d_at || !t.trial_reminder_1d_at);
              }),
            );
          }
          const id = /id=eq\.([^&]+)/.exec(url)![1];
          const t = teams.find((x) => x.id === id)!;
          // Claim filters: <col>=is.null / <col>=eq.<stamp>
          for (const m of url.matchAll(/(trial_reminder_[13]d_at)=(is\.null|eq\.([^&]+))/g)) {
            if (m[2] === "is.null" && t[m[1]] != null) return Response.json([]);
            if (m[3] && t[m[1]] !== m[3]) return Response.json([]);
          }
          Object.assign(t, JSON.parse(String(init!.body)));
          return Response.json([{ id }]);
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("needs the cron secret", async () => {
    expect((await run("")).status).toBe(401);
    expect((await run("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await run()).status).toBe(501);
    expect(emails).toHaveLength(0);
  });

  it("sends the 3-day and the 1-day reminder once each", async () => {
    teams = [team("a", 2.5), team("b", 0.5), team("c", 10), team("d", 2, { stripe_subscription_id: "sub_1" }), team("e", 2, { billing_email: "pay@e.test" })];
    const r = await run();
    expect(await r.json()).toMatchObject({ ok: true, sent: 3 });
    expect(emails.map((e) => e.key).sort()).toEqual(["pinplan-trial-1d-b", "pinplan-trial-3d-a", "pinplan-trial-3d-e"]);
    expect(emails.find((e) => e.key === "pinplan-trial-3d-a")).toMatchObject({ to: ["owner@a.test"], subject: "Your Northpin trial ends in 3 days" });
    expect(emails.find((e) => e.key === "pinplan-trial-3d-e")!.to).toEqual(["pay@e.test"]);
    expect(emails.find((e) => e.key === "pinplan-trial-1d-b")!.subject).toBe("Your Northpin trial ends tomorrow");
    // The 1-day reminder also marks the 3-day one.
    expect(teams[1].trial_reminder_3d_at).not.toBeNull();
    // A rerun the same day sends nothing.
    expect(await (await run()).json()).toMatchObject({ sent: 0 });
    expect(emails).toHaveLength(3);
    // Two days later team a is at half a day left: the 1-day reminder.
    teams[0].trial_ends_at = new Date(Date.now() + 0.5 * DAY).toISOString();
    expect(await (await run()).json()).toMatchObject({ sent: 1 });
    expect(emails.at(-1)!.key).toBe("pinplan-trial-1d-a");
  });

  it("a failed send is given back for the next run", async () => {
    teams = [team("a", 2.5)];
    resendStatus = 500;
    expect(await (await run()).json()).toMatchObject({ sent: 0, results: { failed: 1 } });
    expect(teams[0].trial_reminder_3d_at).toBeNull();
    resendStatus = 200;
    expect(await (await run()).json()).toMatchObject({ sent: 1 });
  });

  it("sends nothing while billing isn't enforced, or without email set up", async () => {
    teams = [team("a", 2.5)];
    enforce = false;
    expect(await (await run()).json()).toMatchObject({ skipped: "not_enforced", sent: 0 });
    enforce = true;
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await run()).status).toBe(501);
    expect(emails).toHaveLength(0);
  });

  it("is scheduled daily in vercel.json", async () => {
    const { readFileSync } = await import("node:fs");
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    const cron = cfg.crons.find((c) => c.path === "/api/cron/billing-reminders")!;
    expect(cron.schedule.split(" ")).toHaveLength(5);
    expect(cron.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
