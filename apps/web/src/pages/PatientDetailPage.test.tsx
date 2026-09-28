import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { PatientDetailPage } from "./PatientsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-2", displayName: "Example Patient", medicalRecordNumber: "MRN-2", homeFacility: { id, name: "Hyderabad" }, dateOfBirth: "1999-03-20", gender: "UNKNOWN", phone: "9014936881", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z" };
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: patient.homeFacility, status: "DRAFT", myAction: null, isPriority: false, createdAt: "2026-09-22T00:00:00Z", completedAt: null };

async function renderDetail(role: MembershipRole, verify: (body: HTMLElement) => Promise<void> | void, entry = "/patients/PAT-2", options: { summaries?: unknown[]; details?: Record<string, unknown>; reviews?: Record<string, unknown>; clinicalReviews?: Record<string, unknown> } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/patients/PAT-2")) return Response.json(patient);
    if (url.endsWith("/assessments")) return Response.json({ items: options.summaries ?? [assessment] });
    const reviewedId = url.match(/\/assessments\/([^/]+)\/score-reviews$/)?.[1];
    if (reviewedId && options.reviews?.[reviewedId]) return Response.json(options.reviews[reviewedId]);
    const clinicalId = url.match(/\/assessments\/([^/]+)\/clinical-review$/)?.[1];
    if (clinicalId && options.clinicalReviews?.[clinicalId]) return Response.json(options.clinicalReviews[clinicalId]);
    const assessmentId = url.split("/assessments/")[1];
    if (assessmentId && options.details?.[assessmentId]) return Response.json(options.details[assessmentId]);
    if (assessmentId === id) return Response.json({ progress: { answered: 2, required: 6, percent: 33 }, result: null });
    if (url.endsWith("/facilities")) return Response.json({ items: [{ ...patient.homeFacility, organizationId: id, code: "HYD", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: patient.createdAt, updatedAt: patient.updatedAt }] });
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/patients/:patientLocator", element: <PatientDetailPage /> }] }], { initialEntries: [entry] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(document.body);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("clinician sees the latest assessment and actions without switching tabs", async () => {
  await renderDetail("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Draft");
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("4 required answers remaining");
    expect(body.querySelector('[aria-label="Assessment stages"] [aria-current="step"]')?.textContent).toContain("Draft");
    expect(body.querySelector('[aria-label="Assessment stages"] time')?.getAttribute("datetime")).toBe(new Date(assessment.createdAt).toISOString());
    expect(body.querySelector('[aria-label="Assessment stages"]')?.textContent).toContain("Upcoming");
    expect(body.querySelector('[aria-label="Latest assessment"] a[href="/assessments/ASM-000001"]')?.textContent).toContain("Continue assessment");
    expect(body.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("33");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("No NIQ scores yet");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("approved for clinical use");
    expect(body.querySelector('[aria-label="NIQ score trend"] svg[role="img"]')).not.toBeNull();
    expect(body.querySelector('button[aria-label="New assessment"] svg')).not.toBeNull();
    expect(body.querySelector('button[aria-label="Edit patient"] svg')).not.toBeNull();
    expect(body.textContent).not.toContain("Correct MRN");
    expect(body.textContent).not.toContain("Patient reference");
  });
});

test("latest assessment follows the scored and clinical review stages", async () => {
  await renderDetail("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Ready for clinical review");
    expect(body.querySelector('[aria-label="Latest assessment"] a[href="/assessments/ASM-000001"]')?.textContent).toContain("Review & send");
    expect(body.querySelector('[aria-label="Assessment stages"] [aria-current="step"]')?.textContent).toContain("Scored");
  }, "/patients/PAT-2", { summaries: [{ ...assessment, status: "SCORED", myAction: "SEND_FOR_REVIEW" }] });
  await renderDetail("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Clinical review in progress");
    expect(body.querySelector('[aria-label="Assessment stages"] [aria-current="step"]')?.textContent).toContain("Under review");
  }, "/patients/PAT-2", { summaries: [{ ...assessment, status: "UNDER_REVIEW" }] });
});

test("organization admin can open the MRN correction action", async () => {
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    expect(body.textContent).toContain("MRN-2");
    const action = body.querySelector<HTMLButtonElement>('button[aria-label="Correct medical record number"]');
    expect(action).toBeDefined();
    await act(async () => { action!.click(); });
    expect(body.textContent).toContain("Reason for correction");
    const save = [...body.querySelectorAll("button")].find(button => button.textContent?.trim() === "Save correction");
    await act(async () => { save!.click(); });
    expect(body.textContent).toContain("Enter a reason with at least 3 characters.");
  });
});

test("support can edit patient details but cannot open a clinical assessment", async () => {
  await renderDetail("SUPPORT", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Draft");
    expect(body.querySelector('[aria-label="Latest assessment"] a[href="/assessments/ASM-000001"]')).toBeNull();
    expect(body.querySelector('button[aria-label="New assessment"]')).toBeNull();
    expect(body.querySelector('button[aria-label="Edit patient"] svg')).not.toBeNull();
  });
});

