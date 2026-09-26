import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { MembershipRole } from "@niq/application-contracts";
import { DashboardPage, greetingForHour } from "./DashboardPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-20T00:00:00Z";
const patient = { id, organizationId: id, reference: "PAT-1", displayName: "Example Patient", homeFacility: null, dateOfBirth: null, gender: "UNKNOWN", createdAt: date, updatedAt: date };
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: null, status: "SCORING_UNAVAILABLE", createdAt: date, completedAt: null };

type Scenario = { reviewTotal?: number; assessmentStatus?: string; assessmentCreatedAt?: string; completedAt?: string | null; assessments?: Array<typeof assessment & { myAction?: string | null }>; userLimit?: number | null; highRiskPatients?: number; highRiskPatients30DaysAgo?: number; activity?: { id: string; assessmentId: string; action: string; occurredAt: string }[]; highRiskAssessments?: { patientId: string; assessmentId: string }[] };

test("overview greeting follows the local hour", () => {
  expect(greetingForHour(0)).toBe("Good evening");
  expect(greetingForHour(5)).toBe("Good evening");
  expect(greetingForHour(6)).toBe("Good morning");
  expect(greetingForHour(11)).toBe("Good morning");
  expect(greetingForHour(12)).toBe("Good afternoon");
  expect(greetingForHour(17)).toBe("Good afternoon");
  expect(greetingForHour(18)).toBe("Good evening");
  expect(greetingForHour(23)).toBe("Good evening");
});
async function renderOverview(role: MembershipRole, verify: (body: HTMLElement, requests: string[]) => void | Promise<void>, scenario: Scenario = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url);
    if (url.endsWith("/patients")) return Response.json({ items: [patient] });
    if (url.endsWith("/facilities")) return Response.json({ items: [] });
    if (url.endsWith("/assessments")) return Response.json({ items: scenario.assessments ?? [{ ...assessment, status: scenario.assessmentStatus ?? assessment.status, myAction: scenario.assessmentStatus === "DRAFT" ? "EDIT_DRAFT" : null, createdAt: scenario.assessmentCreatedAt ?? date, completedAt: scenario.completedAt ?? null }] });
    if (url.endsWith("/overview-risk")) return Response.json({ highRiskPatients: scenario.highRiskPatients ?? 1, highRiskPatients30DaysAgo: scenario.highRiskPatients30DaysAgo ?? 0, assessedPatients: 1, categories: { low: 0, moderate: 0, high: 1 }, highRiskAssessments: scenario.highRiskAssessments ?? [] });
    if (url.includes("/overview-activity?")) return Response.json({ items: scenario.activity ?? [] });
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
    await verify(document.body, requests);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("clinician overview shows review work without administrator operations", async () => {
  await renderOverview("DOCTOR", (body, requests) => {
    expect(body.querySelector('header[aria-label="Overview greeting"] h1')?.textContent).toContain("Example User!");
    expect(body.querySelector('header[aria-label="Overview greeting"] svg.text-primary')).not.toBeNull();
    expect(body.querySelector('[aria-label="Open assessment"]')).toBeNull();
    expect(body.querySelector('a[href="/assessments/new"]')?.textContent).toContain("New assessment");
    expect(body.textContent).not.toContain("Resume assessment");
    expect(body.textContent).toContain("Clinical work");
    expect(body.textContent).toContain("My assessment actions");
    expect(body.querySelector('a[href="/assessments?status=MY_ACTIONS"]')).not.toBeNull();
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
    expect(body.textContent).toContain("My reviews in progress");
    expect(body.querySelector('a[href="/assessments?tab=clinical-reviews&review=mine-active"]')).not.toBeNull();
    expect(body.textContent).not.toContain("Organization operations");
    expect(requests.some(url => url.endsWith("/users"))).toBe(false);
  }, { assessmentStatus: "DRAFT" });
});

test("overview cards show accessible patients, completed assessments, high risk and my actions", async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();
  await renderOverview("DOCTOR", body => {
    const cards = body.querySelector('[aria-label="Overview statistics"]');
    expect(cards?.textContent).toContain("Total patients");
    expect(cards?.textContent).toContain("Assessments completed");
    expect(cards?.textContent).toContain("High Risk patients");
    expect(cards?.textContent).toContain("My assessment actions");
    expect(cards?.querySelectorAll(":scope > *")).toHaveLength(4);
    expect(body.querySelector('a[href="/assessments?status=COMPLETED"] strong')?.textContent).toBe("1");
  }, { assessmentStatus: "COMPLETED", assessmentCreatedAt: lastMonth, completedAt: now.toISOString() });
  await renderOverview("DOCTOR", body => {
    expect(body.querySelector('a[href="/assessments?status=COMPLETED"] strong')?.textContent).toBe("1");
  }, { assessmentStatus: "COMPLETED", assessmentCreatedAt: now.toISOString(), completedAt: lastMonth });
});

test("my assessment actions counts only work assigned to the signed-in clinician", async () => {
  const items = [
    { ...assessment, status: "DRAFT", myAction: "EDIT_DRAFT" },
    { ...assessment, id: `${id.slice(0, -1)}B`, reference: "ASM-000002", status: "DRAFT", myAction: null },
    { ...assessment, id: `${id.slice(0, -1)}C`, reference: "ASM-000003", status: "SCORED", myAction: "SEND_FOR_REVIEW" },
  ];
  await renderOverview("DOCTOR", body => {
    expect(body.querySelector('a[href="/assessments?status=MY_ACTIONS"] strong')?.textContent).toBe("2");
    const work = body.querySelector('[aria-label="My assessment actions"]');
    expect(work?.textContent).toContain("ASM-000001");
    expect(work?.textContent).toContain("ASM-000003");
    expect(work?.textContent).not.toContain("ASM-000002");
  }, { assessments: items });
});

