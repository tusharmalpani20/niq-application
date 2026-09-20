import { DEFAULT_ORGANIZATION_BRANDING } from "@niq/application-contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeBranding, type TenantBranding } from "./branding";
import { accessibleBrandInk, contrastingForeground } from "./colour-contrast";
const defaultBranding: Required<TenantBranding> = { displayName: "NIQ", logoUrl: null, ...DEFAULT_ORGANIZATION_BRANDING };
type BrandingValue = { branding: Required<TenantBranding>; updateBranding: (next: TenantBranding) => void; resetBranding: () => void };
const BrandingContext = createContext<BrandingValue | null>(null);
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(defaultBranding);
  const updateBranding = useCallback((next: TenantBranding) => setBranding(normalizeBranding(next)), []);
  const resetBranding = useCallback(() => setBranding(defaultBranding), []);
  useEffect(() => {
    const theme = document.documentElement.style;
    const tokens = window.getComputedStyle(document.documentElement);
    const surfaces = [tokens.getPropertyValue("--admin-canvas").trim(), tokens.getPropertyValue("--admin-secondary").trim(), "#ffffff"];
    theme.setProperty("--brand-ink", accessibleBrandInk(branding.primaryColor, surfaces));
    theme.setProperty("--brand-primary", branding.primaryColor);
    theme.setProperty("--brand-secondary", branding.secondaryColor);
    theme.setProperty("--brand-primary-foreground", contrastingForeground(branding.primaryColor));
    theme.setProperty("--brand-secondary-foreground", contrastingForeground(branding.secondaryColor));
  }, [branding]);
  const value = useMemo(() => ({ branding, updateBranding, resetBranding }), [branding, resetBranding, updateBranding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
export function useBranding() { const value = useContext(BrandingContext); if (!value) throw new Error("useBranding must be used inside BrandingProvider"); return value; }