test("patient assessment history uses contextual actions without a patient column", async () => {
  const scored = { ...assessment, id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", reference: "ASM-000002", serialNumber: 2, status: "SCORED", isPriority: true };
  const completed = { ...assessment, id: "01ARZ3NDEKTSV4RRFFQ69G5FAX", reference: "ASM-000003", serialNumber: 3, status: "COMPLETED" };
  await renderDetail("DOCTOR", async body => {
    const assessmentsTab = [...body.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab => tab.textContent?.includes("Assessments"));
    await act(async () => { assessmentsTab!.click(); });
    const table = body.querySelector('table[aria-label="Patient assessments"]')!;
    expect([...table.querySelectorAll("th")].map(cell => cell.textContent?.trim())).toEqual(["Assessment", "Facility", "Started", "Status", "Actions"]);
    expect(body.querySelector('a[aria-label="Continue draft ASM-000001"]')).not.toBeNull();
    expect(body.querySelector('a[aria-label="View score ASM-000002"]')).not.toBeNull();
    expect(body.querySelector('a[aria-label="View result ASM-000003"]')).not.toBeNull();
    expect(body.querySelector('button[aria-label="Remove priority from ASM-000002"]')).not.toBeNull();
  }, "/patients/PAT-2", { summaries: [assessment, scored, completed] });
});

test("completed assessments show the reviewed score and trend", async () => {
  const previous = { ...assessment, status: "COMPLETED", completedAt: "2026-09-22T00:00:00Z" };
  const latestId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
  const latest = { ...assessment, id: latestId, reference: "ASM-000002", serialNumber: 2, status: "COMPLETED", createdAt: "2026-09-23T00:00:00Z", completedAt: "2026-09-23T00:00:00Z" };
  const detail = (score: number) => ({
    reference: "ASM-000001", binding: { version: "V1", checksum: "a".repeat(64) },
    manifest: { sections: [{ id: "diet", fields: [{ id: "a", owner: "scoring" }] }] },
    progress: { answered: 6, required: 6, percent: 100, sections: [] }, reports: [],
    result: { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score,
      classification: { id: "low", label: "Low Risk", interpretation: "" }, components: [{ id: "a", sectionId: "diet", label: "A", points: score, status: "answered" }],
      version: "V1", checksum: "a".repeat(64), resultReference: `result-${score}`, calculatedAt: "2026-09-23T00:00:00Z", clinicalUsePermitted: true },
  });
  await renderDetail("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("10 points");
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Low Risk");
    expect(body.querySelector('[aria-label="Assessment stages"] [aria-current="step"]')?.textContent).toContain("Completed");
    expect(body.querySelectorAll('[aria-label="Assessment stages"] time')).toHaveLength(4);
    expect(body.querySelector('[aria-label="Assessment stages"] time[datetime="2026-09-23T02:30:00.000Z"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Latest assessment"] [data-testid="patient-risk-label"]')?.getAttribute("style")).toContain("220, 61, 80");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("+5 points");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("Scores approved for clinical use");
  }, "/patients/PAT-2", { summaries: [latest, previous], details: { [id]: detail(5), [latestId]: detail(8) }, reviews: {
    [id]: { overall: { reviewedPoints: 5 }, risk: { status: "ORIGINAL", classification: { label: "Low Risk" } } },
    [latestId]: { overall: { reviewedPoints: 10 }, risk: { status: "CONFIRMED", classification: { label: "Low Risk", color: "red" } } },
  }, clinicalReviews: { [latestId]: { submittedAt: "2026-09-23T02:30:00Z" } } });
  await renderDetail("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("10 points");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("One NIQ score available");
    expect(body.querySelector('[aria-label="NIQ score trend"]')?.textContent).toContain("10 points");
  }, "/patients/PAT-2", { summaries: [latest], details: { [latestId]: detail(8) }, reviews: {
    [latestId]: { overall: { reviewedPoints: 10 }, risk: { status: "CONFIRMED", classification: { label: "Low Risk" } } },
  } });
});
test("DOB correction link opens the admin correction dialog", async () => {
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(body.textContent).toContain("Correct date of birth");
    expect(body.textContent).toContain("Reason for correction");
  }, "/patients/PAT-2?edit=dateOfBirth");
});
test("clinicians cannot open the DOB correction dialog", async () => {
  await renderDetail("DOCTOR", async body => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(body.textContent).not.toContain("Correct date of birth");
  }, "/patients/PAT-2?edit=dateOfBirth");
});
test("scan correction link focuses the patient's gender field", async () => {
  await renderDetail("DOCTOR", async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(document.activeElement?.id).toBe("patient-gender");
  }, "/patients/PAT-2?edit=gender");
});
