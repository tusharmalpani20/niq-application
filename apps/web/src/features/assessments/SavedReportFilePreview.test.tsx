import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SavedReportFilePreview } from "./SavedReportFilePreview";

test("saved attachment thumbnail loads on visibility and opens without another download", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  const keys = ["FocusEvent", "window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "IntersectionObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { FocusEvent: dom.window.FocusEvent, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  let onVisibility: IntersectionObserverCallback | undefined;
  class VisibilityObserver {
    constructor(callback: IntersectionObserverCallback) { onVisibility = callback; }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", { value: VisibilityObserver, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const requests: Array<{ url: string; method: string; credentials: RequestCredentials | undefined }> = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", credentials: init?.credentials });
    return new Response(new Blob(["png"], { type: "image/png" }));
  }) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  try {
    const file = { id: "file-a", reportId: "report-a", originalFilename: "saved.png", mediaType: "image/png", size: 3, status: "READY", createdAt: "2026-09-24" };
    await act(async () => { root.render(<SavedReportFilePreview file={file} url="/scoped/files/file-a" />); });
    expect(requests).toHaveLength(0);
    await act(async () => { onVisibility?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(requests).toHaveLength(1);
    expect(document.querySelector('button[aria-label="Preview saved.png"] img')).not.toBeNull();
    await act(async () => { [...document.querySelectorAll("button")].find(button => button.textContent === "Preview file")!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(requests).toEqual([{ url: "/scoped/files/file-a", method: "GET", credentials: "include" }]);
    expect(document.querySelector('img[alt="Preview of saved.png"]')).not.toBeNull();
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click(); });
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
});
