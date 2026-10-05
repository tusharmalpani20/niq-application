import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { PatientsPage } from "./PatientsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-10-05T00:00:00Z";
const patients = Array.from({ length: 12 }, (_, index) => ({
  id: `${id.slice(0, -2)}${String(index + 1).padStart(2, "0")}`,
  organizationId: id,
  reference: `PAT-${index + 1}`,
  homeFacility: { id, name: "Test Centre" },
  dateOfBirth: "1986-01-01",
  gender: "FEMALE",
  displayName: `Patient ${index + 1}`,
  createdAt: date,
  updatedAt: date,
  lastAssessmentAt: date,
}));

async function renderPatients(verify: (requests: string[]) => void | Promise<void>, gate?: Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async input => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/patients/page?")) {
      await gate;
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "10");
      return Response.json({ items: patients.slice((page - 1) * pageSize, page * pageSize), total: patients.length, page, pageSize });
    }
    return Response.json({ items: [] });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "doctor@example.test", displayName: "Doctor", role: "DOCTOR", platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/patients", element: <PatientsPage /> }] }], { initialEntries: ["/patients"] });
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

test("shows animated placeholders for patient cards and table rows while loading", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderPatients(async requests => {
    const loading = document.querySelector('[role="status"][aria-label="Loading patients"]');
    expect(loading?.querySelectorAll(".mobile-card-list article")).toHaveLength(4);
    expect(loading?.querySelectorAll(".desktop-table tbody tr")).toHaveLength(6);
    expect(loading?.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="Patients pagination"]')).toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Loading patients"]')).toBeNull();
    expect(document.querySelector('[aria-label="Patients"]')?.textContent).toContain("Patient 1");
    expect(requests.some(url => /\/patients(?:\?|$)/.test(url))).toBe(false);
    expect(requests.some(url => /\/assessments(?:\?|$)/.test(url))).toBe(false);
  }, gate);
});

test("requests only the selected patient page", async () => {
  await renderPatients(async requests => {
    const table = () => document.querySelector('[aria-label="Patients"]')?.textContent ?? "";
    expect(table()).toContain("Patient 10");
    expect(table()).not.toContain("Patient 11");
    const next = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Patients pagination"] button')].at(-1)!;
    await act(async () => { next.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(table()).toContain("Patient 11");
    expect(table()).not.toContain("Patient 1PAT-1");
    expect(document.querySelector('[aria-label="Patients pagination"]')?.textContent).toContain("Page 2 of 2");
    expect(requests.filter(url => url.includes("/patients/page?")).map(url => new URL(url, "http://localhost").searchParams.get("page"))).toEqual(["1", "2"]);
  });
});
