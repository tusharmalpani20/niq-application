import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { AssessmentsPage } from "./AssessmentsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-20T00:00:00Z";
const patient = { id, reference: "PAT-1", displayName: "Example Patient" };
const records = ["DRAFT", "READY_FOR_SCORING", "SCORED"].map((status, index) => ({ id: `${id.slice(0, -1)}${index + 1}`, reference: `ASM-00000${index + 1}`, serialNumber: index + 1, organizationId: id, patient, facility: null, status, createdAt: date, completedAt: null }));

test("open-assessment link shows only drafts and assessments ready for scoring", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  globalThis.fetch = (async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/assessments") ? { items: records } : { items: [] })) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "doctor@example.test", displayName: "Doctor", role: "DOCTOR", platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/assessments", element: <AssessmentsPage /> }] }], { initialEntries: ["/assessments?status=OPEN"] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
    expect(document.body.textContent).toContain("2 total");
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
});