test("activity calendar shows the signed-in clinician's actions and high-risk patients link to their final assessment", async () => {
  const now = new Date();
  await renderOverview("DOCTOR", body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]');
    expect(calendar?.textContent).toContain("2 actions");
    expect(calendar?.textContent).toContain("Assessment created");
    expect(calendar?.textContent).toContain("Clinical review completed");
    expect(calendar?.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(2);
    const risk = body.querySelector('[aria-label="Assessment risk and patients needing attention"]');
    expect(risk?.textContent).toContain("Low Risk");
    expect(risk?.textContent).toContain("Moderate Risk");
    expect(risk?.textContent).toContain("High Risk");
    expect(risk?.textContent).toContain("Example Patient");
  }, {
    assessmentStatus: "COMPLETED", completedAt: now.toISOString(),
    highRiskAssessments: [{ patientId: id, assessmentId: id }],
    activity: [
      { id, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: now.toISOString() },
      { id: `${id.slice(0, -1)}B`, assessmentId: id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: now.toISOString() },
    ],
  });
});

test("selecting a calendar date shows only activity from that local day", async () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 10);
  const secondDay = new Date(now.getFullYear(), now.getMonth(), 2, 10);
  await renderOverview("DOCTOR", async body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    await act(async () => { (calendar.querySelector(`[aria-label="${firstDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.textContent).toContain("1 action");
    expect(calendar.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Assessment created");
    expect(calendar.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(1);
    await act(async () => { (calendar.querySelector(`[aria-label="${secondDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.textContent).toContain("1 action");
    expect(calendar.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Clinical review completed");
    expect(calendar.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(1);
  }, { activity: [
    { id, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: firstDay.toISOString() },
    { id: `${id.slice(0, -1)}B`, assessmentId: id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: secondDay.toISOString() },
  ] });
});

test("activity list pages long days, shows legend colors, and resets on date change", async () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 10);
  const secondDay = new Date(now.getFullYear(), now.getMonth(), 2, 10);
  const records = Array.from({ length: 7 }, (_, index) => ({
    ...assessment,
    id: `${id.slice(0, -1)}${index}`,
    reference: `ASM-${String(index + 1).padStart(6, "0")}`,
    status: "DRAFT",
    myAction: null,
  }));
  await renderOverview("DOCTOR", async body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    await act(async () => { (calendar.querySelector(`[aria-label="${firstDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(5);
    expect(calendar.querySelector('nav[aria-label="Activity pages"]')?.textContent).toContain("1–5 of 7");
    expect(calendar.querySelector('a[href^="/assessments/ASM-"] i')?.className).toContain("bg-slate-400");
    await act(async () => { (calendar.querySelector('nav[aria-label="Activity pages"] button:last-child') as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(2);
    expect(calendar.querySelector('nav[aria-label="Activity pages"]')?.textContent).toContain("6–7 of 7");
    await act(async () => { (calendar.querySelector(`[aria-label="${secondDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(1);
    expect(calendar.querySelector('nav[aria-label="Activity pages"]')).toBeNull();
  }, {
    assessments: records,
    activity: [...records.map((record, index) => ({ id: `${id.slice(0, -1)}${index}`, assessmentId: record.id, action: "ASSESSMENT_CREATED", occurredAt: new Date(firstDay.getTime() + index * 60_000).toISOString() })),
      { id: `${id.slice(0, -1)}Z`, assessmentId: records[0]!.id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: secondDay.toISOString() }],
  });
});

test("high-risk direction is red when more patients are high risk and green when fewer are", async () => {
  const highRiskTrend = (body: HTMLElement) => Array.from(body.querySelectorAll('[aria-label="Overview statistics"] > *'))
    .find(card => card.textContent?.includes("High Risk patients"))?.querySelector('[aria-label^="Up"], [aria-label^="Down"]');
  await renderOverview("DOCTOR", body => {
    const trend = highRiskTrend(body);
    expect(trend?.getAttribute("aria-label")).toBe("Up 2");
    expect(trend?.className).toContain("text-destructive");
  }, { highRiskPatients: 3, highRiskPatients30DaysAgo: 1 });
  await renderOverview("DOCTOR", body => {
    const trend = highRiskTrend(body);
    expect(trend?.getAttribute("aria-label")).toBe("Down 2");
    expect(trend?.className).toContain("text-success");
  }, { highRiskPatients: 1, highRiskPatients30DaysAgo: 3 });
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
    expect(body.querySelectorAll('[aria-label="Overview statistics"] > *')).toHaveLength(4);
  }, { reviewTotal: 0, assessmentStatus: "DRAFT", userLimit: null });
});

test("support overview stays focused on patient registration", async () => {
  await renderOverview("SUPPORT", (body, requests) => {
    expect(body.querySelector('[aria-label="Open assessment"]')).toBeNull();
    expect(body.querySelector('a[href="/assessments/new"]')).toBeNull();
    expect(body.querySelectorAll('[aria-label="Overview statistics"] > *')).toHaveLength(1);
    expect(body.textContent).toContain("Patient registration");
    expect(body.textContent).toContain("Example Patient");
    expect(requests.some(url => url.endsWith("/assessments") || url.includes("/clinical-reviews?"))).toBe(false);
  });
});
