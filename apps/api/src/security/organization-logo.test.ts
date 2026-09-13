import { describe, expect, test } from "bun:test";
import { decodeOrganizationLogo, InvalidOrganizationLogoError, MAX_ORGANIZATION_LOGO_BYTES } from "./organization-logo";

describe("organization logo validation", () => {
  test("accepts a PNG when its signature matches the declared type", () => {
    const contentBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const logo = decodeOrganizationLogo({ mimeType: "image/png", contentBase64 });

    expect(logo?.data.byteLength).toBe(8);
    expect(logo?.sha256).toHaveLength(64);
  });

  test("rejects content that does not match the declared image type", () => {
    const contentBase64 = Buffer.from("<svg></svg>").toString("base64");
    expect(() => decodeOrganizationLogo({ mimeType: "image/png", contentBase64 })).toThrow(InvalidOrganizationLogoError);
  });

  test("rejects logos larger than two megabytes", () => {
    const bytes = Buffer.alloc(MAX_ORGANIZATION_LOGO_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => decodeOrganizationLogo({ mimeType: "image/png", contentBase64: bytes.toString("base64") })).toThrow(InvalidOrganizationLogoError);
  });
});
