import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchCombobox } from "./combobox";

test("mobile choices stay available across selection and reopening", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const media = { matches: true, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(dom.window, "matchMedia", { value: () => media });
  const viewport = Object.assign(new dom.window.EventTarget(), { offsetTop: 0, height: 700 });
  Object.defineProperty(dom.window, "visualViewport", { value: viewport });
  const values = {
    FocusEvent: dom.window.FocusEvent, CSS: { escape: (value: string) => value }, window: dom.window,
    document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement, HTMLButtonElement: dom.window.HTMLButtonElement,
    SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true }));
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const chosen: string[] = [];
  function Demo() {
    const [value, setValue] = useState<string | null>(null);
    return <SearchCombobox label="Cancer" options={[{ id: "breast", label: "Breast cancer" }, { id: "lung", label: "Lung cancer" }]} value={value} onChange={next => { chosen.push(next); setValue(next); }} />;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Demo />));
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Cancer"]')!.click());
    expect(document.body.textContent).toContain("Breast cancer");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Search Cancer"]')).not.toBeNull();
    viewport.offsetTop = 12;
    viewport.height = 390;
    await act(async () => viewport.dispatchEvent(new dom.window.Event("resize")));
    const overlay = document.querySelector<HTMLElement>('[data-slot="mobile-choice-overlay"]')!;
    expect(overlay.style.top).toBe("12px");
    expect(overlay.style.height).toBe("390px");
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lung cancer"))!.click());
    expect(chosen).toEqual(["lung"]);
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Cancer"]')!.click());
    expect(document.body.textContent).toContain("Breast cancer");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.entries(previous).forEach(([key, descriptor]) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]);
  }
});
