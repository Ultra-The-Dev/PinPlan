// Jobs are read-only on this device too once the trial or subscription has lapsed (same rule as the database).
import { afterEach, describe, expect, it } from "vitest";
import type { TeamBilling } from "@/lib/billingLogic";
import { canEditJob, READ_ONLY_MESSAGE, ReadOnlyError, useSoloBilling } from "@/lib/canEdit";
import { useEditor } from "@/lib/store";
import { useTeam, type TeamState } from "@/lib/team";
import { useToasts } from "@/lib/toast";

const NOW = new Date("2026-11-19T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const billing = (p: Partial<TeamBilling> = {}): TeamBilling => ({
  status: "trialing",
  trialEndsAt: inDays(10),
  currentPeriodEnd: null,
  seatLimit: null,
  members: 2,
  canWork: true,
  hasSubscription: false,
  billingEmail: null,
  ...p,
});
const base: TeamState = { ready: true, userId: "u1", team: null, role: null, members: [], billing: null, needsMigration: false, error: null };
const onTeam = (b: TeamBilling | null): Partial<TeamState> => ({ team: { id: "t1", name: "Co", ownerId: "u1" }, role: "owner", billing: b });

afterEach(() => {
  useTeam.setState({ ...base, ready: false, userId: null }, true);
  useSoloBilling.setState({ userId: null, solo: null });
  useToasts.setState({ toasts: [] });
});

describe("canEditJob", () => {
  it("never locks before the team has loaded, or when signed out", () => {
    useTeam.setState({ ...base, ready: false, ...onTeam(billing({ status: "unpaid" })) }, true);
    expect(canEditJob(NOW)).toBe(true);
    useTeam.setState({ ...base, userId: null }, true);
    expect(canEditJob(NOW)).toBe(true);
  });

  it("follows the team's plan", () => {
    useTeam.setState({ ...base, ...onTeam(billing()) }, true);
    expect(canEditJob(NOW)).toBe(true);
    useTeam.setState({ ...base, ...onTeam(billing({ trialEndsAt: inDays(-1) })) }, true);
    expect(canEditJob(NOW)).toBe(false);
    useTeam.setState({ ...base, ...onTeam(billing({ trialEndsAt: inDays(-1), enforce: false })) }, true);
    expect(canEditJob(NOW)).toBe(true);
    useTeam.setState({ ...base, ...onTeam(billing({ status: "canceled", trialEndsAt: inDays(2) })) }, true);
    expect(canEditJob(NOW)).toBe(true);
    useTeam.setState({ ...base, ...onTeam(billing({ status: "canceled", trialEndsAt: inDays(-2) })) }, true);
    expect(canEditJob(NOW)).toBe(false);
    // No billing in the database: never locked.
    useTeam.setState({ ...base, ...onTeam(null) }, true);
    expect(canEditJob(NOW)).toBe(true);
  });

  it("on no team: the personal trial decides, once it has loaded for this person", () => {
    useTeam.setState(base, true);
    expect(canEditJob(NOW)).toBe(true); // not loaded yet
    useSoloBilling.setState({ userId: "u1", solo: { trialEndsAt: inDays(-1), enforce: true } });
    expect(canEditJob(NOW)).toBe(false);
    useSoloBilling.setState({ userId: "someone-else", solo: { trialEndsAt: inDays(-1), enforce: true } });
    expect(canEditJob(NOW)).toBe(true);
    useSoloBilling.setState({ userId: "u1", solo: { trialEndsAt: null, enforce: true } }); // from before launch
    expect(canEditJob(NOW)).toBe(true);
    useSoloBilling.setState({ userId: "u1", solo: { trialEndsAt: inDays(-1), enforce: false } });
    expect(canEditJob(NOW)).toBe(true);
  });
});

describe("the editor refuses changes while read-only", () => {
  it("commit() throws ReadOnlyError, shows the toast, and changes nothing", async () => {
    useTeam.setState({ ...base, ...onTeam(billing({ status: "unpaid" })) }, true);
    useEditor.setState({ past: [], future: [] });
    const before = useEditor.getState().markers;
    const marker = { id: "m1", projectId: "p1", sheetId: "s1", deviceTypeId: "cam", x: 0.5, y: 0.5 };
    await expect(useEditor.getState().commit([{ table: "markers", before: null, after: marker as never }])).rejects.toBeInstanceOf(ReadOnlyError);
    expect(useEditor.getState().markers).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useToasts.getState().toasts.map((t) => [t.kind, t.text])).toEqual([["error", READ_ONLY_MESSAGE]]);
    expect(READ_ONLY_MESSAGE).toMatch(/view and export/);
    expect(READ_ONLY_MESSAGE).toMatch(/Settings → Billing/);
  });
});
