import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AuthenticatedUser, Facility, OrganizationUser } from "@niq/application-contracts";
import { UserEditDialog, canEditOrganizationUser } from "./UserEditDialog";
const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const third = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
const target = { membershipId: id, userId: id, email: "user@example.com", displayName: "Name", status: "ACTIVE", role: "DOCTOR", active: true, facilities: [{ id, name: "One" }, { id: second, name: "Two" }], createdAt: new Date() } as OrganizationUser;
const facilities = [{ id, name: "One", status: "ACTIVE" }, { id: second, name: "Two", status: "INACTIVE" }, { id: third, name: "Three", status: "ACTIVE" }] as Facility[];
test("restricted admins cannot edit all-facility or out-of-scope memberships", () => {
  expect(canEditOrganizationUser(target, facilities, false)).toBe(true);
  expect(canEditOrganizationUser(target, facilities.slice(0,1), false)).toBe(false);
  expect(canEditOrganizationUser({ ...target, facilities: [] }, facilities, false)).toBe(false);
  expect(canEditOrganizationUser({ ...target, facilities: undefined }, facilities, true)).toBe(false);
});
async function render(self: boolean, callback: (requests: any[]) => Promise<void>) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { Event: dom.window.Event, CSS: { escape: (value: string) => value }, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  const previous = Object.fromEntries([...Object.keys(values), "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable:true, writable:true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const requests: any[] = [];
  globalThis.fetch = (async (_: unknown, init: RequestInit) => { requests.push(JSON.parse(String(init.body))); return Response.json(target); }) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  const user = { userId: self ? id : second, organizationId: id, role: "ORGANIZATION_ADMIN" } as AuthenticatedUser;
  try {
    await act(async () => { root.render(<UserEditDialog user={user} target={target} facilities={facilities} allFacilities onClose={() => {}} onSaved={() => {}} />); await new Promise(r => setTimeout(r, 0)); });
    await callback(requests);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
  }
}
test("profile edit preserves assigned inactive facilities and keeps email read-only", async () => render(false, async requests => {
  expect(document.querySelector<HTMLInputElement>("#edit-user-email")!.readOnly).toBe(true);
  expect(document.body.textContent).toContain("Two (inactive)");
  await act(async () => { document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  expect(requests[0].facilityIds).toEqual([id, second]);
}));
test("facility picker can add and remove assignments before saving", async () => render(false, async requests => {
  const search = document.querySelector<HTMLInputElement>('#edit-user-facility-search')!;
  await act(async () => search.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === "Three");
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(document.querySelector('[aria-label="Remove Three"]')).not.toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Remove One"]')!.click());
  await act(async () => { document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  expect(requests[0].facilityIds).toEqual([second, third]);
}));
test("all facilities clears selections and choosing a facility clears all", async () => render(false, async requests => {
  await act(async () => document.querySelector<HTMLInputElement>('#edit-user-all-facilities')!.click());
  expect(document.querySelector('[aria-label="Remove One"]')).toBeNull();
  const search = document.querySelector<HTMLInputElement>('#edit-user-facility-search')!;
  expect(search.disabled).toBe(false);
  await act(async () => search.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === "Three");
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(document.querySelector<HTMLInputElement>('#edit-user-all-facilities')!.checked).toBe(false);
  expect(document.querySelector('[aria-label="Remove Three"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Remove One"]')).toBeNull();
  await act(async () => { document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  expect(requests[0].facilityIds).toEqual([third]);
}));
test("self profile locks permissions but can save name", async () => render(true, async requests => {
  expect(document.querySelector('[aria-label="Role"]')?.getAttribute("data-disabled")).not.toBeNull();
  expect([...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(item => item.disabled)).toBe(true);
  expect(document.querySelector<HTMLInputElement>("#edit-user-name")!.disabled).toBe(false);
  await act(async () => { document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(requests[0].role).toBe("DOCTOR");
  expect(requests[0].facilityIds).toEqual([id, second]);
}));
