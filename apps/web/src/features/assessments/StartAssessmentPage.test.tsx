import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { filterAssessmentPatients, StartAssessmentPage } from "./StartAssessmentPage";
import type { MembershipRole } from "@niq/application-contracts";
const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-1", displayName: "Real selected patient", dateOfBirth: "2000-01-01", gender: "FEMALE", homeFacility: null, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
const facility = { id, organizationId: id, name: "Main facility", code: "MAIN", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
async function harness(path: string, handler: (url: string, init?: RequestInit) => Promise<Response>, callback: (router: ReturnType<typeof createMemoryRouter>, click: () => Promise<void>, switchScope: () => Promise<void>) => Promise<void>, role: MembershipRole = "OTHER_MEDICAL", accessibleFacilities = [facility]) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "Event", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "CSS", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, CSS: { escape: (value: string) => value }, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    if (String(url).endsWith("/patients") && init?.method !== "POST") return Promise.resolve(Response.json({ items: [patient] }));
    if (String(url).endsWith("/facilities")) return Promise.resolve(Response.json({ items: accessibleFacilities }));
    return handler(String(url), init);
  }) as typeof fetch;
  let updateScope: (() => void) | undefined;
  function Scope() {
    const [context, setContext] = useState({ userId: id, organizationId: id, role });
    updateScope = () => setContext({ userId: "second-user", organizationId: "second-org", role });
    return <Outlet context={context} />;
  }
  const router = createMemoryRouter([{ element: <Scope />, children: [{ path: "/assessments", element: <p>Assessment list</p> }, { path: "/assessments/new", element: <StartAssessmentPage /> }, { path: "/assessments/:id", element: <p>Persisted assessment</p> }, { path: "/away", element: <p>Another page</p> }] }], { initialEntries: [path] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<StrictMode><RouterProvider router={router} /></StrictMode>); await new Promise(resolve => setTimeout(resolve, 0)); });
    await callback(router, async () => { const button = [...document.querySelectorAll("button")].find(button => /Continue|Retry preparation/.test(button.textContent ?? "")); if (!button) throw new Error("Continue button missing"); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }, async () => { await act(async () => { updateScope!(); await new Promise(resolve => setTimeout(resolve, 0)); }); });
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
}
test("patient entry waits for Continue and preserves creation key before uncertain request", async () => {
  const keys: string[] = [];
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { keys.push(JSON.parse(String(init.body)).requestKey); throw new Error("Network response lost"); }
    throw new Error(`Unexpected ${url}`);
  }, async (router, click) => {
    expect(document.querySelector<HTMLInputElement>("#assessment-patient")?.value).toContain("Real selected patient");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Assessment sections"]')).toBeNull();
    expect(keys).toHaveLength(0);
    await click();
    expect(keys).toHaveLength(1);
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
  }, async (router, click) => { expect(new URLSearchParams(router.state.location.search).get("initialization")).toBeNull(); await click(); expect(new URLSearchParams(router.state.location.search).get("initialization")).toBe(id); });
  await harness(`/assessments/new?patient=${id}&requestKey=persisted-creation-key&initialization=${id}`, async (url, init) => {
    expect(init?.method ?? "GET").toBe("GET");
    return Response.json(url.includes("/patients/") ? patient : { id, status: "READY", assessmentId: id, assessmentReference: "ASM-000001", failureCode: null });
  }, async router => { expect(router.state.location.pathname).toBe("/assessments/ASM-000001"); });
});
test("inaccessible patient has no fallback and cannot initialize", async () => {
  let initializations = 0;
  await harness(`/assessments/new?patient=${id}`, async (_url, init) => { if (init?.method === "POST") initializations++; return Response.json({ error: { code: "FORBIDDEN", message: "No access" } }, { status: 403 }); }, async () => {
    expect(document.body.textContent).toContain("could not be loaded");
    expect([...document.querySelectorAll("button")].some(button => button.textContent === "Continue")).toBe(false);
    expect(document.body.textContent).not.toContain("NIQ-1042");
  });
  expect(initializations).toBe(0);
});

test("picker MRN search preserves facility restriction and supports older responses", () => {
  const first = { ...patient, medicalRecordNumber: "HOSP-42", homeFacility: { id: "facility-a", name: "A" }, createdAt: new Date(), updatedAt: new Date() };
  const second = { ...first, id: "patient-b", homeFacility: { id: "facility-b", name: "B" } };
  const legacy = { ...first, id: "patient-c", medicalRecordNumber: undefined };
  expect(filterAssessmentPatients([first, second, legacy] as any, "facility-a", " hosp-42 ").map(item => item.id)).toEqual([id]);
  expect(filterAssessmentPatients([legacy] as any, "", "PAT-1")).toHaveLength(1);
});

test("one accessible facility is shown without an unnecessary facility selector", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async () => {
    expect(document.body.textContent).toContain("Main facility");
    expect(document.body.textContent).not.toContain("All accessible facilities");
    expect(document.querySelector<HTMLInputElement>("#assessment-patient")).not.toBeNull();
  });
});

