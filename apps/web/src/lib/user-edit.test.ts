import { afterEach, expect, spyOn, test } from "bun:test";
import { updateOrganizationUser } from "./user-edit";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const member = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const user = { membershipId: member, userId: member, displayName: "Updated name", email: "user@example.com", role: "DOCTOR", status: "ACTIVE", active: true, facilities: [{ id: member, name: "One" }, { id: second, name: "Two" }], createdAt: "2026-09-22T00:00:00Z" };
test("updates profile through scoped endpoint preserving multiple facility assignments", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(user));
  const input = { displayName: "Updated name", role: "DOCTOR" as const, facilityIds: [member, second] };
  expect((await updateOrganizationUser("org", member, input)).facilities).toHaveLength(2);
  expect(request.mock.calls[0]?.[0]).toBe(`/api/v1/organizations/org/users/${member}/profile`);
  expect(request.mock.calls[0]?.[1]?.method).toBe("PUT");
  expect(request.mock.calls[0]?.[1]?.credentials).toBe("include");
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual(input);
});
test("server rejection remains an error", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 403 }));
  await expect(updateOrganizationUser("org", member, { displayName: "Name", role: "DOCTOR", facilityIds: [] })).rejects.toThrow("could not be updated");
});
test("invalid profile is rejected before a request", async () => {
  const request = spyOn(globalThis, "fetch");
  await expect(updateOrganizationUser("org", member, { displayName: "", role: "DOCTOR", facilityIds: [] })).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
