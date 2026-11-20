// The public link routes sign download URLs with the service role. The rows they read image ids from are written by the
// job's own members, so a row must never steer the signature to a path outside `<this job>/<plain image name>`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobImagePath, sheetImagePath } from "@/lib/server/storagePath";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const SB = "https://sb.example.co";
const TOKEN = "abcdefghijklmnopqrstuvwx";
const T0 = "2026-11-01T10:00:00.000Z";

describe("storagePath", () => {
  it("builds <project>/<image> only from plain names", () => {
    expect(jobImagePath("p1", "img_1-a")).toBe("p1/img_1-a");
    for (const bad of ["../p2/x", "p2/x", "x/..", ".", "..", "", "a b", "a%2Fb", "x".repeat(65), 5, null])
      expect(jobImagePath("p1", bad), String(bad)).toBeNull();
    expect(jobImagePath("../p2", "img")).toBeNull();
  });

  it("takes a sheet's image_path only when it is this job's folder plus a plain name", () => {
    expect(sheetImagePath("p1", { image_id: "a", image_path: "p1/b" })).toBe("p1/b");
    // Another company's folder, or a nested path: fall back to the image id in this job.
    expect(sheetImagePath("p1", { image_id: "a", image_path: "p2/secret" })).toBe("p1/a");
    expect(sheetImagePath("p1", { image_id: "a", image_path: "p1/../p2/secret" })).toBe("p1/a");
    expect(sheetImagePath("p1", { image_id: "a", image_path: "p1/x/y" })).toBe("p1/a");
    expect(sheetImagePath("p1", { image_id: "../p2/x", image_path: "p2/x" })).toBeNull();
    expect(sheetImagePath("p1", { image_id: "a", image_path: null })).toBe("p1/a");
  });
});

describe("RFI answer link signs only this job's files", () => {
  let signed: string[][];
  let photos: Record<string, unknown>[];
  let sheets: Record<string, unknown>[];

  beforeEach(() => {
    vi.resetModules();
    signed = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const rfi = {
      id: "r1", project_id: "p1", number: 3, subject: "Cans", question: "IC-rated?", suggestion: null, status: "open", ball_in_court: "them", share_token: TOKEN, deleted: false,
      photo_ids: ["ph1", "ph2", "ph3", "ph4"], sheet_id: "s1", x: 0.4, y: 0.6, created_by: "sam@acme.com", to_email: "pat@gc.com", answer: null, answered_by: null, answered_at: null,
      created_at: T0, updated_at: T0, sender: { company: "Acme" },
    };
    photos = [
      { id: "ph1", image_id: "img1", width: 400, height: 300, caption: "ok", annotations: [] },
      { id: "ph2", image_id: "../p2/secret", width: 1, height: 1, caption: "escape", annotations: [] },
      { id: "ph3", image_id: "p2/secret", width: 1, height: 1, caption: "other job", annotations: [] },
      { id: "ph4", image_id: "img4", width: 1, height: 1, caption: "ok too", annotations: [] },
    ];
    sheets = [{ image_id: "simg", image_path: "p2/their-plan", width: 1000, height: 800, name: "L1" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const u = new URL(String(input instanceof Request ? input.url : input));
        if (u.pathname === "/rest/v1/rfis") return Response.json([rfi]);
        if (u.pathname === "/rest/v1/projects") return Response.json([{ address: "12 Oak St" }]);
        if (u.pathname === "/rest/v1/photos") return Response.json(photos);
        if (u.pathname === "/rest/v1/sheets") return Response.json(sheets);
        if (u.pathname === "/storage/v1/object/sign/plans") {
          const { paths } = JSON.parse(String(init!.body)) as { paths: string[] };
          signed.push(paths);
          return Response.json(paths.map((p) => ({ path: p, signedURL: `/object/sign/plans/${p}?token=sig`, error: null })));
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const get = () => new Request(`http://localhost/api/rfis/public?t=${TOKEN}`, { headers: { "cf-connecting-ip": "203.0.113.9" } });

  it("drops photos whose image id escapes the job, and never signs a sheet path from another job", async () => {
    const { GET } = await import("@/app/api/rfis/public/route");
    const v = await (await GET(get())).json();
    expect(signed).toEqual([["p1/img1", "p1/img4", "p1/simg"]]);
    expect(v.photos.map((p: { caption: string }) => p.caption)).toEqual(["ok", "ok too"]);
    expect(v.plan).toMatchObject({ url: `${SB}/storage/v1/object/sign/plans/p1/simg?token=sig`, sheetName: "L1" });
    expect(JSON.stringify(v)).not.toContain("p2/");
  });

  it("shows no plan when neither the sheet's path nor its image id is safe", async () => {
    sheets = [{ image_id: "../../p2/x", image_path: "p2/x", width: 1000, height: 800, name: "L1" }];
    photos = [];
    const { GET } = await import("@/app/api/rfis/public/route");
    const v = await (await GET(get())).json();
    expect(v.plan).toBeNull();
    expect(signed.flat().some((p) => p.includes("p2"))).toBe(false);
  });

  it("keeps using a sheet's own image_path in this job (a newer revision's upload)", async () => {
    sheets = [{ image_id: "old", image_path: "p1/newrev", width: 1000, height: 800, name: "L1" }];
    const { GET } = await import("@/app/api/rfis/public/route");
    await GET(get());
    expect(signed[0].at(-1)).toBe("p1/newrev");
  });
});

describe("change order link signs only this job's photos", () => {
  let signed: string[][];
  let publicView: Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    signed = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    publicView = {
      title: "Extra cans",
      total: 100,
      photos: [
        { imageId: "img1", caption: "ok" },
        { imageId: "../p2/secret", caption: "escape" },
        { imageId: "p2/secret", caption: "other job" },
        { imageId: 42, caption: "junk" },
        null,
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith(`${SB}/rest/v1/change_orders?share_token=`))
          return Response.json([{ id: "co1", project_id: "p1", status: "sent", deleted: false, public_view: publicView, responded_at: null, approved_name: null, client_comment: null }]);
        if (url === `${SB}/storage/v1/object/sign/plans`) {
          const { paths } = JSON.parse(String(init!.body)) as { paths: string[] };
          signed.push(paths);
          return Response.json(paths.map((p) => ({ path: p, signedURL: `/object/sign/plans/${p}?token=abc`, error: null })));
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("drops photo ids that aren't plain image names", async () => {
    const { GET } = await import("@/app/api/change-orders/public/route");
    const r = await GET(new Request(`http://localhost/api/change-orders/public?t=${TOKEN}`, { headers: { "cf-connecting-ip": "203.0.113.9" } }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(signed).toEqual([["p1/img1"]]);
    expect(j.view.photos).toEqual([{ url: `${SB}/storage/v1/object/sign/plans/p1/img1?token=abc`, caption: "ok" }]);
  });

  it("signs nothing when no photo is safe", async () => {
    publicView.photos = [{ imageId: "../x", caption: "" }];
    const { GET } = await import("@/app/api/change-orders/public/route");
    const j = await (await GET(new Request(`http://localhost/api/change-orders/public?t=${TOKEN}`))).json();
    expect(j.view.photos).toEqual([]);
    expect(signed).toEqual([]);
  });
});
