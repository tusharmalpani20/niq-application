import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { normalizeBranding, type TenantBranding } from "./branding";
const defaultBranding: Required<TenantBranding> = { displayName: "Apollo Group", primaryColor: "#176b70", secondaryColor: "#14636a" };
type BrandingValue = { branding: Required<TenantBranding>; updateBranding: (next: TenantBranding) => void; resetBranding: () => void };
const BrandingContext = createContext<BrandingValue | null>(null);
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(defaultBranding);
  const updateBranding = (next: TenantBranding) => setBranding(normalizeBranding(next));
  useEffect(() => { document.documentElement.style.setProperty("--primary", branding.primaryColor); document.documentElement.style.setProperty("--secondary", branding.secondaryColor); }, [branding]);
  const value = useMemo(() => ({ branding, updateBranding, resetBranding: () => setBranding(defaultBranding) }), [branding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
export function useBranding() { const value = useContext(BrandingContext); if (!value) throw new Error("useBranding must be used inside BrandingProvider"); return value; }
