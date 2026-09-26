import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { buildAssessmentForm, getAssessmentCompletion, projectScoreReviews, type AssessmentScoreResult, type AssessmentWorkflow, type MembershipRole } from "@niq/application-contracts";
import { assessmentQuestionnaireFixture } from "./test-fixture";
import { AssessmentEditorPage } from "./AssessmentEditorPage";

function recordFixture(): AssessmentWorkflow {
  const manifest = buildAssessmentForm(assessmentQuestionnaireFixture());
  const answers = { patient_name: "Test patient", age: 20, gender: "FEMALE", contact: "1234567890", height_cm: 165, current_weight_kg: 60 };
  return { id: "assessment-a", reference: "ASM-000001", serialNumber: 1, organizationId: "org-a", patientId: "patient-a", facilityId: "facility-a", status: "DRAFT", revision: 3, answers, manifest,
    progress: getAssessmentCompletion(manifest, answers), reports: [], binding: { version: "version-a", checksum: "checksum" }, result: null, submission: null, reviewToken: "review-token-a", attestations: [], heightSource: null,
    patient: { id: "patient-a", reference: "PAT-1", displayName: "Test patient", dateOfBirth: "2006-01-01", gender: "FEMALE", phone: "1234567890", homeFacility: { id: "facility-a", name: "Chennai" } },
    createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
}
async function harness(callback: (ctx: { dom: JSDOM; router: ReturnType<typeof createMemoryRouter>; requests: Array<{url: string; method: string; body: any}>; click: (label: string) => Promise<void>; conflict: () => void; remoteAnswers: (answers: AssessmentWorkflow["answers"]) => void }) => Promise<void>, overrides: Partial<AssessmentWorkflow> = {}, locator = "assessment-a", submittedResult?: AssessmentScoreResult, role: MembershipRole = "OTHER_MEDICAL", scanEnabled = false) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["FocusEvent", "window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = { FocusEvent: dom.window.FocusEvent, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  if (scanEnabled) {
    Object.defineProperty(dom.window, "isSecureContext", { value: true });
    Object.defineProperty(dom.window.navigator, "mediaDevices", { value: { getUserMedia: () => { throw new Error("Camera must not start for incomplete scan inputs"); } } });
  }
  // React is imported before JSDOM; provide its legacy input-focus event hooks.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  dom.window.confirm = () => false;
  let record = { ...recordFixture(), ...overrides }; let rejectSave = false;
  const requests: Array<{ url: string; method: string; body: any }> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET"; const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url: String(_url), method, body });
    if (scanEnabled && String(_url).endsWith("/face-scans")) return Response.json({ enabled: true, currentSessionId: null, sessions: [] });
    if (String(_url).endsWith("/clinical-review")) return Response.json({ assessmentId:record.id, revision:0, scoreRevision:0, cycle:0, state:"NOT_SUBMITTED", allowedActions:[], history:[], canAdjustScores:role !== "ORGANIZATION_ADMIN", canEditDraft:record.canEditDraft ?? true });
    if (String(_url).endsWith("/score-reviews") && record.result) return Response.json(projectScoreReviews(record.result, []));
    if (method === "POST" && String(_url).endsWith("/submit") && submittedResult) record = { ...record, status: "SCORED", result: submittedResult };
    if (method === "PATCH" && String(_url).endsWith("/contact")) {
      if (body.revision !== record.revision) return Response.json({ error: { message: "Saved version changed" } }, { status: 409 });
      record = { ...record, answers: { ...record.answers, contact: body.phone }, revision: record.revision + 1 };
      return Response.json(record);
    }
    if (method === "PATCH") {
      if (rejectSave) return Response.json({ error: { message: "Saved version changed", code: "CONFLICT" } }, { status: 409 });
      record = { ...record, answers: body.answers, revision: record.revision + 1 };
    }
    if (method === "DELETE") record = { ...record, reports: [], revision: record.revision + 1 };
    return Response.json(record);
  }) as typeof fetch;
  const router = createMemoryRouter([{ element: <Outlet context={{ userId: "user-a", organizationId: "org-a", role }} />, children: [{ path: "/assessments", element: <p>Assessment list</p> }, { path: "/assessments/:assessmentId", element: <AssessmentEditorPage /> }, { path: "/patients/:id", element: <p>Patient record</p> }] }], { initialEntries: [`/assessments/${locator}`] });
  const root = createRoot(document.getElementById("root")!);
  async function click(label: string) {
    const button = [...document.querySelectorAll("button")].filter(item => (item.textContent?.trim() === label || item.getAttribute("aria-label") === label || item.getAttribute("aria-label")?.startsWith(`${label}: `))).at(-1);
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
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  expect(document.body.textContent).toContain("Unsaved changes");
  await click("Save draft");
  const saved = requests.find(request => request.method === "PATCH");
  expect(saved?.body.revision).toBe(3);
  expect(saved?.body.answers.stage).toBe(recordFixture().manifest.sections.find(section => section.id === "disease_status")!.fields.find(field => field.id === "stage")!.options![0]!.id);
  expect(document.body.textContent).toContain("Draft saved");
}));
test("unit choices stay in this browser without changing saved assessment measurements", async () => harness(async ({ dom, requests, click }) => {
  await click("ft / in");
  expect(document.querySelector<HTMLInputElement>("#assessment-field-height_cm")?.value).toBe("5");
  expect(document.querySelector<HTMLInputElement>("#assessment-field-height_cm-inches")?.value).toBe("4.96");
  await click("lb");
  expect(document.querySelector<HTMLInputElement>("#assessment-field-current_weight_kg")?.value).toBe("132.28");
  expect(JSON.parse(dom.window.localStorage.getItem("niq:measurement-units:org-a:user-a:assessment-a") ?? "null")).toEqual({ height: "ft-in", weight: "lb" });
  expect(document.body.textContent).not.toContain("Unsaved changes");
  expect(requests.some(request => request.method === "PATCH")).toBe(false);
}));
test("quick measurements disappear after selection and save canonical units", async () => harness(async ({ requests, click }) => {
  expect(document.body.textContent).toContain("160 cm");
  await click("160 cm");
  expect(document.body.textContent).not.toContain("160 cm");
  await click("lb");
  expect(document.body.textContent).toContain("150 lb");
  await click("150 lb");
  expect(document.body.textContent).not.toContain("150 lb");
  await click("Save draft");
  const saved = requests.find(request => request.method === "PATCH");
  expect(saved?.body.answers.height_cm).toBe(160);
  expect(saved?.body.answers.current_weight_kg).toBe(68.039);
}, { answers: { ...recordFixture().answers, height_cm: null, current_weight_kg: null } }));
test("save conflict preserves local input and dirty navigation can be cancelled", async () => harness(async ({ click, conflict, router }) => {
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  conflict(); await click("Save draft");
  expect(document.body.textContent).toContain("Saved version changed");
  expect(document.querySelector<HTMLInputElement>('input[type="radio"]')!.checked).toBe(true);
  expect(document.body.textContent).toContain("Load saved version");
  await act(async () => { await router.navigate("/patients/PAT-1"); });
  expect(router.state.location.pathname).toBe("/assessments/assessment-a");
  await click("Stay on assessment");
}));

