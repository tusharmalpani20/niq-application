import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_ORGANIZATION_BRANDING } from "@niq/application-contracts";
import { accessibleBrandInk, colourContrastRatio } from "./colour-contrast";
import { brandingFromOrganization } from "./branding";
import { BrandingProvider, useBranding } from "./branding-context";

test("saved tenant branding reaches the document theme and resets for another workspace", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const previous = Object.fromEntries(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  let controls;
  function Tenant() {
    const context = useBranding();
    useEffect(() => { controls = context; }, [context]);
    return <div>{context.branding.displayName}{context.branding.logoUrl && <img alt="Organization logo" src={context.branding.logoUrl} />}</div>;
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(<BrandingProvider><Tenant /></BrandingProvider>));
    const savedOrganization = {
      id: "tenant-a", displayName: "Example Health", primaryColor: "#9817D3", secondaryColor: "#954F0E", logoObjectKey: "database:logo-a",
    };
    await act(async () => controls.updateBranding(brandingFromOrganization(savedOrganization)));
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe(savedOrganization.primaryColor);
    expect(document.documentElement.style.getPropertyValue("--brand-secondary")).toBe(savedOrganization.secondaryColor);
    expect(document.body.textContent).toBe("Example Health");
    expect(document.querySelector("img").getAttribute("src")).toBe("/api/v1/organizations/tenant-a/logo?v=database%3Alogo-a");

    // A later login must replace the previous organization's branding, including its logo.
    await act(async () => controls.updateBranding(brandingFromOrganization({ ...savedOrganization, id: "tenant-b", displayName: "Second Clinic", primaryColor: "#123456", secondaryColor: "#654321", logoObjectKey: null })));
    expect(document.querySelector("img")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#123456");
    expect(document.body.textContent).toBe("Second Clinic");
    expect(document.documentElement.style.getPropertyValue("--brand-ink")).toBe("#123456");
    await act(async () => controls.updateBranding(brandingFromOrganization({ ...savedOrganization, primaryColor: "#ffffdd" })));
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#ffffdd");
    expect(colourContrastRatio(document.documentElement.style.getPropertyValue("--brand-ink"), "#f6f8fb")).toBeGreaterThanOrEqual(4.5);

    await act(async () => controls.resetBranding());
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe(DEFAULT_ORGANIZATION_BRANDING.primaryColor);
    expect(document.documentElement.style.getPropertyValue("--brand-secondary")).toBe(DEFAULT_ORGANIZATION_BRANDING.secondaryColor);
    expect(document.body.textContent).toBe("NIQ");
    expect(document.documentElement.style.getPropertyValue("--brand-ink")).toBe(accessibleBrandInk(DEFAULT_ORGANIZATION_BRANDING.primaryColor));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
