import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { FacilityDetailPage } from "./FacilityDetailPage";

const facilityId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const otherId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const recently = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const facility = { id: facilityId, organizationId: facilityId, name: "Hyderabad", code: "HYD", timezone: "Asia/Kolkata", status: "ACTIVE", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
const patient = { id: facilityId, organizationId: facilityId, reference: "PAT-2", displayName: "Example Patient", homeFacility: { id: facilityId, name: "Hyderabad" }, dateOfBirth: null, gender: "UNKNOWN", createdAt: recently, updatedAt: recently };
const assessment = { id: facilityId, reference: "ASM-000001", serialNumber: 1, organizationId: facilityId, patient: { id: facilityId, reference: "PAT-2", displayName: "Example Patient" }, facility: { id: facilityId, name: "Hyderabad" }, status: "DRAFT", myAction: null, isPriority: false, createdAt: recently, completedAt: null, riskCategory: null };
const team = [
  { membershipId: facilityId, userId: facilityId, email: "doctor@example.test", displayName: "Example Doctor", status: "ACTIVE", role: "DOCTOR", active: true, facilities: [{ id: facilityId, name: "Hyderabad" }], createdAt: facility.createdAt },
  { membershipId: otherId, userId: otherId, email: "other@example.test", displayName: "Other Doctor", status: "ACTIVE", role: "DOCTOR", active: true, facilities: [{ id: otherId, name: "Elsewhere" }], createdAt: facility.createdAt },
];

async function renderDetail(role: MembershipRole, verify: (body: HTMLElement, requested: string[], path: string) => void | Promise<void>, id = facilityId, facilityGate?: Promise<void>, routeFacility?: unknown) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); requested.push(url);
    if (url.endsWith("/facilities")) { await facilityGate; return Response.json({ items: [facility] }); }
    if (url.endsWith("/patients")) return Response.json({ items: [patient] });
    if (url.endsWith("/assessments")) return Response.json({ items: [assessment] });
    if (url.endsWith("/users")) return Response.json({ items: team });
    if (url.endsWith(`/facilities/${facilityId}/performance`)) return Response.json({
      timezone: "Asia/Kolkata",
      assessments: { months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((month, index) => ({ month, count: index === 5 ? 2 : 0 })), previous: { count: 0, through: "2026-08-24" } },
      faceScans: { months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((month, index) => ({ month, count: index === 5 ? 3 : 0 })), previous: { count: 0, through: "2026-08-24" } },
      last30Days: { scored: 4, completed: 2, faceScans: 3 },
      previous30Days: { scored: 1, faceScans: 5 },
      risk: { assessedPatients: 3, categories: { low: 1, moderate: 1, high: 1 } },
    });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  const user = { userId: facilityId, organizationId: facilityId, membershipId: facilityId, email: "user@example.test", displayName: "Example User", role, platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/facilities/:facilityId", element: <FacilityDetailPage /> }] }], { initialEntries: [{ pathname: `/facilities/${id}`, state: routeFacility ? { facility: routeFacility } : null }] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(document.body, requested, router.state.location.pathname);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("shows the full facility detail skeleton until data is ready", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    const loading = body.querySelector('[role="status"][aria-label="Loading facility"]');
    expect(loading).not.toBeNull();
    expect(loading?.querySelectorAll('[aria-label="Facility at a glance"] > .surface')).toHaveLength(4);
    expect(loading?.querySelectorAll('[aria-label="Facility performance"] .surface')).toHaveLength(3);
    expect(loading?.querySelector('[aria-label="Patient risk categories"]')).not.toBeNull();
    expect(loading?.querySelectorAll('.mt-6.grid > .surface')).toHaveLength(2);
    expect(loading?.querySelector('[aria-label="Facility team"]')).not.toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(body.querySelector('[aria-label="Loading facility"]')).toBeNull();
    expect(body.querySelector('h1')?.textContent).toBe("Hyderabad");
  }, facilityId, gate);
});

test("shows known facility details while the overview loads, then refreshes them", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    expect(body.querySelector('[aria-label="Loading facility"] h1')?.textContent).toBe("Earlier name");
    expect(body.querySelector('[aria-label="Loading facility"]')?.textContent).toContain("HYD · Asia/Kolkata");
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(body.querySelector('h1')?.textContent).toBe("Hyderabad");
  }, "hyd", gate, { ...facility, name: "Earlier name" });
});

test("does not display route state from another organization", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    expect(body.querySelector('[aria-label="Loading facility"] h1')).toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
  }, "hyd", gate, { ...facility, organizationId: otherId });
});

test("support loading view omits restricted performance and team sections", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderDetail("SUPPORT", async body => {
    const loading = body.querySelector('[aria-label="Loading facility"]');
    expect(loading?.querySelector('[aria-label="Facility performance"]')).toBeNull();
    expect(loading?.querySelector('[aria-label="Facility team"]')).toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
  }, facilityId, gate);
});