test("review missing-answer link focuses its field after changing section", async () => harness(async ({ click }) => {
  await click("Review & score");
  expect(document.body.textContent).toContain("1 item needs attention before submission");
  expect(document.body.textContent).toContain("You can still save this draft and return later.");
  expect(document.body.textContent).not.toContain("Attachments are optional");
  const label = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Height:") && button.textContent?.includes("Not answered"))?.textContent?.trim();
  expect(label).toBeDefined();
  await click(label!);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(document.activeElement?.id).toBe("assessment-field-height_cm");
}, { answers: { ...recordFixture().answers, height_cm: null } }));
test("review highlights the section with a blocking answer until it is corrected", async () => harness(async ({ click }) => {
  const nav = document.querySelector('nav[aria-label="Assessment sections"]')!;
  expect(nav.querySelector('[data-has-issue]')).toBeNull();
  await click("Review & score");
  expect(nav.querySelector('button[aria-label="Personal details; needs attention"]')?.getAttribute("data-has-issue")).toBe("true");
  expect(nav.querySelector('button[aria-label="Disease status; needs attention"]')).toBeNull();
  await click("Personal details; needs attention");
  expect(nav.querySelector('button[aria-label="Personal details; needs attention"]')).not.toBeNull();
  await click("50 kg");
  expect(nav.querySelector('button[aria-label="Personal details; needs attention"]')).toBeNull();
}, { answers: { ...recordFixture().answers, current_weight_kg: null } }));
test("scan prerequisites open the missing inputs with inline errors and no summary box", async () => harness(async ({ click, requests }) => {
  await click("Face scan");
  await act(async () => {
    document.querySelector<HTMLInputElement>('input[type="radio"][value="resting"]')!.click();
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  });
  await click("Start face scan");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(document.getElementById("assessment-section-heading")?.textContent).toBe("Personal details");
  expect(document.getElementById("assessment-field-height_cm-error")?.textContent).toContain("Enter a valid height");
  expect(document.getElementById("assessment-field-current_weight_kg-error")?.textContent).toContain("Enter a valid current weight");
  expect(document.activeElement?.id).toBe("assessment-field-height_cm");
  expect(document.body.textContent).not.toContain("Check these fields");
  expect(document.querySelector('nav[aria-label="Assessment sections"]')?.parentElement?.className).not.toContain("rounded-t-xl");
  expect(requests.some(request => request.method === "POST" && request.url.endsWith("/face-scans"))).toBe(false);
}, { answers: { ...recordFixture().answers, height_cm: null, current_weight_kg: null } }, "assessment-a", undefined, "OTHER_MEDICAL", true));

