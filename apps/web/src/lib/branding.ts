export type TenantBranding = {
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
