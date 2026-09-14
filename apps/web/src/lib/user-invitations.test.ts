import { afterEach, expect, spyOn, test } from "bun:test";
import { inviteOrganizationUser } from "./user-invitations";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test("submits scoped invitation details and returns development activation links", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ invitation: {}, activationToken: "test-token" })));
  expect(await inviteOrganizationUser("org", { email: "test@example.com", role: "MEDICAL", facilityIds: [] })).toEqual({ activationToken: "test-token" });
  expect(request.mock.calls[0]?.[0]).toBe("/api/v1/organizations/org/invitations");
  expect(request.mock.calls[0]?.[1]?.credentials).toBe("include");
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ email: "test@example.com", role: "MEDICAL", facilityIds: [] });
});
test("does not report success when the invitation request fails", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 }));
  await expect(inviteOrganizationUser("org", { email: "test@example.com", role: "MEDICAL", facilityIds: [] })).rejects.toThrow("could not be created");
});
