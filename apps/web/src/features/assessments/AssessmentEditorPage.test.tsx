import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { buildAssessmentForm, getAssessmentCompletion, type AssessmentWorkflow } from "@niq/application-contracts";
import { assessmentQuestionnaireFixture } from "./test-fixture";
import { AssessmentEditorPage } from "./AssessmentEditorPage";

function recordFixture(): AssessmentWorkflow {
  const manifest = buildAssessmentForm(assessmentQuestionnaireFixture());
  const answers = { patient_name: "Test patient", age: 20, gender: "FEMALE", contact: "1234567890", height_cm: 165, current_weight_kg: 60 };
  return { id: "assessment-a", organizationId: "org-a", patientId: "patient-a", facilityId: "facility-a", status: "DRAFT", revision: 3, answers, manifest,
    progress: getAssessmentCompletion(manifest, answers), reports: [], binding: { version: "version-a", checksum: "checksum" }, result: null, submission: null, heightSource: null,
    patient: { id: "patient-a", reference: "PAT-1", displayName: "Test patient", dateOfBirth: "2006-01-01", gender: "FEMALE", phone: "1234567890", homeFacility: { id: "facility-a", name: "Chennai" } },
    createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
}
async function harness(callback: (ctx: { dom: JSDOM; router: ReturnType<typeof createMemoryRouter>; requests: Array<{method: string; body: any}>; click: (label: string) => Promise<void>; conflict: () => void; remoteAnswers: (answers: AssessmentWorkflow["answers"]) => void }) => Promise<void>, overrides: Partial<AssessmentWorkflow> = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  // React is imported before JSDOM; provide its legacy input-focus event hooks.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  dom.window.confirm = () => false;
  let record = { ...recordFixture(), ...overrides }; let rejectSave = false;
  const requests: Array<{ method: string; body: any }> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET"; const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, body });
    if (method === "PATCH") {
      if (rejectSave) return Response.json({ error: { message: "Saved version changed", code: "CONFLICT" } }, { status: 409 });
      record = { ...record, answers: body.answers, revision: record.revision + 1 };
    }
    if (method === "DELETE") record = { ...record, reports: [], revision: record.revision + 1 };
    return Response.json(record);
  }) as typeof fetch;
  const router = createMemoryRouter([{ element: <Outlet context={{ userId: "user-a", organizationId: "org-a" }} />, children: [{ path: "/assessments/:assessmentId", element: <AssessmentEditorPage /> }, { path: "/patients/:id", element: <p>Patient record</p> }] }], { initialEntries: ["/assessments/assessment-a"] });
  const root = createRoot(document.getElementById("root")!);
  async function click(label: string) {
    const button = [...document.querySelectorAll("button")].filter(item => item.textContent?.trim() === label).at(-1);
    if (!button) throw new Error(`Missing button ${label}`);
    await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await callback({ dom, router, requests, click, conflict: () => { rejectSave = true; }, remoteAnswers: answers => { record = { ...record, answers, revision: record.revision + 1 }; } });
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
}
test("resumed real draft shows profile context read-only and saves dirty choices with revision", async () => harness(async ({ requests, click }) => {
  expect(document.body.textContent).toContain("Test patient");
  expect(document.querySelector("#assessment-field-contact input")).toBeNull();
  expect(document.querySelector("#assessment-field-contact")?.textContent).toContain("1234567890");
  await click("Save & continue");
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox.click());
  expect(document.body.textContent).toContain("Unsaved changes");
  await click("Save draft");
  const saved = requests.find(request => request.method === "PATCH");
  expect(saved?.body.revision).toBe(3);
  expect(saved?.body.answers.tumour_type).toEqual(["tumour_type_solid"]);
  expect(document.body.textContent).toContain("Draft saved");
}));
test("save conflict preserves local input and dirty navigation can be cancelled", async () => harness(async ({ click, conflict, router }) => {
  await click("Save & continue");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  conflict(); await click("Save draft");
  expect(document.body.textContent).toContain("Saved version changed");
  expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  expect(document.body.textContent).toContain("Load saved version");
  await act(async () => { await router.navigate("/patients/PAT-1"); });
  expect(router.state.location.pathname).toBe("/assessments/assessment-a");
}));

test("review missing-answer link focuses its field after changing section", async () => harness(async ({ click }) => {
  await click("Review & score");
  const label = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Height:") && button.textContent?.includes("Not answered"))?.textContent?.trim();
  expect(label).toBeDefined();
  await click(label!);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(document.activeElement?.id).toBe("assessment-field-height_cm");
}, { answers: { ...recordFixture().answers, height_cm: null } }));

const reportFixture = { id: "report-a", label: "Blood report", purpose: "", datePrecision: "MONTH" as const, year: 2026, month: 8, day: null, files: [] };
test("report refresh preserves local answers and blocks overwriting concurrent answer edits", async () => harness(async ({ click, remoteAnswers, requests }) => {
  await click("Save & continue");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await click("Reports");
  remoteAnswers({ ...recordFixture().answers, current_weight_kg: 72 });
  await click("Remove");
  await click("Remove");
  expect(document.body.textContent).toContain("Saved answers changed while updating reports");
  expect(document.body.textContent).toContain("Load saved version");
  await click("Save draft");
  expect(requests.filter(request => request.method === "PATCH")).toHaveLength(0);
}, { reports: [reportFixture] }));

test("report refresh adopts concurrent server answers when local answers are clean", async () => harness(async ({ click, remoteAnswers, requests }) => {
  await click("Reports");
  remoteAnswers({ ...recordFixture().answers, current_weight_kg: 72 });
  await click("Remove");
  await click("Remove");
  expect(document.body.textContent).not.toContain("Unsaved changes");
  expect(document.body.textContent).not.toContain("Load saved version");
  await click("Save draft");
  expect(requests.filter(request => request.method === "PATCH")).toHaveLength(0);
}, { reports: [reportFixture] }));