const reportFixture = { id: "report-a", label: "Blood report", purpose: "", datePrecision: "MONTH" as const, year: 2026, month: 8, day: null, files: [] };
test("attachments heading shows the total uploaded files", async () => harness(async ({ click }) => {
  await click("Attachments");
  expect(document.getElementById("assessment-section-heading")?.parentElement?.textContent).toContain("1 file uploaded");
}, { reports: [{ ...reportFixture, files: [{ id: "file-a", reportId: "report-a", originalFilename: "blood-test.pdf", mediaType: "application/pdf", size: 1000, status: "READY", createdAt: "2026-09-24" }] }] }));
test("report cards collapse and expand without leaving attachments", async () => harness(async ({ click }) => {
  await click("Attachments");
  const content = document.getElementById("report-content-report-a")!;
  expect(content.hidden).toBe(false);
  await click("Collapse report 1: Blood report");
  expect(content.hidden).toBe(true);
  expect(document.body.textContent).toContain("Blood report");
  await click("Expand report 1: Blood report");
  expect(content.hidden).toBe(false);
  await click("Collapse report 1: Blood report");
  await click("Edit report details");
  expect(content.hidden).toBe(false);
  expect(document.querySelector<HTMLInputElement>("#report-label")?.value).toBe("Blood report");
}, { reports: [reportFixture] }));
test("report refresh preserves local answers and blocks overwriting concurrent answer edits", async () => harness(async ({ click, remoteAnswers, requests }) => {
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await click("Attachments");
  remoteAnswers({ ...recordFixture().answers, current_weight_kg: 72 });
  await click("Remove report");
  await click("Remove");
  expect(document.body.textContent).toContain("Saved answers changed while updating reports");
  expect(document.body.textContent).toContain("Load saved version");
  await click("Save draft");
  expect(requests.filter(request => request.method === "PATCH")).toHaveLength(0);
}, { reports: [reportFixture] }));

