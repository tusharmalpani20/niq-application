import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { filterAssessmentPatients, StartAssessmentPage } from "./StartAssessmentPage";
const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-1", displayName: "Real selected patient", dateOfBirth: "2000-01-01", gender: "FEMALE", homeFacility: null, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
async function harness(path: string, handler: (url: string, init?: RequestInit) => Promise<Response>, callback: (router: ReturnType<typeof createMemoryRouter>, click: () => Promise<void>) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  globalThis.fetch = ((url: unknown, init?: RequestInit) => handler(String(url), init)) as typeof fetch;
  const router = createMemoryRouter([{ element: <Outlet context={{ userId: id, organizationId: id }} />, children: [{ path: "/assessments/new", element: <StartAssessmentPage /> }, { path: "/assessments/:id", element: <p>Persisted assessment</p> }] }], { initialEntries: [path] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await callback(router, async () => { const button = [...document.querySelectorAll("button")].find(button => /Start assessment|Retry preparation/.test(button.textContent ?? "")); if (!button) throw new Error("Start button missing"); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); });
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
}
test("patient entry authorizes actual patient and preserves creation key before uncertain request", async () => {
  const keys: string[] = [];
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { keys.push(JSON.parse(String(init.body)).requestKey); throw new Error("Network response lost"); }
    throw new Error(`Unexpected ${url}`);
  }, async (router, click) => {
    expect(document.body.textContent).toContain("Real selected patient");
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
    await click();
    const query = new URLSearchParams(router.state.location.search);
    expect(query.get("patient")).toBe(id);
    expect(query.get("requestKey")).toBe(keys[0]);
    await click();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
test("refresh replays existing creation key and resumes returned initialization", async () => {
  await harness(`/assessments/new?patient=${id}&requestKey=persisted-creation-key`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { expect(JSON.parse(String(init.body)).requestKey).toBe("persisted-creation-key"); return Response.json({ id, status: "PENDING", assessmentId: null, failureCode: null }); }
    return Response.json({ id, status: "PENDING", assessmentId: null, failureCode: null });
  }, async (router, click) => { await click(); expect(new URLSearchParams(router.state.location.search).get("initialization")).toBe(id); });
  await harness(`/assessments/new?patient=${id}&requestKey=persisted-creation-key&initialization=${id}`, async (url, init) => {
    expect(init?.method ?? "GET").toBe("GET");
    return Response.json(url.includes("/patients/") ? patient : { id, status: "READY", assessmentId: id, failureCode: null });
  }, async router => { expect(router.state.location.pathname).toBe(`/assessments/${id}`); });
});
test("inaccessible patient has no fallback and cannot initialize", async () => {
  await harness(`/assessments/new?patient=${id}`, async () => Response.json({ error: { code: "FORBIDDEN", message: "No access" } }, { status: 403 }), async () => {
    expect(document.body.textContent).toContain("could not be loaded");
    expect([...document.querySelectorAll("button")].some(button => button.textContent === "Start assessment")).toBe(false);
    expect(document.body.textContent).not.toContain("NIQ-1042");
  });
});

test("picker MRN search preserves facility restriction and supports older responses", () => {
  const first = { ...patient, medicalRecordNumber: "HOSP-42", homeFacility: { id: "facility-a", name: "A" }, createdAt: new Date(), updatedAt: new Date() };
  const second = { ...first, id: "patient-b", homeFacility: { id: "facility-b", name: "B" } };
  const legacy = { ...first, id: "patient-c", medicalRecordNumber: undefined };
  expect(filterAssessmentPatients([first, second, legacy] as any, "facility-a", " hosp-42 ").map(item => item.id)).toEqual([id]);
  expect(filterAssessmentPatients([legacy] as any, "", "PAT-1")).toHaveLength(1);
});
