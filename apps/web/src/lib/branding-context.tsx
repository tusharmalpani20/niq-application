import { DEFAULT_ORGANIZATION_BRANDING } from "@niq/application-contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeBranding, type TenantBranding } from "./branding";
const defaultBranding: Required<TenantBranding> = { displayName: "NIQ", logoUrl: null, ...DEFAULT_ORGANIZATION_BRANDING };
type BrandingValue = { branding: Required<TenantBranding>; updateBranding: (next: TenantBranding) => void; resetBranding: () => void };
const BrandingContext = createContext<BrandingValue | null>(null);
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(defaultBranding);
  const updateBranding = useCallback((next: TenantBranding) => setBranding(normalizeBranding(next)), []);
  const resetBranding = useCallback(() => setBranding(defaultBranding), []);
  useEffect(() => { document.documentElement.style.setProperty("--primary", branding.primaryColor); document.documentElement.style.setProperty("--secondary", branding.secondaryColor); }, [branding]);
  const value = useMemo(() => ({ branding, updateBranding, resetBranding }), [branding, resetBranding, updateBranding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
export function useBranding() { const value = useContext(BrandingContext); if (!value) throw new Error("useBranding must be used inside BrandingProvider"); return value; }
