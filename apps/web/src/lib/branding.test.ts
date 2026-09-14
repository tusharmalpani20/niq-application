import { describe, expect, test } from "bun:test";
import { brandingFromOrganization, normalizeBranding, toBrandCssVariables } from "./branding";

describe("tenant branding", () => {
  test("maps approved colors to application theme variables", () => {
    expect(toBrandCssVariables({ primaryColor: "#175CD3", secondaryColor: "#0E9384" })).toEqual({
      "--primary": "#175CD3",
      "--secondary": "#0E9384",
    });
  });

  test("rejects values that could inject arbitrary CSS", () => {
    expect(() => toBrandCssVariables({ primaryColor: "red; display:none", secondaryColor: "#0E9384" })).toThrow();
  });

  test("trims a tenant name and provides a safe pre-login fallback", () => {
    expect(normalizeBranding({ displayName: "  Example Health  ", primaryColor: "#175CD3", secondaryColor: "#0E9384" }).displayName).toBe("Example Health");
    expect(normalizeBranding({ primaryColor: "#175CD3", secondaryColor: "#0E9384" }).displayName).toBe("NIQ");
  });

  test("hydrates the complete tenant theme from saved organization settings", () => {
    expect(brandingFromOrganization({ displayName: "Example Health", primaryColor: "#9817D3", secondaryColor: "#954F0E" })).toEqual({
      displayName: "Example Health",
      primaryColor: "#9817D3",
      secondaryColor: "#954F0E",
    });
  });
});
