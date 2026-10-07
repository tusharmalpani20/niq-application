import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { AdminOrganizationsPage } from "./AdminOrganizationsPage";
import { AdminAdministratorsPage } from "./AdminAdministratorsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const createdAt = "2026-10-05T00:00:00Z";

async function withAdminPage(path: string, element: React.ReactNode, respond: (url: string) => Promise<Response> | Response, verify: (requests: string[]) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async input => { const url = String(input); requests.push(url); return respond(url); }) as typeof fetch;
  const user = { userId: id, organizationId: null, membershipId: null, email: "admin@example.test", displayName: "NIQ Admin", role: "PLATFORM_ADMIN", platformRole: "PLATFORM_ADMIN" };
  const router = createMemoryRouter([{ element: <Outlet context={{ user }} />, children: [{ path, element }] }], { initialEntries: [path] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(requests);
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("organizations render desktop and mobile skeletons and fetch only one server page", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await withAdminPage("/admin/organizations", <AdminOrganizationsPage />, async url => {
    await gate;
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    return Response.json({ items: [{ id, legalName: "Example Health Network", displayName: `Demo ${page}`, slug: "demo", logoObjectKey: null, primaryColor: "#33B8C1", secondaryColor: "#123456", patientReferencePrefix: "PAT", status: "ACTIVE", createdAt, updatedAt: createdAt }], total: 11, page, pageSize: 10 });
  }, async requests => {
    const loading = document.querySelector('[role="status"][aria-label="Loading organizations"]');
    expect(loading?.querySelectorAll(".mobile-card-list article")).toHaveLength(4);
    expect(loading?.querySelectorAll(".desktop-table tbody tr")).toHaveLength(6);
    await act(async () => { release(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Organizations"]')?.textContent).toContain("Demo 1");
    const next = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Organizations pagination"] button')].at(-1)!;
    await act(async () => { next.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Organizations"]')?.textContent).toContain("Demo 2");
    expect(requests).toHaveLength(2);
    expect(requests.every(url => url.includes("/organizations/page?") && url.includes("pageSize=10"))).toBe(true);
  });
});

test("administrator invitations preserve table headers and show both invite actions", async () => {
  await withAdminPage("/admin/administrators", <AdminAdministratorsPage />, url => {
    const kind = new URL(url, "http://localhost").searchParams.get("kind");
    return Response.json({ items: kind === "USER" ? [{ kind: "USER", userId: id, membershipId: id, email: "admin@example.test", displayName: "NIQ Admin", status: "ACTIVE", active: true, createdAt }] : [], total: kind === "USER" ? 1 : 0, userCount: 1, invitationCount: 0, page: 1, pageSize: 10 });
  }, async requests => {
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(node => node.textContent?.includes("Pending invitations"))!;
    await act(async () => { tab.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Pending administrator invitations"]')?.textContent).toContain("Invitee");
    expect(document.querySelectorAll('button[aria-label="Invite administrator"]')).toHaveLength(1);
    expect([...document.querySelectorAll("button")].filter(node => node.textContent?.includes("Invite a colleague")).length).toBeGreaterThan(0);
    expect(requests.some(url => url.includes("/platform/administrators/page?") && url.includes("kind=INVITATION"))).toBe(true);
  });
});