test("report refresh adopts concurrent server answers when local answers are clean", async () => harness(async ({ click, remoteAnswers, requests }) => {
  expect(document.querySelector('button[aria-label="Attachments: 1 report"]')).not.toBeNull();
  await click("Attachments");
  remoteAnswers({ ...recordFixture().answers, current_weight_kg: 72 });
  await click("Remove report");
  await click("Remove");
  expect(document.querySelector('button[aria-label="Attachments"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("Unsaved changes");
  expect(document.body.textContent).not.toContain("Load saved version");
  await click("Save draft");
  expect(requests.filter(request => request.method === "PATCH")).toHaveLength(0);
}, { reports: [reportFixture] }));


test("past scoring rejection does not clutter submission readiness", async () => harness(async ({ click }) => {
  expect(document.body.textContent).not.toContain("Review the questionnaire answers");
  await click("Review & score");
  expect(document.body.textContent).toContain("Ready to submit");
  expect(document.body.textContent).not.toContain("Previous scoring feedback");
  expect(document.body.textContent).not.toContain("Check the value before submitting again.");
}, { submission: { status: "REJECTED", failureCode: "VALIDATION_ERROR", issues: [{ fieldId: "current_weight_kg", message: "Check the value before submitting again." }] } }));

test("past scoring feedback does not reappear after reviewing answers", async () => harness(async ({ click }) => {
  expect(document.body.textContent).not.toContain("Review the questionnaire answers");
  await click("Review & score");
  expect(document.body.textContent).not.toContain("Symptoms: No problem while eating cannot be selected with other symptoms");
  expect(document.body.textContent).not.toContain("Previous scoring feedback");
  expect(document.body.textContent).not.toContain("Review the questionnaire answers");
  await click("Dietary details");
  await click("Review & score");
  expect(document.body.textContent).not.toContain("Previous scoring feedback");
}, { answers: { ...recordFixture().answers, dietary_symptoms: ["dietary_symptoms_no_problem", "dietary_symptoms_nausea"] }, submission: { status: "REJECTED", failureCode: "VALIDATION_ERROR", issues: [{ fieldId: "dietary_symptoms", message: "No problem while eating cannot be selected with other symptoms" }] } }));


test("questionnaire section changes preserve answers without a leave confirmation", async () => harness(async ({ click, dom }) => {
  dom.window.confirm = () => { throw new Error("Section navigation must not use browser confirmation"); };
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const selected = document.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.value;
  await click("Health history");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Disease status");
  expect(document.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.value).toBe(selected);
  expect(document.body.textContent).toContain("Unsaved changes");
}));

test("report editor survives section changes without a discard prompt", async () => harness(async ({ click, dom }) => {
  dom.window.confirm = () => { throw new Error("Section navigation must not use browser confirmation"); };
  await click("Attachments");
  await click("Add report");
  expect(document.body.textContent).toContain("Report name is required. Add a date and file before submitting the assessment; purpose is optional.");
  expect(document.body.textContent).toContain("Create report");
  const input = document.querySelector<HTMLInputElement>('#report-label')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Draft report label");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { bubbles: true, key: "l" }));
  });
  await click("Disease status");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Attachments");
  expect(document.querySelector<HTMLInputElement>('#report-label')?.value).toBe("Draft report label");
}));


test("readable assessment URL loads by reference and saves by internal ID", async () => harness(async ({ requests, click }) => {
  expect(requests[0]?.url).toContain("/assessments/ASM-000001");
  expect(document.querySelector('[aria-label="Breadcrumb"]')?.textContent).toContain("ASM-000001");
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await click("Save draft");
  expect(requests.find(request => request.method === "PATCH")?.url).toContain("/assessments/assessment-a");
}, {}, "ASM-000001"));

test("changing stage clears hidden site and details even after saving", async () => harness(async ({ click, requests }) => {
  await click("Disease status");
  const choose = async (value: string) => act(async () => document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!.click());
  await choose("stage_localized");
  await click("Save draft");
  const saved = requests.find(request => request.method === "PATCH")!.body.answers;
  expect(saved.metastasis_site).toBeUndefined();
  expect(saved.metastasis_other).toBeUndefined();
  await choose("stage_metastatic");
  expect(document.querySelector<HTMLInputElement>('input[type="radio"][value="others"]')?.checked).toBe(false);
  expect(document.querySelector('#assessment-field-metastasis_other')).toBeNull();
}, { answers: { ...recordFixture().answers, stage: "stage_metastatic", metastasis_site: "others", metastasis_other: "Old detail" } }));


