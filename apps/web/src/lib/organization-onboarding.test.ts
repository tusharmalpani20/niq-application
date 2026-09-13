import { describe, expect, test } from "bun:test";
import { MAX_ORGANIZATION_LOGO_BYTES, organizationLogoError, organizationUrlName } from "./organization-onboarding";

describe("organization onboarding helpers", () => {
  test("creates a readable URL name from an organization name", () => {
    expect(organizationUrlName("  Apollo Hospitals & Clinics  ")).toBe("apollo-hospitals-clinics");
  });

  test("accepts only supported logo types under two megabytes", () => {
    expect(organizationLogoError({ type: "image/png", size: 128 })).toBeNull();
    expect(organizationLogoError({ type: "image/svg+xml", size: 128 })).toContain("PNG");
    expect(organizationLogoError({ type: "image/jpeg", size: MAX_ORGANIZATION_LOGO_BYTES + 1 })).toContain("2 MB");
  });
});
