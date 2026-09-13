import { createHash } from "node:crypto";
import type { OnboardOrganization } from "@niq/application-contracts";

export const MAX_ORGANIZATION_LOGO_BYTES = 2_097_152;

export class InvalidOrganizationLogoError extends Error {}

export function decodeOrganizationLogo(logo: OnboardOrganization["logo"]): { data: Uint8Array; mimeType: string; sha256: string } | null {
  if (!logo) return null;

  const data = Buffer.from(logo.contentBase64, "base64");
  if (data.byteLength === 0 || data.byteLength > MAX_ORGANIZATION_LOGO_BYTES) {
    throw new InvalidOrganizationLogoError("The organization logo must be no larger than 2 MB.");
  }

  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isWebp = data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  const matchesMime =
    (logo.mimeType === "image/png" && isPng) ||
    (logo.mimeType === "image/jpeg" && isJpeg) ||
    (logo.mimeType === "image/webp" && isWebp);

  if (!matchesMime) {
    throw new InvalidOrganizationLogoError("The organization logo content does not match its file type.");
  }

  return {
    data,
    mimeType: logo.mimeType,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}