test("submission requires every section review and final confirmation", async () => {
  const result: AssessmentScoreResult = { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score: 3, classification: { id: "low", label: "Low", interpretation: "" }, components: recordFixture().manifest.sections.flatMap(section => section.fields.filter(field => field.owner === "scoring").map(field => ({ id: field.id, sectionId: section.id, label: field.label, points: field.id === "stage" ? 3 : null, status: field.id === "stage" ? "answered" as const : "unanswered" as const }))), version: "version-a", checksum: "a".repeat(64), resultReference: "result-a", calculatedAt: "2026-09-22T00:00:00Z", clinicalUsePermitted: true };
  await harness(async ({ click, requests }) => {
    await click("Review & score");
    await click("Submit and request score");
    expect(document.querySelector('[aria-label="Verify assessment before scoring"]')).not.toBeNull();
    expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(false);
    const stepCount = recordFixture().manifest.sections.length + 2;
    for (let index = 0; index < stepCount; index++) {
      expect([...document.querySelectorAll('[aria-label="Verify assessment before scoring"] button')].some(button => button.textContent?.trim() === "Cancel")).toBe(true);
      if (index === 1) {
        expect(document.body.textContent).toContain("Open face scan");
        expect(document.body.textContent).not.toContain("Edit face scan");
        const dialog = document.querySelector('[aria-label="Verify assessment before scoring"]')!;
        const back = [...dialog.querySelectorAll("button")].find(button => button.textContent?.trim() === "Back");
        const next = [...dialog.querySelectorAll("button")].find(button => button.textContent?.trim() === "Next");
        expect(back?.parentElement).toBe(next?.parentElement);
      }
      const reviewCheckbox = document.querySelector<HTMLInputElement>('[aria-label="Verify assessment before scoring"] input[type="checkbox"]')!;
      expect(reviewCheckbox.checked).toBe(false);
      await act(async () => reviewCheckbox.click());
      await click("Next");
    }
    expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(false);
    expect([...document.querySelectorAll('[aria-label="Verify assessment before scoring"] button')].some(button => button.textContent?.trim() === "Cancel")).toBe(true);
    expect(document.body.textContent).toContain(`All ${stepCount} sections reviewed. Your confirmation will be saved with this scoring request.`);
    expect(document.body.textContent).toContain("I have reviewed every section and confirm the information is accurate.");
    expect(document.body.textContent).not.toContain("Review each section before requesting a score.");
    await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Verify assessment before scoring"] input[type="checkbox"]')!.click());
    await click("Confirm and request score");
    expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(true);
    const payload = requests.find(request => request.method === "POST" && request.url.endsWith("/submit"))!.body;
    expect(payload.reviewToken).toBe("review-token-a");
    expect(payload.attestation).toEqual({ statementVersion: 2, reviewedSectionIds: ["personal_details", "face-scan", ...recordFixture().manifest.sections.slice(1).map(section => section.id), "attachments"], confirmed: true });
    expect(document.querySelector('[aria-label="Assessment score review"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Assessment summary");
    expect(document.body.textContent).not.toContain("Back to summary");
  }, { binding: { version: "version-a", checksum: "a".repeat(64) } }, "assessment-a", result);
});

test("blank scoring answers submit through verification and show an unscored summary", async () => {
  const fixture = recordFixture();
  const blank: AssessmentScoreResult = { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score: null, classification: null,
    components: fixture.manifest.sections.flatMap(section => section.fields.filter(field => field.owner === "scoring").map(field => ({ id: field.id, sectionId: section.id, label: field.label, points: null, status: "unanswered" as const }))),
    version: "version-a", checksum: "a".repeat(64), resultReference: "blank-result", calculatedAt: "2026-09-22T00:00:00Z", clinicalUsePermitted: true };
  await harness(async ({ click, requests }) => {
    await click("Review & score");
    await click("Submit and request score");
    for (let index = 0; index < fixture.manifest.sections.length + 2; index++) {
      await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Verify assessment before scoring"] input[type="checkbox"]')!.click());
      await click("Next");
    }
    await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Verify assessment before scoring"] input[type="checkbox"]')!.click());
    await click("Confirm and request score");
    expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(true);
    expect(document.querySelector('[aria-label="Assessment score review"]')).not.toBeNull();
    expect(document.body.textContent).toContain("NIQ score—");
    expect(document.body.textContent).not.toContain("Low Risk");
    expect(document.body.textContent).toContain("Assessment submitted");
  }, { binding: { version: "version-a", checksum: "a".repeat(64) } }, "assessment-a", blank);
});

test("an incomplete saved report is identified before submission", async () => harness(async ({ click, requests }) => {
  await click("Review & score");
  expect(document.body.textContent).toContain("Report 1 needs a date");
  await click("Submit and request score");
  expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(false);
  expect(document.body.textContent).toContain("Report 1 needs a date before submission");
  expect(document.querySelector("#assessment-section-heading")?.textContent).toContain("Attachments");
}, { reports: [{ ...reportFixture, year: null, month: null, files: [{ id: "file-a", reportId: "report-a", originalFilename: "results.pdf", mediaType: "application/pdf", size: 100, status: "READY", createdAt: "2026-09-24" }] }] }));

test("verification stops when saved answers change before the dialog opens", async () => harness(async ({ click, remoteAnswers, requests }) => {
  await click("Review & score");
  remoteAnswers({ ...recordFixture().answers, current_weight_kg: 72 });
  await click("Submit and request score");
  expect(document.querySelector('[aria-label="Verify assessment before scoring"]')).toBeNull();
  expect(document.body.textContent).toContain("The assessment changed before verification");
  expect(requests.some(request => request.method === "POST" && request.url.endsWith("/submit"))).toBe(false);
}));

test("returned scoring confirmations remain visible in review history", async () => harness(async ({ click }) => {
  await click("Review & score");
  expect(document.body.textContent).toContain("Submission verification history");
  expect(document.body.textContent).toContain("Verification 1 · Example Doc");
}, { attestations: [{ submissionId: "old-submission", cycle: 1, revision: 3, confirmedAt: "2026-09-22T20:41:33.104Z", actorMembershipId: "doctor-a", actorDisplayName: "Example Doc", statementVersion: 1, reviewedSectionIds: ["personal_details", "face-scan", "attachments"] }] }));

test("clearing a controlling answer clears dependent answers in the saved draft", async () => harness(async ({ click, requests }) => {
  await click("Disease status");
  await click("Clear Stage");
  expect(document.querySelector('#assessment-field-metastasis_other')).toBeNull();
  await click("Save draft");
  const saved = requests.find(request => request.method === "PATCH")!.body.answers;
  expect(saved.stage).toBeNull();
  expect(saved.metastasis_site).toBeUndefined();
  expect(saved.metastasis_other).toBeUndefined();
}, { answers: { ...recordFixture().answers, stage: "stage_metastatic", metastasis_site: "others", metastasis_other: "Old detail" } }));

test("support cannot open clinical editor or fetch its data", async () => harness(async ({ router, requests }) => {
  expect(router.state.location.pathname).toBe("/assessments");
  expect(requests).toHaveLength(0);
}, {}, "assessment-a", undefined, "SUPPORT"));

for (const role of ["DOCTOR", "NUTRITIONIST"] as const) {
  test(role + " can open an assessment", async () => harness(async ({ router, requests }) => {
    expect(router.state.location.pathname).toBe("/assessments/assessment-a");
    expect(requests.some(request => request.url.endsWith("/assessments/assessment-a"))).toBe(true);
    expect(document.body.textContent).toContain("Personal details");
  }, {}, "assessment-a", undefined, role));
}

test("returned draft assigned to another clinician is read only",async()=>harness(async({requests})=>{
 expect([...document.querySelectorAll("button")].some(button=>button.textContent?.trim()==="Save draft")).toBe(false);
 expect([...document.querySelectorAll("input")].filter(input=>!input.disabled&&!input.readOnly)).toHaveLength(0);
 expect(document.body.textContent).not.toContain("Scoring needs attention");
 expect(document.body.textContent).not.toContain("Retry scoring");
 expect(requests.some(request=>request.method==="PATCH")).toBe(false);
},{canEditDraft:false}));

test("adding contact after dirty answers uses the newly saved assessment revision", async () => harness(async ({ requests, click, dom }) => {
  await click("Disease status");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await click("Personal details");
  await click("Add contact");
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
    input.focus();
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "9876543210");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { bubbles: true, key: "0" }));
  });
  await click("Save contact");
  const writes = requests.filter(request => request.method === "PATCH");
  expect(writes).toHaveLength(2);
  expect(writes[0]!.body.revision).toBe(3);
  expect(writes[1]!.body).toMatchObject({ phone: "9876543210", assessmentId: "assessment-a", revision: 4 });
  expect(document.body.textContent).toContain("Patient contact updated");
}, { answers: { ...recordFixture().answers, contact: "" } }));
