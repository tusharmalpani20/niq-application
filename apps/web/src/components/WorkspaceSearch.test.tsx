import { expect, test } from "bun:test";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceSearch } from "./WorkspaceSearch";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-26T00:00:00Z";
const patient = { id, organizationId: id, reference: "PAT-2", displayName: "Tushar Malpani", homeFacility: null, dateOfBirth: null, gender: "UNKNOWN", createdAt: date, updatedAt: date };
const assessment = { id, organizationId: id, reference: "ASM-000016", serialNumber: 16, patient: { id, reference: "PAT-2", displayName: "Tushar Malpani" }, facility: null, status: "DRAFT", myAction: "EDIT_DRAFT", createdAt: date, updatedAt: date, completedAt: null };

async function renderSearch(role: AuthenticatedUser["role"], verify: (body: HTMLElement, requests: string[], navigation: string[]) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  // React's legacy input polyfill probes these methods when JSDOM is installed after React imports.
  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", { value: () => {} });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", { value: () => {} });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return Response.json({ items: String(input).endsWith("/patients") ? [patient] : [assessment] });
  }) as typeof fetch;
  const user: AuthenticatedUser = { userId: id, organizationId: id, membershipId: id, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const navigation: string[] = [];
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<WorkspaceSearch user={user} onNavigate={to => navigation.push(to)} />));
    await verify(document.body, requests, navigation);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

async function search(body: HTMLElement, term: string) {
  const input = body.querySelector<HTMLInputElement>('input[aria-label="Search patients and assessments"]')!;
  await act(async () => { input.focus(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, term);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent("keyup", { bubbles: true, key: term.at(-1) }));
  });
  return input;
}

test("header search finds accessible patients and assessments and opens a result", async () => {
  await renderSearch("DOCTOR", async (body, requests, navigation) => {
    await search(body, "Tushar");
    expect(requests.some(url => url.endsWith("/patients"))).toBe(true);
    expect(requests.some(url => url.endsWith("/assessments"))).toBe(true);
    const options = body.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toContain("PAT-2");
    expect(options[1]?.textContent).toContain("ASM-000016");
    await act(async () => (options[1] as HTMLButtonElement).click());
    expect(navigation).toEqual(["/assessments/ASM-000016"]);
  });
});

test("focusing an empty search keeps the header compact", async () => {
  await renderSearch("DOCTOR", async (body, requests) => {
    const input = body.querySelector<HTMLInputElement>('input[aria-label="Search patients and assessments"]')!;
    await act(async () => input.focus());
    expect(body.querySelector('[role="listbox"]')).toBeNull();
    expect(requests).toHaveLength(0);
  });
});

test("support search excludes assessments it cannot open", async () => {
  await renderSearch("SUPPORT", async (body, requests, navigation) => {
    await search(body, "Tushar");
    expect(requests.some(url => url.endsWith("/patients"))).toBe(true);
    expect(requests.some(url => url.endsWith("/assessments"))).toBe(false);
    expect(body.querySelectorAll('[role="option"]')).toHaveLength(1);
    await act(async () => (body.querySelector('[role="option"]') as HTMLButtonElement).click());
    expect(navigation).toEqual(["/patients/PAT-2"]);
  });
});
