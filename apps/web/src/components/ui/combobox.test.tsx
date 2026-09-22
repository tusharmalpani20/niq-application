import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchCombobox, matchesComboboxSearch } from "./combobox";

test("searchable menu preserves approved and custom choices through mouse, keyboard and blur", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { FocusEvent: dom.window.FocusEvent, CSS: { escape: (value: string) => value }, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLButtonElement: dom.window.HTMLButtonElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true }));
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const changes: string[] = [];
  function Demo() {
    const [value, setValue] = useState<string | null>(null);
    const [custom, setCustom] = useState("");
    return <SearchCombobox label="Cancer" options={[{ id: "breast", label: "Breast cancer" }, { id: "other", label: "Other" }]} value={value} onChange={next => { changes.push(next); setValue(next); }} customValue={value === "other" ? custom : undefined} onCreate={text => { changes.push(`custom:${text}`); setValue("other"); setCustom(text); }} />;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Demo />));
    await act(async () => document.querySelector<HTMLInputElement>('input[role="combobox"]')!.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === "Breast cancer");
    expect(option).toBeDefined();
    await act(async () => option!.click());
    expect(document.querySelector('input[role="combobox"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(changes).toEqual(["breast"]);
    expect(document.querySelector<HTMLInputElement>('input[role="combobox"]')!.value).toBe("Breast cancer");
    const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => input.click());
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Rare subtype");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "e", bubbles: true }));
    });
    expect(changes).toEqual(["breast"]);
    const custom = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.includes("Rare subtype"));
    expect(custom).toBeDefined();
    await act(async () => custom!.click());
    await act(async () => input.blur());
    expect(changes).toEqual(["breast", "custom:Rare subtype"]);
    expect(input.value).toBe("Other");
    await act(async () => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Another subtype");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "e", bubbles: true }));
    });
    // No ArrowDown: Enter accepts the visible custom-answer action directly.
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => input.blur());
    expect(changes).toEqual(["breast", "custom:Rare subtype", "custom:Another subtype"]);
    expect(input.value).toBe("Other");
    await act(async () => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Uncommitted typing");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "g", bubbles: true }));
    });
    await act(async () => input.blur());
    expect(changes).toEqual(["breast", "custom:Rare subtype", "custom:Another subtype"]);
    expect(input.value).toBe("Other");



  } finally {
    await act(async () => root.unmount()); dom.window.close();
    Object.entries(previous).forEach(([key, descriptor]) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as any)[key]);
  }
});


test("search tolerates case, spaces and hyphens in patient references and names", () => {
  const label = "Tushar Malpani · PAT-2 · MRN HOSP-102 · Hyderabad";
  for (const query of ["pat2", "PAT2", "PAT-2", "pAt-2", " pat 2 ", "PAT–2", "tushar malpani", "TUSHARMALPANI", "hosp102"]) {
    expect(matchesComboboxSearch(label, query)).toBe(true);
  }
  expect(matchesComboboxSearch(label, "pat3")).toBe(false);
  expect(matchesComboboxSearch(label, "another patient")).toBe(false);
  expect(matchesComboboxSearch(label, "")).toBe(true);
});
