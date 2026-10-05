import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { FacilitiesPage } from "./FacilitiesPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

test("shows facilities placeholders until the list is ready", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  globalThis.fetch = (async () => {
    await gate;
    return Response.json({ items: [{ id, organizationId: id, name: "Test Centre", code: "TEST", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" }] });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "doctor@example.test", displayName: "Doctor", role: "DOCTOR", platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/facilities", element: <FacilitiesPage /> }] }], { initialEntries: ["/facilities"] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    const loading = document.querySelector('[role="status"][aria-label="Loading facilities"]');
    expect(loading?.querySelectorAll(".mobile-card-list article")).toHaveLength(4);
    expect(loading?.querySelectorAll(".desktop-table tbody tr")).toHaveLength(6);
    expect(document.querySelector('[aria-label="Facilities pagination"]')).toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Loading facilities"]')).toBeNull();
    expect(document.querySelector('[aria-label="Facilities"]')?.textContent).toContain("Test Centre");
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
});
