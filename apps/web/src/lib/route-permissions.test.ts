import { expect, test } from "bun:test";
import { matchRoutes } from "react-router-dom";
import { membershipRoles } from "@niq/application-contracts";
import { canVisitOrganizationRoute } from "./route-permissions";

for (const path of ["/users", "/settings/branding", "/settings/scoring"]) {
  test(`guards all router-equivalent forms of ${path}`, () => {
    for (const url of [path, `${path}/`, `${path}///`, path.toUpperCase()]) {
      expect(matchRoutes([{ path }], url)).not.toBeNull();
      for (const role of membershipRoles) expect(canVisitOrganizationRoute(role, url)).toBe(role === "ORGANIZATION_ADMIN");
    }
  });
}
test("all roles retain ordinary workspace navigation", () => {
  for (const role of membershipRoles) for (const path of ["/", "/patients", "/assessments", "/facilities"]) expect(canVisitOrganizationRoute(role, path)).toBe(true);
});
