import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { StartAssessmentPage } from "./StartAssessmentPage";
import type { MembershipRole } from "@niq/application-contracts";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-1", displayName: "Real selected patient", medicalRecordNumber: "HOSP-42", dateOfBirth: "2000-01-01", gender: "FEMALE", phone: "1234567890", homeFacility: { id, name: "Main facility" }, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
const facility = { id, organizationId: id, name: "Main facility", code: "MAIN", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };

async function harness(path: string, handler: (url: string, init?: RequestInit) => Promise<Response>, run: (router: ReturnType<typeof createMemoryRouter>, switchScope: () => Promise<void>) => Promise<void>, role: MembershipRole = "OTHER_MEDICAL") {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const values = { FocusEvent: dom.window.FocusEvent, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, CSS: { escape: (value: string) => value }, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries([...Object.keys(values), "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    if (String(url).endsWith("/patients") && init?.method !== "POST") return Promise.resolve(Response.json({ items: [patient] }));
    if (String(url).endsWith("/facilities")) return Promise.resolve(Response.json({ items: [facility] }));
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
    await run(router, async () => { await act(async () => { updateScope!(); await new Promise(resolve => setTimeout(resolve, 0)); }); });
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
}

async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
  if (!button) throw new Error(`Button missing: ${label}`);
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
}
test("organization admin cannot open assessment creation", async () => {
  let writes = 0;
  await harness("/assessments/new", async () => { writes++; throw new Error("Unexpected request"); }, async router => {
    expect(router.state.location.pathname).toBe("/assessments");
    expect(document.body.textContent).toContain("Assessment list");
  }, "ORGANIZATION_ADMIN");
  expect(writes).toBe(0);
});

test("new assessment opens personal details, with other sections locked and no write", async () => {
  let writes = 0;
  await harness("/assessments/new", async () => { writes++; throw new Error("Unexpected request"); }, async () => {
    expect(document.querySelector("#assessment-patient")).not.toBeNull();
    expect(document.querySelector("#assessment-field-height_cm")).not.toBeNull();
    expect(document.querySelector("#assessment-field-current_weight_kg")).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Assessment sections"] button[aria-current="step"]')?.textContent).toContain("Personal details");
    expect([...document.querySelectorAll('nav[aria-label="Assessment sections"] button')].slice(1).every(button => button.disabled)).toBe(true);
    expect([...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Continue")?.disabled).toBe(true);
    expect(writes).toBe(0);
  });
});

test("existing patient can continue without measurements and add them later", async () => {
  const writes: Array<{ url: string; body: any }> = [];
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { writes.push({ url, body: JSON.parse(String(init.body)) }); return Response.json({ id, status: "READY", assessmentId: id, assessmentReference: "ASM-000009", failureCode: null }); }
    if (init?.method === "PATCH") { writes.push({ url, body: JSON.parse(String(init.body)) }); return Response.json({}); }
    return Response.json({ id, revision: 1, answers: { patient_name: patient.displayName, height_cm: 170 } });
  }, async router => {
    expect([...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Continue")?.disabled).toBe(false);
    expect(document.querySelector("#assessment-field-height_cm")?.getAttribute("aria-required")).toBe("false");
    expect(document.querySelector("#assessment-field-current_weight_kg")?.getAttribute("aria-required")).toBe("false");
    await click("Continue");
    expect(router.state.location.pathname).toBe("/assessments/ASM-000009");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body.patientId).toBe(id);
  });
});

test("provided height and weight are saved when creating an assessment", async () => {
  const writes: Array<{ url: string; body: any }> = [];
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { writes.push({ url, body: JSON.parse(String(init.body)) }); return Response.json({ id, status: "READY", assessmentId: id, assessmentReference: "ASM-000009", failureCode: null }); }
    if (init?.method === "PATCH") { writes.push({ url, body: JSON.parse(String(init.body)) }); return Response.json({}); }
    return Response.json({ id, revision: 1, answers: { patient_name: patient.displayName } });
  }, async router => {
    expect(writes).toHaveLength(0);
    expect([...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Continue")?.disabled).toBe(false);
    expect(writes).toHaveLength(0);
    await click("170 cm");
    await click("70 kg");
    await click("Continue");
    expect(router.state.location.pathname).toBe("/assessments/ASM-000009");
    expect(router.state.location.state).toEqual({ startAtFaceScan: true });
    expect(writes).toHaveLength(2);
    expect(writes[0]!.body.patientId).toBe(id);
    expect(writes[1]!.body.answers).toMatchObject({ height_cm: 170, current_weight_kg: 70 });
  });
});

test("an uncertain initialization response retries with the same creation key", async () => {
  const keys: string[] = [];
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") { keys.push(JSON.parse(String(init.body)).requestKey); throw new Error("Network response lost"); }
    throw new Error(`Unexpected ${url}`);
  }, async router => {
    await click("170 cm"); await click("70 kg"); await click("Continue");
    expect(document.body.textContent).toContain("Network response lost");
    expect(keys).toHaveLength(1);
    expect(new URLSearchParams(router.state.location.search).get("requestKey")).toBe(keys[0]);
    await click("Continue");
    expect(keys).toEqual([keys[0], keys[0]]);
  });
});

test("inaccessible patient cannot initialize an assessment", async () => {
  let writes = 0;
  await harness(`/assessments/new?patient=${id}`, async (_url, init) => {
    if (init?.method === "POST") writes++;
    return Response.json({ error: { code: "FORBIDDEN", message: "No access" } }, { status: 403 });
  }, async () => {
    expect(document.body.textContent).toContain("could not be loaded");
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Continue")).toBe(false);
    expect(writes).toBe(0);
  });
});

test("late initialization does not navigate after leaving the start screen", async () => {
  let finish!: (value: Response) => void;
  await harness(`/assessments/new?patient=${id}`, async (url, init) => {
    if (url.includes("/patients/")) return Response.json(patient);
    if (init?.method === "POST") return new Promise(resolve => { finish = resolve; });
    throw new Error(`Unexpected ${url}`);
  }, async router => {
    await click("170 cm"); await click("70 kg"); await click("Continue");
    expect(finish).toBeDefined();
    await act(async () => { await router.navigate("/away"); });
    await act(async () => { finish(Response.json({ id, status: "READY", assessmentId: id, assessmentReference: "ASM-000009", failureCode: null })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(router.state.location.pathname).toBe("/away");
  });
});

test("patient selection and creation share the name field", async () => {
  let writes = 0;
  await harness("/assessments/new", async (_url, init) => { if (init?.method === "POST") writes++; throw new Error("Unexpected request"); }, async () => {
    const input = document.querySelector<HTMLInputElement>("#assessment-patient")!;
    expect(input.getAttribute("role")).toBe("combobox");
    expect(document.body.textContent).not.toContain("Search within facility");
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Create new patient")).toBe(false);
    expect([...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Continue")?.disabled).toBe(true);
    expect(writes).toBe(0);
  });
});

test("scope switch clears selected patient details", async () => {
  await harness(`/assessments/new?patient=${id}`, async url => {
    if (url.includes("/patients/")) return Response.json({ ...patient, displayName: url.includes("second-org") ? "New scope patient" : patient.displayName });
    throw new Error(`Unexpected ${url}`);
  }, async (_router, switchScope) => {
    expect(document.querySelector<HTMLInputElement>("#assessment-patient")?.value).toContain(patient.displayName);
    await switchScope();
    expect(document.querySelector<HTMLInputElement>("#assessment-patient")?.value).toContain("New scope patient");
    expect(document.querySelector<HTMLInputElement>("#assessment-patient")?.value).not.toContain(patient.displayName);
  });
});
