import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { DashboardPage } from "./DashboardPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-20T00:00:00Z";
const patient = { id, organizationId: id, reference: "PAT-1", displayName: "Example Patient", homeFacility: null, dateOfBirth: null, gender: "UNKNOWN", createdAt: date, updatedAt: date };
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: null, status: "SCORING_UNAVAILABLE", createdAt: date, completedAt: null };

type Scenario = { reviewTotal?: number; assessmentStatus?: string; assessmentCreatedAt?: string; completedAt?: string | null; userLimit?: number | null };
async function renderOverview(role: MembershipRole, verify: (body: HTMLElement, requests: string[]) => void, scenario: Scenario = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url);
    if (url.endsWith("/patients")) return Response.json({ items: [patient] });
    if (url.endsWith("/facilities")) return Response.json({ items: [] });
    if (url.endsWith("/assessments")) return Response.json({ items: [{ ...assessment, status: scenario.assessmentStatus ?? assessment.status, createdAt: scenario.assessmentCreatedAt ?? date, completedAt: scenario.completedAt ?? null }] });
    if (url.endsWith("/users")) return Response.json({ items: [{ membershipId: id, userId: id, email: "admin@example.test", displayName: "Admin", status: "ACTIVE", role, active: true, createdAt: date }] });
    if (url.includes("/clinical-reviews?")) return Response.json({ items: [], total: scenario.reviewTotal ?? 2, page: 1, pageSize: 3 });
    if (url.endsWith(`/organizations/${id}`)) return Response.json({ organization: { id, legalName: "Example Health", displayName: "Example Health", slug: "example-health", logoObjectKey: null, primaryColor: "#006B5F", secondaryColor: "#FFFFFF", patientReferencePrefix: "PAT", status: "ACTIVE", createdAt: date, updatedAt: date }, entitlement: { userLimit: scenario.userLimit === undefined ? 5 : scenario.userLimit, effectiveFrom: date }, invitations: [], scoringConnection: null });
    return Response.json({ error: { code: "UNAVAILABLE", message: "Scoring unavailable" } }, { status: 503 });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/", element: <DashboardPage /> }] }], { initialEntries: ["/"] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    verify(document.body, requests);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("clinician overview shows review work without administrator operations", async () => {
  await renderOverview("DOCTOR", (body, requests) => {
    expect(body.textContent).toContain("Clinical work");
    expect(body.textContent).toContain("Open assessments in your facilities");
    expect(body.querySelector('a[href="/assessments?status=OPEN"]')).not.toBeNull();
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
    expect(body.textContent).toContain("My reviews in progress");
    expect(body.querySelector('a[href="/assessments?tab=clinical-reviews&review=mine-active"]')).not.toBeNull();
    expect(body.textContent).not.toContain("Organization operations");
    expect(requests.some(url => url.endsWith("/users"))).toBe(false);
  }, { assessmentStatus: "DRAFT" });
});

test("summary distinguishes accessible patients from assessments completed this month", async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();
  await renderOverview("DOCTOR", body => {
    expect(body.textContent).toContain("Patients in your facilities");
    expect(body.textContent).toContain("Patients registered this month");
    expect(body.textContent).toContain("Assessments completed this month");
    expect(body.querySelector('a[href="/assessments?status=COMPLETED_THIS_MONTH"] strong')?.textContent).toBe("1");
  }, { assessmentStatus: "COMPLETED", assessmentCreatedAt: lastMonth, completedAt: now.toISOString() });
  await renderOverview("DOCTOR", body => {
    expect(body.querySelector('a[href="/assessments?status=COMPLETED_THIS_MONTH"] strong')?.textContent).toBe("0");
  }, { assessmentStatus: "COMPLETED", assessmentCreatedAt: now.toISOString(), completedAt: lastMonth });
});

test("organization admin sees actionable operations but no clinician review card", async () => {
  await renderOverview("ORGANIZATION_ADMIN", body => {
    expect(body.textContent).toContain("Organization operations");
    expect(body.textContent).toContain("Scoring unavailable");
    expect(body.querySelector('a[href="/assessments?status=SCORING_UNAVAILABLE"]')).not.toBeNull();
    expect(body.textContent).not.toContain("My reviews in progress");
    expect(body.textContent).toContain("Team and user seats");
    expect(body.textContent).toContain("1 of 5 seats reserved");
    expect(body.textContent).not.toContain("Enabled users");
  });
});

test("empty clinician review work becomes a short message", async () => {
  await renderOverview("DOCTOR", body => {
    expect(body.textContent).toContain("No reviews are waiting or assigned to you.");
    expect(body.textContent).not.toContain("My reviews in progress");
  }, { reviewTotal: 0, assessmentStatus: "DRAFT" });
});

test("zero admin alerts collapse and unlimited seats stay compact", async () => {
  await renderOverview("ORGANIZATION_ADMIN", body => {
    expect(body.textContent).toContain("All clear");
    expect(body.textContent).toContain("Unlimited seats");
    expect(body.textContent).not.toContain("Awaiting review assignment");
    expect(body.querySelectorAll('[aria-label="Workspace summary"] > a')).toHaveLength(4);
  }, { reviewTotal: 0, assessmentStatus: "DRAFT", userLimit: null });
});

test("support overview stays focused on patient registration", async () => {
  await renderOverview("SUPPORT", (body, requests) => {
    expect(body.textContent).toContain("Patient registration");
    expect(body.textContent).toContain("Example Patient");
    expect(requests.some(url => url.endsWith("/assessments") || url.includes("/clinical-reviews?"))).toBe(false);
  });
});
