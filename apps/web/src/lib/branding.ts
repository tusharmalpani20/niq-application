export type TenantBranding = {
  displayName?: string;
  primaryColor: string;
  secondaryColor: string;
};

const safeHexColor = /^#[0-9a-fA-F]{6}$/;

export function toBrandCssVariables(branding: TenantBranding): Record<"--primary" | "--secondary", string> {
  if (!safeHexColor.test(branding.primaryColor) || !safeHexColor.test(branding.secondaryColor)) {
    throw new Error("Tenant branding colors must use six-digit hexadecimal values.");
  }

  return {
    "--primary": branding.primaryColor,
    "--secondary": branding.secondaryColor,
  };
}

export function normalizeBranding(branding: TenantBranding): Required<TenantBranding> {
  toBrandCssVariables(branding);
  const displayName = branding.displayName?.trim() ?? "NIQ";
  if (displayName.length < 2 || displayName.length > 120) throw new Error("Tenant display name must be between 2 and 120 characters.");
  return { ...branding, displayName };
}
