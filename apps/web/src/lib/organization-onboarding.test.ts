import { describe, expect, test } from "bun:test";
import { MAX_ORGANIZATION_LOGO_BYTES, ORGANIZATION_BRAND_PRESETS, organizationLogoError, organizationUrlName } from "./organization-onboarding";

describe("organization onboarding helpers", () => {
  test("creates a readable URL name from an organization name", () => {
    expect(organizationUrlName("  Example Health & Clinics  ")).toBe("example-health-clinics");
  });

  test("accepts only supported logo types under two megabytes", () => {
    expect(organizationLogoError({ type: "image/png", size: 128 })).toBeNull();
    expect(organizationLogoError({ type: "image/svg+xml", size: 128 })).toContain("PNG");
    expect(organizationLogoError({ type: "image/jpeg", size: MAX_ORGANIZATION_LOGO_BYTES + 1 })).toContain("2 MB");
  });

  test("provides valid centralized brand presets", () => {
    expect(new Set(ORGANIZATION_BRAND_PRESETS.map((preset) => preset.id)).size).toBe(ORGANIZATION_BRAND_PRESETS.length);
    for (const preset of ORGANIZATION_BRAND_PRESETS) {
      expect(preset.primaryColor).toMatch(/^#[0-9A-F]{6}$/);
      expect(preset.secondaryColor).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
