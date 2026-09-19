import { afterEach, expect, test } from "bun:test";
import { updateFacility } from "./facility-management";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("facility updates send validated changes to the organization scoped endpoint", async () => {
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ error: { code: "FORBIDDEN", requestId: "test", message: "You cannot manage this facility." } }), { status: 403 });
  }) as typeof fetch;
  await expect(updateFacility("org-1", "facility-1", { status: "INACTIVE" })).rejects.toThrow("You cannot manage this facility.");
  expect(request?.url).toBe("/api/v1/organizations/org-1/facilities/facility-1");
  expect(request?.options?.credentials).toBe("include");
  expect(JSON.parse(String(request?.options?.body))).toEqual({ status: "INACTIVE" });
});
