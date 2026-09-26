import { expect, test } from "bun:test";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceNotifications } from "./WorkspaceNotifications";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-26T00:00:00Z";
const assessment = { id, organizationId: id, reference: "ASM-000016", serialNumber: 16, patient: { id, reference: "PAT-2", displayName: "Tushar Malpani" }, facility: null, status: "DRAFT", myAction: "EDIT_DRAFT", createdAt: date, updatedAt: date, completedAt: null };

async function renderNotifications(role: AuthenticatedUser["role"], verify: (body: HTMLElement, requests: string[], navigation: string[]) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("clinical-reviews")) return Response.json({ items: [], total: url.includes("state=QUEUED") ? 2 : 1, page: 1, pageSize: 1 });
    return Response.json({ items: [assessment] });
  }) as typeof fetch;
  const user: AuthenticatedUser = { userId: id, organizationId: id, membershipId: id, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const navigation: string[] = [];
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<WorkspaceNotifications user={user} onNavigate={to => navigation.push(to)} />));
    await act(async () => { document.querySelector("summary")!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(document.body, requests, navigation);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("notifications show permitted assessment work and navigate to it", async () => {
  await renderNotifications("DOCTOR", async (body, requests, navigation) => {
    expect(requests.some(url => url.endsWith("/assessments"))).toBe(true);
    expect(requests.filter(url => url.includes("clinical-reviews"))).toHaveLength(2);
    expect(body.textContent).toContain("My assessment actions");
    expect(body.textContent).toContain("Awaiting a reviewer");
    expect(body.textContent).toContain("My reviews in progress");
    await act(async () => (Array.from(body.querySelectorAll("button")).find(button => button.textContent?.includes("My assessment actions")) as HTMLButtonElement).click());
    expect(navigation).toEqual(["/assessments?status=MY_ACTIONS"]);
  });
});

test("notifications do not request assessment or review data for support", async () => {
  await renderNotifications("SUPPORT", async (body, requests) => {
    expect(requests).toHaveLength(0);
    expect(body.textContent).toContain("No assessment work needing attention.");
  });
});
