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
const assessment = { id, reference: "ASM-000001", serialNumber: 1, organizationId: id, patient: { id, reference: patient.reference, displayName: patient.displayName }, facility: null, status: "SCORING_UNAVAILABLE", isPriority: false, createdAt: date, completedAt: null };

type Scenario = { reviewTotal?: number; assessmentStatus?: string; assessmentCreatedAt?: string; completedAt?: string | null; patients?: typeof patient[]; assessments?: Array<typeof assessment & { myAction?: string | null; updatedAt?: string }>; userLimit?: number | null; highRiskPatients?: number; highRiskPatients30DaysAgo?: number; riskDelayMs?: number; risk?: { assessedPatients: number; categories: { low: number; moderate: number; high: number }; categories30DaysAgo: { low: number; moderate: number; high: number } }; nutrition?: { protein: { assessed: number; inadequate: number }; eatingBarrier: { assessed: number; top: { id: string; label: string; count: number } | null } }; activity?: { id: string; assessmentId: string; action: string; occurredAt: string }[]; highRiskAssessments?: { patientId: string; assessmentId: string }[] };

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
    if (url.endsWith("/patients")) return Response.json({ items: scenario.patients ?? [patient] });
    if (url.endsWith("/facilities")) return Response.json({ items: [] });
    if (url.endsWith("/assessments")) return Response.json({ items: scenario.assessments ?? [{ ...assessment, status: scenario.assessmentStatus ?? assessment.status, myAction: scenario.assessmentStatus === "DRAFT" ? "EDIT_DRAFT" : null, createdAt: scenario.assessmentCreatedAt ?? date, completedAt: scenario.completedAt ?? null }] });
    if (url.includes("/overview-summary?")) {
      const query = new URL(url, "http://localhost").searchParams;
      const patients = scenario.patients ?? [patient];
      const assessments = scenario.assessments ?? [{ ...assessment, status: scenario.assessmentStatus ?? assessment.status, myAction: scenario.assessmentStatus === "DRAFT" ? "EDIT_DRAFT" : null, createdAt: scenario.assessmentCreatedAt ?? date, completedAt: scenario.completedAt ?? null }];
      const now = Date.now();
      const recent = patients.map(person => ({ patient: person, assessment: assessments.filter(item => item.patient.id === person.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null }))
        .filter(item => role === "SUPPORT" || Math.max(new Date(item.patient.createdAt).getTime(), new Date(item.assessment?.createdAt ?? 0).getTime()) >= now - 3 * 86400_000)
        .sort((a, b) => Math.max(new Date(b.patient.createdAt).getTime(), new Date(b.assessment?.createdAt ?? 0).getTime()) - Math.max(new Date(a.patient.createdAt).getTime(), new Date(a.assessment?.createdAt ?? 0).getTime()));
      const priority = assessments.filter(item => item.isPriority);
      const priorityPage = Number(query.get("priorityPage") ?? 1);
      const recentPage = Number(query.get("recentPage") ?? 1);
      const added = (value: string) => new Date(value).getTime() >= now - 30 * 86400_000 && new Date(value).getTime() <= now;
      return Response.json({ patientCount: patients.length, patientsAdded30Days: patients.filter(item => added(item.createdAt)).length,
        completedCount: assessments.filter(item => item.status === "COMPLETED").length,
        completedAdded30Days: assessments.filter(item => item.status === "COMPLETED" && item.completedAt && added(item.completedAt)).length,
        myAssessmentActions: assessments.filter(item => item.myAction).length,
        readyToSend: assessments.filter(item => item.myAction === "SEND_FOR_REVIEW").length,
        correctionsToMake: assessments.filter(item => item.myAction === "CORRECT_DRAFT").length,
        scoringIssues: assessments.filter(item => item.status === "SCORING_UNAVAILABLE").length,
        priority: { total: priority.length, page: priorityPage, pageSize: 3, items: priority.slice((priorityPage - 1) * 3, priorityPage * 3) },
        recent: { total: recent.length, page: recentPage, pageSize: 4, items: recent.slice((recentPage - 1) * 4, recentPage * 4) },
      });
    }
    if (url.endsWith("/overview-risk")) {
      if (scenario.riskDelayMs) await new Promise(resolve => setTimeout(resolve, scenario.riskDelayMs));
      return Response.json({ highRiskPatients: scenario.highRiskPatients ?? 1, highRiskPatients30DaysAgo: scenario.highRiskPatients30DaysAgo ?? 0, assessedPatients: 1, categories: { low: 0, moderate: 0, high: 1 }, categories30DaysAgo: { low: 0, moderate: 0, high: scenario.highRiskPatients30DaysAgo ?? 0 }, highRiskAssessments: scenario.highRiskAssessments ?? [], nutrition: scenario.nutrition ?? { protein: { assessed: 0, inadequate: 0 }, eatingBarrier: { assessed: 0, top: null } }, ...scenario.risk });
    }
    if (url.includes("/overview-activity")) {
      const request = new URL(url, "http://localhost");
      const from = new Date(request.searchParams.get("from")!);
      const to = new Date(request.searchParams.get("to")!);
      const key = (value: string) => {
        const at = new Date(value);
        return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
      };
      const latest = new Map<string, NonNullable<Scenario["activity"]>[number]>();
      for (const event of scenario.activity ?? []) {
        const at = new Date(event.occurredAt);
        if (at < from || at >= to) continue;
        const eventKey = `${key(event.occurredAt)}:${event.assessmentId}:${event.action}`;
        if (!latest.has(eventKey) || latest.get(eventKey)!.occurredAt < event.occurredAt) latest.set(eventKey, event);
      }
      const events = [...latest.values()];
      if (!request.pathname.endsWith("/day")) {
        const days = [...new Set(events.map(event => key(event.occurredAt)))].sort().reverse().map(day => {
          const daily = events.filter(event => key(event.occurredAt) === day);
          return { day, assessmentCount: new Set(daily.map(event => event.assessmentId)).size, milestoneCount: daily.length, actions: [...new Set(daily.map(event => event.action))] };
        });
        return Response.json({ days });
      }
      const records = scenario.assessments ?? [assessment];
      const actionOrder = ["ASSESSMENT_CREATED", "ASSESSMENT_SUBMITTED", "CLINICAL_REVIEW_COMPLETE"];
      const grouped = [...new Set(events.map(event => event.assessmentId))].map(assessmentId => ({
        assessmentId,
        record: records.find(record => record.id === assessmentId),
        milestones: events.filter(event => event.assessmentId === assessmentId).sort((a, b) => actionOrder.indexOf(a.action) - actionOrder.indexOf(b.action)),
      })).sort((a, b) => actionOrder.indexOf(a.milestones[0]!.action) - actionOrder.indexOf(b.milestones[0]!.action));
      const page = Number(request.searchParams.get("page") ?? 1);
      return Response.json({ assessmentCount: grouped.length, milestoneCount: events.length, pageCount: Math.ceil(grouped.length / 4), assessments: grouped.slice((page - 1) * 4, page * 4).map(group => ({ assessmentId: group.assessmentId, reference: group.record!.reference, patientDisplayName: group.record!.patient.displayName, milestones: group.milestones.map(event => ({ action: event.action, occurredAt: event.occurredAt })) })) });
    }
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

test("overview statistics load while risk calculation is still running", async () => {
  await renderOverview("DOCTOR", async (body, requests) => {
    expect(body.querySelector('a[href="/patients"] strong')?.textContent).toBe("1");
    expect(requests.some(url => url.endsWith("/patients") || url.endsWith("/assessments"))).toBe(false);
    expect(requests.some(url => url.includes("/overview-summary?"))).toBe(true);
    expect(body.querySelector('[aria-label="Assessment risk overview"]')).toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
    expect(body.querySelector('[aria-label="Assessment risk overview"]')).not.toBeNull();
  }, { riskDelayMs: 60 });
});

test("clinician overview shows review work without administrator operations", async () => {
  await renderOverview("DOCTOR", (body, requests) => {
    expect(body.querySelector('header[aria-label="Overview greeting"] h1')?.textContent).toContain("Example User!");
    expect(body.querySelector('header[aria-label="Overview greeting"] svg.text-primary')).not.toBeNull();
    expect(body.querySelector('[aria-label="Open assessment"]')).toBeNull();
    expect(body.querySelector('header[aria-label="Overview greeting"] a[href="/assessments/new"]')).toBeNull();
    expect(body.querySelector('[aria-label="Quick actions"] a[href="/assessments/new"]')?.textContent).toContain("New assessment");
    expect(body.textContent).not.toContain("Resume assessment");
    expect(body.textContent).toContain("My assessment actions");
    expect(body.querySelector('a[href="/assessments?status=MY_ACTIONS"]')).not.toBeNull();
    expect(body.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Quick actions"] a[href="/assessments?tab=clinical-reviews"]')?.textContent).toContain("2 waiting · 2 in progress");
    expect(body.querySelector('[aria-label="Clinical work"]')).toBeNull();
    expect(body.textContent).not.toContain("Organization operations");
    expect(requests.some(url => url.endsWith("/users"))).toBe(false);
  }, { assessmentStatus: "DRAFT", patients: [{ ...patient, createdAt: new Date().toISOString() }] });
});

test("priority assessments precede quick actions, which link to new care and reviews", async () => {
  await renderOverview("DOCTOR", body => {
    const actions = body.querySelector('[aria-label="Quick actions"]');
    const priority = body.querySelector('[aria-label="Priority assessments"]');
    const activity = body.querySelector('[aria-label="My assessment activity"]');
    expect(actions).not.toBeNull();
    expect(priority).not.toBeNull();
    expect(activity).not.toBeNull();
    expect(priority!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions!.compareDocumentPosition(activity!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions?.textContent).not.toContain("Continue draft");
    expect(actions?.querySelector('a[href="/assessments/ASM-000001"]')).toBeNull();
    expect(actions?.querySelector('a[href="/assessments/new"]')?.textContent).toContain("New assessment");
    expect(actions?.querySelector('a[href="/patients/new"]')).toBeNull();
    expect(actions?.querySelector('a[href="/assessments?tab=clinical-reviews"]')?.textContent).toContain("Clinical reviews");
    expect(actions?.querySelector('a[href="/assessments?tab=clinical-reviews"]')?.textContent).toContain("2 waiting · 2 in progress");
  }, { assessmentStatus: "DRAFT" });
});

test("quick actions keep send and correction links visible with assigned counts", async () => {
  const items = [
    { ...assessment, id: `${id.slice(0, -1)}1`, reference: "ASM-000001", status: "SCORED", myAction: "SEND_FOR_REVIEW" },
    { ...assessment, id: `${id.slice(0, -1)}2`, reference: "ASM-000002", status: "DRAFT", myAction: "CORRECT_DRAFT" },
    { ...assessment, id: `${id.slice(0, -1)}3`, reference: "ASM-000003", status: "DRAFT", myAction: "EDIT_DRAFT" },
  ];
  await renderOverview("DOCTOR", body => {
    const actions = body.querySelector('[aria-label="Quick actions"]');
    expect(actions?.querySelector('a[href="/assessments?status=SEND_FOR_REVIEW"]')?.textContent).toContain("Ready to send1 assessment");
    expect(actions?.querySelector('a[href="/assessments?status=CORRECT_DRAFT"]')?.textContent).toContain("Corrections to make1 assessment");
  }, { assessments: items });
  await renderOverview("DOCTOR", body => {
    const actions = body.querySelector('[aria-label="Quick actions"]');
    expect(actions?.querySelector('a[href="/assessments?status=SEND_FOR_REVIEW"]')?.textContent).toContain("Ready to send0 assessments");
    expect(actions?.querySelector('a[href="/assessments?status=CORRECT_DRAFT"]')?.textContent).toContain("Corrections to make0 assessments");
  }, { assessments: [items[2]!] });
});

test("bottom cards show recent patients and data-backed nutrition insights", async () => {
  const now = new Date();
  await renderOverview("DOCTOR", body => {
    const cards = body.querySelector('[aria-label="Recent patients and NIQ insights"]');
    expect(cards?.textContent).toContain("Example Patient");
    expect(cards?.textContent).toContain("ASM-000001");
    expect(cards?.textContent).toContain("Key nutrition insights");
    expect(cards?.textContent).toContain("At nutritional risk1 of 1 patient (100%) · no 30-day comparison yet");
    expect(cards?.textContent).toContain("Low protein intakeNo protein results yet");
  }, { assessmentStatus: "COMPLETED", completedAt: date, patients: [{ ...patient, createdAt: now.toISOString() }] });
});

test("nutrition insights do not invent metrics before final categories exist", async () => {
  await renderOverview("DOCTOR", body => {
    const card = body.querySelector('[aria-label="Key nutrition insights"]');
    expect(card?.textContent).toContain("No completed NIQ results yet");
    expect(card?.textContent).not.toContain("At nutritional risk");
  }, { risk: { assessedPatients: 0, categories: { low: 0, moderate: 0, high: 0 }, categories30DaysAgo: { low: 0, moderate: 0, high: 0 } } });
});

test("nutrition insights compare patient risk percentages with the prior snapshot", async () => {
  await renderOverview("DOCTOR", body => {
    const card = body.querySelector('[aria-label="Key nutrition insights"]');
    expect(card?.textContent).toContain("At nutritional risk1 of 2 patients (50%) · 100% 30 days ago");
    expect(card?.textContent).toContain("No protein results yet");
  }, { risk: { assessedPatients: 2, categories: { low: 1, moderate: 0, high: 1 }, categories30DaysAgo: { low: 0, moderate: 0, high: 1 } } });
});

test("nutrition insights show protein intake and the most reported eating barrier", async () => {
  await renderOverview("DOCTOR", body => {
    const card = body.querySelector('[aria-label="Key nutrition insights"]');
    expect(card?.textContent).toContain("Low protein intake2 of 3 patients with protein results");
    expect(card?.textContent).toContain("Top eating symptomNo appetite · 2 of 3 at-risk patients");
  }, { nutrition: { protein: { assessed: 3, inadequate: 2 }, eatingBarrier: { assessed: 3, top: { id: "dietary_symptoms_no_appetite", label: "No appetite", count: 2 } } } });
});

test("recent patients paginate four at a time and keep View all", async () => {
  const now = Date.now();
  const patients = Array.from({ length: 5 }, (_, index) => ({
    ...patient,
    id: `${id.slice(0, -1)}${index}`,
    reference: `PAT-${index + 1}`,
    displayName: `Patient ${index + 1}`,
    createdAt: new Date(now - (5 - index) * 60 * 60 * 1000).toISOString(),
  }));
  await renderOverview("DOCTOR", async body => {
    const cards = body.querySelector('[aria-label="Recent patients and NIQ insights"]')!;
    const recent = cards.querySelector('.surface')!;
    const pages = recent.querySelector('[aria-label="Recent patient pages"]')!;
    expect(recent.querySelector('a[href="/patients"]')?.textContent).toContain("View all");
    expect(recent.querySelectorAll('a[href^="/patients/PAT-"]')).toHaveLength(4);
    expect(pages.textContent).toContain("Page 1 of 2");
    expect(recent.querySelector('a[href="/patients/PAT-5"]')).not.toBeNull();
    await act(async () => { (Array.from(pages.querySelectorAll('button')).find(button => button.textContent === "Next") as HTMLButtonElement).click(); });
    expect(recent.querySelectorAll('a[href^="/patients/PAT-"]')).toHaveLength(1);
    expect(recent.querySelector('a[href="/patients/PAT-1"]')).not.toBeNull();
    expect(pages.textContent).toContain("Page 2 of 2");
  }, { patients });
});

test("recent patients includes registrations or assessments from the last three days", async () => {
  const now = Date.now();
  const oldDate = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const oldPatient = { ...patient, id, reference: "PAT-1", createdAt: oldDate };
  const returningPatient = { ...patient, id: `${id.slice(0, -1)}B`, reference: "PAT-2", createdAt: oldDate };
  const newPatient = { ...patient, id: `${id.slice(0, -1)}C`, reference: "PAT-3", createdAt: recentDate };
  await renderOverview("DOCTOR", body => {
    const recent = body.querySelector('[aria-label="Recent patients and NIQ insights"] .surface')!;
    expect(recent.textContent).toContain("Last 3 days");
    expect(recent.querySelector('a[href="/patients/PAT-1"]')).toBeNull();
    expect(recent.querySelector('a[href="/patients/PAT-2"]')).not.toBeNull();
    expect(recent.querySelector('a[href="/patients/PAT-3"]')).not.toBeNull();
  }, { patients: [oldPatient, returningPatient, newPatient], assessments: [{ ...assessment, patient: { id: returningPatient.id, reference: returningPatient.reference, displayName: returningPatient.displayName }, createdAt: recentDate, myAction: null }] });
});

test("overview cards show accessible patients, completed assessments, high risk and my actions", async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();
  await renderOverview("DOCTOR", body => {
    const cards = body.querySelector('[aria-label="Overview statistics"]');
    expect(cards?.textContent).toContain("Total patients");
    expect(cards?.textContent).toContain("Assessments completed");
    expect(cards?.textContent).toContain("High risk patients");
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
    const actions = body.querySelector('[aria-label="Quick actions"]');
    expect(actions?.querySelector('a[href^="/assessments/ASM-"]')).toBeNull();
  }, { assessments: items });
});

test("activity calendar shows the signed-in clinician's actions and the risk overview", async () => {
  const now = new Date();
  await renderOverview("DOCTOR", body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]');
    expect(calendar?.textContent).toContain("1 assessment · 2 milestones");
    expect(calendar?.textContent).toContain("Assessment created");
    expect(calendar?.textContent).toContain("Clinical review completed");
    expect(calendar?.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(1);
    const milestoneText = calendar?.querySelector('a[href="/assessments/ASM-000001"]')?.textContent ?? "";
    expect(milestoneText.indexOf("Assessment created")).toBeLessThan(milestoneText.indexOf("Clinical review completed"));
    const markers = [...(calendar?.querySelectorAll('a[href="/assessments/ASM-000001"] i') ?? [])].map(marker => marker.className);
    expect(markers.some(marker => marker.includes("bg-slate-400"))).toBe(true);
    expect(markers.some(marker => marker.includes("bg-amber-500"))).toBe(true);
    expect(calendar?.querySelector('button[aria-label*="1 assessment, 2 milestones"]')).not.toBeNull();
    const risk = body.querySelector('[aria-label="Assessment risk overview"]');
    expect(risk?.textContent).toContain("Low Risk");
    expect(risk?.textContent).toContain("Moderate Risk");
    expect(risk?.textContent).toContain("High Risk");
    expect(body.textContent).not.toContain("Patients needing attention");
  }, {
    assessmentStatus: "COMPLETED", completedAt: now.toISOString(),
    highRiskAssessments: [{ patientId: id, assessmentId: id }],
    activity: [
      { id: `${id.slice(0, -1)}B`, assessmentId: id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: now.toISOString() },
      { id, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: now.toISOString() },
    ],
  });
});

test("risk overview reveals category counts when a legend item is selected", async () => {
  await renderOverview("DOCTOR", async body => {
    const overview = body.querySelector('[aria-label="Assessment risk overview"]')!;
    const chart = overview.querySelector('[role="img"]')!;
    expect(chart.textContent).toContain("6scored patients");
    const moderate = [...overview.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Moderate Risk"))!;
    expect(moderate.textContent).toContain("2");
    await act(async () => moderate.click());
    expect(chart.textContent).toContain("2Moderate Risk");
    expect(moderate.getAttribute("aria-pressed")).toBe("true");
  }, { risk: { assessedPatients: 6, categories: { low: 1, moderate: 2, high: 3 }, categories30DaysAgo: { low: 0, moderate: 0, high: 0 } } });
});

test("priority assessments appear beside quick actions", async () => {
  await renderOverview("DOCTOR", body => {
    const actions = body.querySelector('[aria-label="Quick actions"]');
    const priority = body.querySelector('[aria-label="Priority assessments"]');
    expect(actions?.parentElement).toBe(priority?.parentElement);
    expect(priority?.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Example Patient");
    expect(priority?.textContent).not.toContain("Nothing marked yet");
  }, { assessments: [{ ...assessment, isPriority: true, myAction: null }] });
});

test("priority assessments paginate three at a time", async () => {
  const priorities = Array.from({ length: 4 }, (_, index) => ({
    ...assessment,
    id: `${id.slice(0, -1)}${index}`,
    reference: `ASM-${String(index + 1).padStart(6, "0")}`,
    isPriority: true,
    myAction: null,
  }));
  await renderOverview("DOCTOR", async body => {
    const priority = body.querySelector('[aria-label="Priority assessments"]')!;
    const pages = priority.querySelector('[aria-label="Priority assessment pages"]')!;
    expect(priority.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(3);
    expect(pages.textContent).toContain("Page 1 of 2");
    await act(async () => { (Array.from(pages.querySelectorAll('button')).find(button => button.textContent === "Next") as HTMLButtonElement).click(); });
    expect(priority.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(1);
    expect(priority.querySelector('a[href="/assessments/ASM-000004"]')).not.toBeNull();
    expect(pages.textContent).toContain("Page 2 of 2");
    await act(async () => { (Array.from(pages.querySelectorAll('button')).find(button => button.textContent === "Previous") as HTMLButtonElement).click(); });
    expect(priority.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
  }, { assessments: priorities });
});

test("selecting a calendar date shows only activity from that local day", async () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 10);
  const secondDay = new Date(now.getFullYear(), now.getMonth(), 2, 10);
  await renderOverview("DOCTOR", async body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    await act(async () => { (calendar.querySelector(`[aria-label^="${firstDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.textContent).toContain("1 assessment · 1 milestone");
    expect(calendar.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Assessment created");
    expect(calendar.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(1);
    await act(async () => { (calendar.querySelector(`[aria-label^="${secondDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.textContent).toContain("1 assessment · 1 milestone");
    expect(calendar.querySelector('a[href="/assessments/ASM-000001"]')?.textContent).toContain("Clinical review completed");
    expect(calendar.querySelectorAll('a[href="/assessments/ASM-000001"]')).toHaveLength(1);
  }, { activity: [
    { id, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: firstDay.toISOString() },
    { id: `${id.slice(0, -1)}B`, assessmentId: id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: secondDay.toISOString() },
  ] });
});

test("calendar markers always follow the legend order", async () => {
  const day = new Date();
  const at = (hour: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).toISOString();
  await renderOverview("DOCTOR", body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    const dateButton = calendar.querySelector('button[aria-label*="1 assessment, 3 milestones"]')!;
    const colors = [...dateButton.querySelectorAll(':scope > span:last-child > span')].map(marker =>
      [...marker.classList].find(name => name.startsWith("bg-")));
    expect(colors).toEqual(["bg-slate-400", "bg-primary", "bg-amber-500"]);
  }, { activity: [
    { id, assessmentId: id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: at(11) },
    { id: `${id.slice(0, -1)}B`, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: at(9) },
    { id: `${id.slice(0, -1)}C`, assessmentId: id, action: "ASSESSMENT_SUBMITTED", occurredAt: at(10) },
  ] });
});

test("daily assessment rows follow the same activity order", async () => {
  const day = new Date();
  const at = (hour: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).toISOString();
  const records = ["A", "B", "C"].map((suffix, index) => ({
    ...assessment, id: `${id.slice(0, -1)}${suffix}`, reference: `ASM-${String(index + 1).padStart(6, "0")}`, myAction: null,
  }));
  await renderOverview("DOCTOR", body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    expect([...calendar.querySelectorAll('a[href^="/assessments/ASM-"]')].map(link => link.getAttribute("href")))
      .toEqual(["/assessments/ASM-000001", "/assessments/ASM-000002", "/assessments/ASM-000003"]);
  }, { assessments: records, activity: [
    { id: `${id.slice(0, -1)}D`, assessmentId: records[2]!.id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: at(11) },
    { id: `${id.slice(0, -1)}E`, assessmentId: records[0]!.id, action: "ASSESSMENT_CREATED", occurredAt: at(9) },
    { id: `${id.slice(0, -1)}F`, assessmentId: records[1]!.id, action: "ASSESSMENT_SUBMITTED", occurredAt: at(10) },
  ] });
});

test("changing month selects its latest active day instead of an empty first day", async () => {
  const now = new Date();
  const previousMonthActivity = new Date(now.getFullYear(), now.getMonth() - 1, 12, 10);
  await renderOverview("DOCTOR", async body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    await act(async () => { (calendar.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click(); });
    expect(calendar.querySelector('h3')?.textContent).toBe(previousMonthActivity.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    expect(calendar.querySelector('a[href="/assessments/ASM-000001"]')).not.toBeNull();
  }, { activity: [{ id, assessmentId: id, action: "ASSESSMENT_CREATED", occurredAt: previousMonthActivity.toISOString() }] });
});

test("activity pagination counts assessments, shows legend colors, and resets on date change", async () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 10);
  const secondDay = new Date(now.getFullYear(), now.getMonth(), 2, 10);
  const records = Array.from({ length: 6 }, (_, index) => ({
    ...assessment,
    id: `${id.slice(0, -1)}${index}`,
    reference: `ASM-${String(index + 1).padStart(6, "0")}`,
    status: "DRAFT",
    myAction: null,
  }));
  await renderOverview("DOCTOR", async body => {
    const calendar = body.querySelector('[aria-label="My assessment activity"]')!;
    await act(async () => { (calendar.querySelector(`[aria-label^="${firstDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(4);
    expect(calendar.textContent).toContain("6 assessments · 6 milestones");
    expect(calendar.querySelector('a[href^="/assessments/ASM-"] i')?.className).toContain("bg-slate-400");
    expect(calendar.textContent).toContain("Page 1 of 2");
    await act(async () => { ([...calendar.querySelectorAll('button')].find(button => button.textContent === "Next") as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(2);
    expect(calendar.textContent).toContain("Page 2 of 2");
    await act(async () => { (calendar.querySelector(`[aria-label^="${secondDay.toLocaleDateString(undefined, { dateStyle: "full" })}"]`) as HTMLButtonElement).click(); });
    expect(calendar.querySelectorAll('a[href^="/assessments/ASM-"]')).toHaveLength(1);
    expect(calendar.querySelector('[aria-label="Activity pages"]')).toBeNull();
  }, {
    assessments: records,
    activity: [...records.map((record, index) => ({ id: `${id.slice(0, -1)}${index}`, assessmentId: record.id, action: "ASSESSMENT_CREATED", occurredAt: new Date(firstDay.getTime() + index * 60_000).toISOString() })),
      { id: `${id.slice(0, -1)}Z`, assessmentId: records[0]!.id, action: "CLINICAL_REVIEW_COMPLETE", occurredAt: secondDay.toISOString() }],
  });
});

test("high-risk direction is red when more patients are high risk and green when fewer are", async () => {
  const highRiskTrend = (body: HTMLElement) => Array.from(body.querySelectorAll('[aria-label="Overview statistics"] > *'))
    .find(card => card.textContent?.includes("High risk patients"))?.querySelector('[aria-label^="Up"], [aria-label^="Down"]');
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

test("high-risk card shows a single zero when the comparison is unchanged", async () => {
  await renderOverview("DOCTOR", body => {
    const card = Array.from(body.querySelectorAll('[aria-label="Overview statistics"] > *'))
      .find(item => item.textContent?.includes("High risk patients"));
    expect(card?.querySelector("strong")?.textContent).toBe("0");
    expect(card?.querySelector('[aria-label="No change 0"]')).toBeNull();
    expect(card?.textContent).toContain("vs 30 days ago");
    expect(card?.getAttribute("href")).toBe("/assessments?tab=completed&risk=high");
  }, { highRiskPatients: 0, highRiskPatients30DaysAgo: 0 });
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
    expect(body.querySelector('[aria-label="Priority assessments"]')).toBeNull();
    expect(body.querySelector('[aria-label="My assessment activity"]')).toBeNull();
    expect(body.textContent).not.toContain("My assessment actions");
    expect(body.textContent).toContain("Reviews awaiting assignment");
    const quickActions = body.querySelector('[aria-label="Quick actions"]');
    expect(quickActions?.querySelector('a[href="/assessments/new"]')).toBeNull();
    expect(quickActions?.querySelector('a[href="/patients/new"]')).toBeNull();
    expect(quickActions?.querySelector('a[href="/facilities?add=1"]')?.textContent).toContain("Add facility");
    for (const path of ["/facilities?add=1", "/assessments?tab=clinical-reviews&review=QUEUED", "/users", "/settings/scoring"]) {
      expect(quickActions?.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
  });
});

test("admin completed count includes every returned facility assessment", async () => {
  const completed = ["1", "2"].map(suffix => ({ ...assessment, id: `${id.slice(0, -1)}${suffix}`, reference: `ASM-00000${suffix}`, status: "COMPLETED", myAction: null, completedAt: date }));
  await renderOverview("ORGANIZATION_ADMIN", body => {
    const card = Array.from(body.querySelectorAll('[aria-label="Overview statistics"] > *'))
      .find(item => item.textContent?.includes("Assessments completed"));
    expect(card?.querySelector("strong")?.textContent).toBe("2");
    expect(card?.textContent).toContain("vs 30 days ago");
    expect(card?.textContent).not.toContain("Accessible facilities");
  }, { assessments: completed });
});

test("empty clinical reviews keep a quick link without a count", async () => {
  await renderOverview("DOCTOR", body => {
    expect(body.querySelector('[aria-label="Quick actions"] a[href="/assessments?tab=clinical-reviews"]')?.textContent).toContain("Open review work");
  }, { reviewTotal: 0, assessmentStatus: "DRAFT" });
});

test("zero admin alerts hide operations and unlimited seats stay compact", async () => {
  await renderOverview("ORGANIZATION_ADMIN", body => {
    expect(body.querySelector('[aria-label="Organization operations"]')).toBeNull();
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
