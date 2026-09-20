import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useDraftNavigationGuard } from "./useDraftNavigationGuard";
function Guard() { return <main>{useDraftNavigationGuard(true)}<p>Assessment</p></main>; }
test("themed guard skips same-page changes, cancels navigation, and resumes shell actions once", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  // React is imported before JSDOM; provide its legacy input-focus event hooks.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  dom.window.confirm = () => false;

  dom.window.confirm = () => { throw new Error("Native confirm must not be used"); };
  const router = createMemoryRouter([{ path: "/assessment", element: <Guard /> }, { path: "/other", element: <p>Other page</p> }], { initialEntries: ["/assessment"] });
  const root = createRoot(document.getElementById("root")!);
  const click = async (label: string) => { await act(async () => { ([...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement).click(); }); };
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); });
    await act(async () => { await router.navigate("/assessment?section=treatment"); });
    expect(router.state.location.search).toBe("?section=treatment");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => { await router.navigate("/other"); });
    expect(router.state.location.pathname).toBe("/assessment");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Leave this assessment?");
    await click("Stay on assessment");
    expect(router.state.location.pathname).toBe("/assessment");
    let proceeded = 0;
    await act(async () => {
      const accepted = window.dispatchEvent(new dom.window.CustomEvent("niq:before-navigation", { cancelable: true, detail: { proceed: () => { proceeded++; void router.navigate("/other"); } } }));
      expect(accepted).toBe(false);
    });
    expect(proceeded).toBe(0);
    await click("Leave without saving");
    expect(proceeded).toBe(1);
    expect(router.state.location.pathname).toBe("/other");
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
});
