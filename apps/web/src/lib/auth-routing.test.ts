import { describe, expect, test } from "bun:test";
import { authenticatedLandingPath } from "./auth-routing";

describe("authenticated routing", () => {
  test("sends NIQ administrators to the platform console", () => {
    expect(authenticatedLandingPath({ platformRole: "NIQ_ADMIN" })).toBe("/admin/organizations");
  });

  test("keeps organization users in the clinical workspace", () => {
    expect(authenticatedLandingPath({ platformRole: "USER" })).toBe("/");
  });
});
