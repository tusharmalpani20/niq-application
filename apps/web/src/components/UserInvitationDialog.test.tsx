import { expect, test } from "bun:test";
import type { AuthenticatedUser, Facility } from "@niq/application-contracts";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { UserInvitationDialog } from "./UserInvitationDialog";

test("invitation shows an inline email error instead of browser validation", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { Event: dom.window.Event, CSS: { escape: (value: string) => value }, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const root = createRoot(document.getElementById("root")!);
  const user = { userId: "admin", organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", role: "ORGANIZATION_ADMIN" } as AuthenticatedUser;
  try {
    await act(async () => root.render(<UserInvitationDialog user={user} facilities={[] as Facility[]} allFacilities onClose={() => {}} onCreated={() => {}} />));
    const form = document.querySelector("form")!;
    expect(form.noValidate).toBe(true);
    await act(async () => document.querySelector<HTMLElement>('[aria-label="Role"]')!.click());
    const role = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === "Organization admin");
    expect(role).toBeDefined();
    await act(async () => role!.click());
    await act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    expect(document.querySelector("#user-invite-email-error")?.textContent).toBe("Enter a valid email address.");
    expect(document.querySelector("#user-invite-email")?.getAttribute("aria-invalid")).toBe("true");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
  }
});
