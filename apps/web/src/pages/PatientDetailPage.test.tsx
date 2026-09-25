import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { PatientDetailPage } from "./PatientsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-2", displayName: "Example Patient", medicalRecordNumber: "MRN-2", homeFacility: { id, name: "Hyderabad" }, dateOfBirth: "1999-03-20", gender: "UNKNOWN", phone: "9014936881", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z" };
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: patient.homeFacility, status: "DRAFT", createdAt: "2026-09-22T00:00:00Z", completedAt: null };

async function renderDetail(role: MembershipRole, verify: (body: HTMLElement) => Promise<void> | void, entry = "/patients/PAT-2") {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/patients/PAT-2")) return Response.json(patient);
    if (url.endsWith("/assessments")) return Response.json({ items: [assessment] });
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
    expect(body.querySelector('button[aria-label="Continue assessment"] svg')).not.toBeNull();
    expect(body.querySelector('button[aria-label="New assessment"] svg')).not.toBeNull();
    expect(body.querySelector('button[aria-label="Edit patient"] svg')).not.toBeNull();
    expect(body.textContent).not.toContain("Correct MRN");
    expect(body.textContent).not.toContain("Patient reference");
  });
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
    expect(body.querySelector('button[aria-label="Continue assessment"]')).toBeNull();
    expect(body.querySelector('button[aria-label="New assessment"]')).toBeNull();
    expect(body.querySelector('button[aria-label="Edit patient"] svg')).not.toBeNull();
  });
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