test("admin sees facility metrics, assigned team, and management actions", async () => {
  await renderDetail("ORGANIZATION_ADMIN", (body, requested, path) => {
    expect(path).toBe("/facilities/hyd");
    expect(body.querySelector('[aria-label="Facility at a glance"]')?.textContent).toContain("Total patients1");
    expect(body.querySelector('[aria-label="Facility at a glance"]')?.textContent).toContain("Patients registered1");
    expect(body.querySelector('a[href="/patients?facility=' + facilityId + '"] [aria-label^="Up"]')).toBeNull();
    expect(body.querySelector('[aria-label="Facility at a glance"]')?.textContent).toContain("Assessments completed0");
    expect(body.querySelector('[aria-label="Facility at a glance"] [aria-label="Up 1"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Facility at a glance"] [aria-label="No change 0"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Facility team"]')?.textContent).toContain("Example Doctor");
    expect(body.querySelector('[aria-label="Facility team"]')?.textContent).toContain("1 enabled members");
    expect(body.querySelector('[aria-label="Facility team"]')?.textContent).not.toContain("Other Doctor");
    expect(body.querySelector('[aria-label="Facility team members"]')?.textContent).toContain("NameEmailRole");
    expect(body.querySelector('[aria-label="Facility team members"]')?.textContent).toContain("doctor@example.test");
    expect(body.querySelector('button[aria-label="Edit facility"]')).not.toBeNull();
    expect(body.querySelector('button[aria-label="Deactivate facility"]')).not.toBeNull();
    expect(body.querySelector('a[href="/patients?facility=' + facilityId + '"]')).not.toBeNull();
    expect(body.querySelector('a[href="/assessments?facility=' + facilityId + '&status=WORK"]')).not.toBeNull();
    expect(requested.some(url => url.endsWith("/users"))).toBe(true);
    expect(requested.some(url => url.endsWith(`/facilities/${facilityId}/performance`))).toBe(true);
    expect(body.querySelector('[aria-label="Facility performance"]')?.textContent).toContain("Assessments scored4");
    expect(body.querySelector('[aria-label="Facility performance"]')?.textContent).toContain("Vital IQ captures completed3");
    expect(body.querySelector('[aria-label="Facility performance"] a')).toBeNull();
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')?.className).toContain("text-primary hover:underline");
    expect(body.querySelector('a[href="/patients/PAT-2"]')?.className).toContain("text-primary hover:underline");
    expect(body.querySelector('[aria-label="Facility performance"] [aria-label="Up 300 percent"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Facility performance"] [aria-label="Down 40 percent"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Patient risk categories"] [role="img"]')?.getAttribute("aria-label")).toContain("3 assessed patients");
    expect(body.querySelector('[aria-label="Patient risk categories"] [role="img"]')?.getAttribute("aria-label")).toContain("High risk: 1");
  });
});

test("facility risk legend selects a category and restores the total", async () => {
  await renderDetail("ORGANIZATION_ADMIN", async body => {
    const chart = body.querySelector('[aria-label="Patient risk categories"]')!;
    const moderate = [...chart.querySelectorAll("button")].find(button => button.textContent?.includes("Moderate risk"))!;
    expect(chart.querySelector('[role="img"] strong')?.textContent).toBe("3");
    await act(async () => moderate.click());
    expect(moderate.getAttribute("aria-pressed")).toBe("true");
    expect(chart.querySelector('[role="img"] strong')?.textContent).toBe("1");
    expect(chart.querySelector('[role="img"]')?.getAttribute("style")).toContain("color-mix");
    expect(moderate.className).toContain("bg-muted");
    await act(async () => moderate.click());
    expect(chart.querySelector('[role="img"] strong')?.textContent).toBe("3");
    expect(chart.querySelector('[role="img"]')?.getAttribute("style")).not.toContain("color-mix");
  });
});

test("clinician sees assessment work without facility management", async () => {
  await renderDetail("DOCTOR", (body, requested, path) => {
    expect(path).toBe("/facilities/hyd");
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Facility team"]')).toBeNull();
    expect(body.querySelector('button[aria-label="Edit facility"]')).toBeNull();
    expect(requested.some(url => url.endsWith("/users"))).toBe(false);
    expect(requested.some(url => url.includes("/performance"))).toBe(true);
    expect(body.querySelector('[aria-label="Facility performance"]')?.textContent).toContain("Assessments scored4");
  }, "hyd");
});

test("support sees workflow status but no clinical assessment link", async () => {
  await renderDetail("SUPPORT", (body, requested) => {
    expect(body.querySelector('[aria-label="Facility assessment work"]')?.textContent).toContain("Draft");
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).toBeNull();
    expect(body.querySelector('a[href="/patients/PAT-2"]')).not.toBeNull();
    expect(requested.some(url => url.endsWith("/users"))).toBe(false);
    expect(requested.some(url => url.includes("/performance"))).toBe(false);
    expect(body.querySelector('[aria-label="Facility performance"]')).toBeNull();
  });
});

test("unavailable facility does not expose overview data", async () => {
  await renderDetail("DOCTOR", body => {
    expect(body.textContent).toContain("Facility not found or you do not have access");
    expect(body.querySelector('[aria-label="Facility at a glance"]')).toBeNull();
  }, otherId);
});
