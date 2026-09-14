import type { OnboardOrganization } from "@niq/application-contracts";

export const MAX_ORGANIZATION_LOGO_BYTES = 2_097_152;
export const ORGANIZATION_LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
export const ORGANIZATION_BRAND_PRESETS = [
  { id: "niq", name: "NIQ", primaryColor: "#175CD3", secondaryColor: "#0E9384" },
  { id: "ocean", name: "Ocean", primaryColor: "#175CD3", secondaryColor: "#0E7490" },
  { id: "forest", name: "Forest", primaryColor: "#18794E", secondaryColor: "#3A7D44" },
  { id: "plum", name: "Plum", primaryColor: "#7A3E8E", secondaryColor: "#A15C9A" },
] as const;

export function organizationUrlName(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function organizationLogoError(file: Pick<File, "size" | "type">): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Choose a PNG, JPEG or WebP image.";
  if (file.size === 0 || file.size > MAX_ORGANIZATION_LOGO_BYTES) return "The logo must be smaller than 2 MB.";
  return null;
}

export async function organizationLogoPayload(file: File | null): Promise<OnboardOrganization["logo"]> {
  if (!file) return null;
  const error = organizationLogoError(file);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return { mimeType: file.type as "image/png" | "image/jpeg" | "image/webp", contentBase64: btoa(binary) };
}
