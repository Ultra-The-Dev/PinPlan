import { afterEach, describe, expect, it } from "vitest";

describe("AI switched off", () => {
  afterEach(() => {
    delete process.env.AI_ENABLED;
  });
  it("every AI route answers 404 ai_disabled without calling anything", async () => {
    delete process.env.AI_ENABLED;
    delete process.env.NEXT_PUBLIC_AI_ENABLED;
    for (const path of ["scan", "plan/read", "photos/describe", "photos/summary"]) {
      const { POST } = await import(`@/app/api/${path}/route`);
      const res: Response = await POST(new Request(`http://x/api/${path}`, { method: "POST", body: "{}" }));
      expect(res.status, path).toBe(404);
      expect((await res.json()).code).toBe("ai_disabled");
    }
  });
});
