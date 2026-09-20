import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchCombobox } from "./combobox";

test("searchable menu commits the approved option ID and displays its label", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { FocusEvent: dom.window.FocusEvent, CSS: { escape: (value: string) => value }, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLButtonElement: dom.window.HTMLButtonElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true }));
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const changes: string[] = [];
  function Demo() {
    const [value, setValue] = useState<string | null>(null);
    return <SearchCombobox label="Cancer" options={[{ id: "breast", label: "Breast cancer" }, { id: "other", label: "Other" }]} value={value} onChange={next => { changes.push(next); setValue(next); }} onCreate={text => changes.push(`custom:${text}`)} />;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Demo />));
    await act(async () => document.querySelector<HTMLButtonElement>("button")!.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === "Breast cancer");
    expect(option).toBeDefined();
    await act(async () => option!.click());
    expect(changes).toEqual(["breast"]);
    expect(document.querySelector<HTMLInputElement>('input[role="combobox"]')!.value).toBe("Breast cancer");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    Object.entries(previous).forEach(([key, descriptor]) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as any)[key]);
  }
});