test("multiple accessible facilities keep the facility selector", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async () => {
    expect(document.body.textContent).toContain("All accessible facilities");
  }, "OTHER_MEDICAL", [facility, { ...facility, id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", name: "Second facility" }]);
});

test("new assessment switches to inline patient registration without opening the questionnaire", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async () => {
    expect(document.querySelector(".assessment-workflow")).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Assessment sections"]')).toBeNull();
    expect(document.body.textContent).toContain("Select a patient and press Continue, or create one to open the questionnaire.");
    expect(document.body.textContent).not.toContain("Personal details, including height and current weight");
    const create = [...document.querySelectorAll("button")].find(button => button.textContent === "Create new patient")!;
    await act(async () => { create.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector("#patient-name")).not.toBeNull();
    expect(document.querySelector("#patient-birth")).not.toBeNull();
    expect(document.body.textContent).toContain("Create patient & continue");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Assessment sections"]')).toBeNull();
  });
});

test("Exit leaves patient selection without creating an assessment", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async router => {
    const exit = [...document.querySelectorAll("button")].find(button => button.textContent === "Exit")!;
    await act(async () => { exit.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(router.state.location.pathname).toBe("/assessments");
  });
});

test("Exit from patient creation confirms dirty fields and stays distinct from choosing an existing patient", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async router => {
    const press = async (label: string) => {
      const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
      await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    };
    await press("Create new patient");
    document.querySelector<HTMLInputElement>("#patient-name")!.value = "Unsaved patient";
    await press("Exit");
    expect(router.state.location.pathname).toBe("/assessments/new");
    expect(document.body.textContent).toContain("Discard patient changes?");
    await press("Keep editing");
    await press("Choose existing patient");
    expect(document.body.textContent).toContain("Discard patient changes?");
    await press("Discard changes");
    expect(router.state.location.pathname).toBe("/assessments/new");
    expect(document.querySelector("#assessment-patient")).not.toBeNull();
    await press("Exit");
    expect(router.state.location.pathname).toBe("/assessments");
  });
});

test("discarding changes from Exit leaves patient creation", async () => {
  await harness("/assessments/new", async url => { throw new Error(`Unexpected ${url}`); }, async router => {
    const press = async (label: string) => {
      const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
      await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    };
    await press("Create new patient");
    document.querySelector<HTMLInputElement>("#patient-name")!.value = "Unsaved patient";
    await press("Exit");
    await press("Discard changes");
    expect(router.state.location.pathname).toBe("/assessments");
  });
});

test("failed initialization on refresh shows its reason without automatic retry", async () => {
  await harness(`/assessments/new?patient=${id}&requestKey=preserved-key&initialization=${id}`, async (url, init) => {
    expect(init?.method ?? "GET").toBe("GET");
    return Response.json(url.includes("/patients/") ? patient : { id, status: "FAILED", assessmentId: null, failureCode: "SCORING_NOT_CONFIGURED" });
  }, async () => {
    expect(document.body.textContent).toContain("Connect NIQ Scoring");
    expect(document.body.textContent).toContain("Retry preparation");
  });
});

test("late initialization does not navigate after leaving the creation route", async () => {
  let finish!: (value: Response) => void;
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") return new Promise(resolve => { finish = resolve; });
    throw new Error(`Unexpected ${url}`);
  }, async (router, click) => {
    await click();
    expect(finish).toBeDefined();
    await act(async () => { await router.navigate("/away"); });
    await act(async () => { finish(Response.json({ id, status: "READY", assessmentId: id, failureCode: null })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(router.state.location.pathname).toBe("/away");
    expect(document.body.textContent).toContain("Another page");
  });
});

test("scope switch clears patient state and ignores the previous user's pending result", async () => {
  let finish!: (value: Response) => void;
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    const second = url.includes("second-org");
    if (url.includes("/patients/")) return Response.json({ ...patient, displayName: second ? "New scope patient" : patient.displayName });
    if (init?.method === "POST") return new Promise(resolve => { if (!second) finish = resolve; });
    throw new Error(`Unexpected ${url}`);
  }, async (router, click, switchScope) => {
    await click();
    expect(finish).toBeDefined();
    await switchScope();
    expect(document.body.textContent).toContain("New scope patient");
    expect(document.body.textContent).not.toContain(patient.displayName);
    await act(async () => { finish(Response.json({ id, status: "READY", assessmentId: id, failureCode: null })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(router.state.location.pathname).toBe("/assessments/new");
    expect(new URLSearchParams(router.state.location.search).get("initialization")).toBeNull();
  });
});

test("support cannot start an assessment from a direct patient URL", async () => {
  let requests = 0;
  await harness(`/assessments/new?patient=${id}`, async () => { requests++; return Response.json(patient); }, async router => {
    expect(router.state.location.pathname).toBe("/assessments");
    expect(requests).toBe(0);
  }, "SUPPORT");
});
