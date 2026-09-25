import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { BrandingProvider } from "../lib/branding-context";
import { BrandingPage } from "./BrandingPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-25T00:00:00Z";
const organization = { id, legalName: "Example Health Network", displayName: "Example Health Network", slug: "example-health", logoObjectKey: "database:old-logo", primaryColor: "#3BB9BD", secondaryColor: "#4F5052", patientReferencePrefix: "PAT", status: "ACTIVE", createdAt: date, updatedAt: date };

async function withBrandingPage(verify: (body: HTMLElement, requests: Array<Record<string, unknown>>) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  // React's input polyfill is initialized before JSDOM in Bun's test environment.
  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", { value: () => undefined });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", { value: () => undefined });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push(body);
      return Response.json({ ...organization, logoObjectKey: body.logoObjectKey === null ? null : organization.logoObjectKey });
    }
    return Response.json({ organization, entitlement: { userLimit: null, effectiveFrom: date }, invitations: [], scoringConnection: null });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "admin@example.test", displayName: "Admin", role: "ORGANIZATION_ADMIN" as const, platformRole: "USER" as const };
  const router = createMemoryRouter([{ element: <BrandingProvider><Outlet context={user} /></BrandingProvider>, children: [{ path: "/", element: <BrandingPage /> }] }], { initialEntries: ["/"] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(document.body, requests);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("removing an organization logo stages the Nutra-IQ fallback and saves a null logo key", async () => {
  await withBrandingPage(async (body, requests) => {
    const remove = body.querySelector<HTMLButtonElement>('button[aria-label="Remove organization logo"]');
    expect(remove).toBeDefined();
    await act(async () => remove!.click());
    expect(body.querySelector('img[alt="Nutra-IQ"]')).not.toBeNull();
    expect(body.textContent).toContain("Nutra-IQ logo will appear after saving.");
    const undo = Array.from(body.querySelectorAll("button")).find(button => button.textContent === "Undo");
    await act(async () => undo!.click());
    expect(body.querySelector('img[alt="Organization logo"]')).not.toBeNull();
    await act(async () => body.querySelector<HTMLButtonElement>('button[aria-label="Remove organization logo"]')!.click());
    const save = Array.from(body.querySelectorAll("button")).find(button => button.textContent === "Save changes");
    await act(async () => save!.click());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.logoObjectKey).toBeNull();
    expect(body.textContent).toContain("Changes saved");
  });
});

test("invalid branding fields show inline errors without native browser validation", async () => {
  await withBrandingPage(async (body, requests) => {
    const form = body.querySelector("form")!;
    expect(form.noValidate).toBe(true);
    const input = body.querySelector<HTMLInputElement>("#branding-name")!;
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, "value")!.set!.call(input, "");
      input.dispatchEvent(new input.ownerDocument.defaultView!.Event("input", { bubbles: true }));
      input.dispatchEvent(new input.ownerDocument.defaultView!.KeyboardEvent("keyup", { bubbles: true, key: "Backspace" }));
    });
    const save = Array.from(body.querySelectorAll("button")).find(button => button.textContent === "Save changes");
    await act(async () => save!.click());
    expect(body.textContent).toContain("Enter a display name with at least 2 characters.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(requests).toHaveLength(0);
  });
});
