import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { PatientDetailPage } from "./PatientsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const patient = { id, organizationId: id, reference: "PAT-2", displayName: "Example Patient", homeFacility: { id, name: "Hyderabad" }, dateOfBirth: "1999-03-20", gender: "UNKNOWN", phone: "9014936881", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z" };
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: patient.homeFacility, status: "DRAFT", createdAt: "2026-09-22T00:00:00Z", completedAt: null };

async function renderDetail(role: MembershipRole, verify: (body: HTMLElement) => Promise<void> | void) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/patients/PAT-2")) return Response.json(patient);
    if (url.endsWith("/patients/PAT-2/activity")) return Response.json({ items: [{ id, type: "PROFILE_UPDATED", actorName: "Example Admin", occurredAt: "2026-09-23T00:00:00Z" }] });
    if (url.endsWith("/assessments")) return Response.json({ items: [assessment] });
    if (url.endsWith("/facilities")) return Response.json({ items: [{ ...patient.homeFacility, organizationId: id, code: "HYD", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: patient.createdAt, updatedAt: patient.updatedAt }] });
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/patients/:patientLocator", element: <PatientDetailPage /> }] }], { initialEntries: ["/patients/PAT-2"] });
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
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Continue assessment");
    expect(body.querySelector('a[href^="/assessments/new?"]')?.textContent).toContain("New assessment");
    expect(body.querySelector("button")?.textContent).toContain("Edit patient");
    expect(body.textContent).not.toContain("Patient reference");
  });
});

test("support can edit patient details but cannot open a clinical assessment", async () => {
  await renderDetail("SUPPORT", body => {
    expect(body.querySelector('[aria-label="Latest assessment"]')?.textContent).toContain("Draft");
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).toBeNull();
    expect(body.querySelector('a[href^="/assessments/new?"]')).toBeNull();
    expect(body.querySelector("button")?.textContent).toContain("Edit patient");
    expect(body.querySelector('[aria-label="Patient record activity"]')).toBeNull();
  });
});

test("organization admin sees patient activity without changed contact values", async () => {
  await renderDetail("ORGANIZATION_ADMIN", body => {
    expect(body.querySelector('[aria-label="Patient record activity"]')?.textContent).toContain("Profile updated · Example Admin");
    expect(body.querySelector('[aria-label="Patient record activity"]')?.textContent).not.toContain(patient.phone);
  });
});
