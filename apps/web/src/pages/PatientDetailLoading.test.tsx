import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { PatientDetailPage } from "./PatientsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

test("patient details and patient-only assessment history load independently", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  let releasePatient!: () => void;
  const patientGate = new Promise<void>(resolve => { releasePatient = resolve; });
  globalThis.fetch = (async input => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/patients/PAT-2/assessments")) return Response.json({ items: [] });
    if (url.endsWith("/patients/PAT-2")) {
      await patientGate;
      return Response.json({ id, organizationId: id, reference: "PAT-2", displayName: "Test Patient", homeFacility: null, dateOfBirth: "1990-01-01", gender: "FEMALE", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "doctor@example.test", displayName: "Doctor", role: "DOCTOR", platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/patients/:patientLocator", element: <PatientDetailPage /> }] }], { initialEntries: ["/patients/PAT-2"] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Loading patient"] .animate-pulse')).not.toBeNull();
    expect(requests.some(url => url.endsWith("/patients/PAT-2/assessments"))).toBe(true);
    expect(requests.some(url => /\/assessments$/.test(url) && !url.includes("/patients/"))).toBe(false);
    await act(async () => { releasePatient(); await patientGate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Loading patient"]')).toBeNull();
    expect(document.body.textContent).toContain("Test Patient");
    expect(document.body.textContent).toContain("No assessments yet");
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
});
