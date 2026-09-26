import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { AssessmentsPage } from "./AssessmentsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-20T00:00:00Z";
const patient = { id, reference: "PAT-1", displayName: "Example Patient" };
const records = ["DRAFT", "READY_FOR_SCORING", "SCORED"].map((status, index) => ({ id: `${id.slice(0, -1)}${index + 1}`, reference: `ASM-00000${index + 1}`, serialNumber: index + 1, organizationId: id, patient, facility: null, status, myAction: null as string | null, isPriority: false, createdAt: date, completedAt: null }));
type AssessmentFixture = Omit<(typeof records)[number], "facility" | "completedAt"> & { facility: { id: string; name: string } | null; completedAt: string | null };

async function renderAssessments(path: string, items: AssessmentFixture[], verify: (priorityWrites: boolean[]) => void | Promise<void>, reviewItems: unknown[] = []) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const priorityWrites: boolean[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH" && String(input).endsWith("/priority")) { priorityWrites.push(JSON.parse(String(init.body)).isPriority); return Response.json({ assessmentId: records[0]?.id, isPriority: priorityWrites.at(-1) }); }
    return Response.json(String(input).includes("/clinical-reviews?") ? { items: reviewItems, total: reviewItems.length || 2, page: 1, pageSize: 10 } : String(input).endsWith("/assessments") ? { items } : { items: [] });
  }) as typeof fetch;
  const user = { userId: id, organizationId: id, membershipId: id, email: "doctor@example.test", displayName: "Doctor", role: "DOCTOR", platformRole: "USER" };
  const router = createMemoryRouter([{ element: <Outlet context={user} />, children: [{ path: "/assessments", element: <AssessmentsPage /> }] }], { initialEntries: [path] });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<RouterProvider router={router} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    await verify(priorityWrites);
  } finally {
    await act(async () => root.unmount()); router.dispose(); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
  }
}

test("open-assessment link shows only drafts and assessments ready for scoring", async () => {
  await renderAssessments("/assessments?status=OPEN", records, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
    expect(document.body.textContent).toContain("2 total");
  });
});

test("priority filter and star control reflect a saved change", async () => {
  await renderAssessments("/assessments?status=PRIORITY", [{ ...records[0]!, isPriority: true }, records[1]!], async writes => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Remove priority from ASM-000001"]')!;
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { remove.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(writes).toEqual([false]);
    expect(table?.textContent).not.toContain("ASM-000001");
  });
});

test("facility work link applies both facility and work status filters", async () => {
  const here = { id, name: "Hyderabad" };
  const elsewhere = { id: `${id.slice(0, -1)}Z`, name: "Elsewhere" };
  const items = [
    { ...records[0], facility: here },
    { ...records[1], facility: here },
    { ...records[2], status: "UNDER_REVIEW", facility: here },
    { ...records[2], id: `${id.slice(0, -1)}4`, reference: "ASM-000004", status: "SCORING_UNAVAILABLE", facility: here },
    { ...records[2], id: `${id.slice(0, -1)}5`, reference: "ASM-000005", facility: here },
    { ...records[0], id: `${id.slice(0, -1)}6`, reference: "ASM-000006", facility: elsewhere },
  ];
  await renderAssessments(`/assessments?facility=${id}&status=WORK`, items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    for (const reference of ["ASM-000001", "ASM-000002", "ASM-000003", "ASM-000004"]) expect(table?.textContent).toContain(reference);
    expect(table?.textContent).not.toContain("ASM-000005");
    expect(table?.textContent).not.toContain("ASM-000006");
    expect(document.body.textContent).toContain("4 total");
    expect(document.querySelector('[aria-label="Filter by status"]')?.textContent).toContain("Assessment and review work");
  });
});

test("completed-this-month link excludes older completions and unfinished assessments", async () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();
  const items = [
    { ...records[0], status: "COMPLETED", completedAt: now.toISOString() },
    { ...records[1], status: "COMPLETED", completedAt: lastMonth },
    { ...records[2], status: "SCORED", completedAt: null },
  ];
  await renderAssessments("/assessments?status=COMPLETED_THIS_MONTH", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
    expect(document.body.textContent).toContain("1 total");
  });
});

test("completed overview card opens all completed assessments", async () => {
  const items = [
    { ...records[0], status: "COMPLETED", completedAt: date },
    { ...records[1], status: "DRAFT" },
  ];
  await renderAssessments("/assessments?status=COMPLETED", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
  });
});

test("clinical reviews tab shows its unfiltered total", async () => {
  await renderAssessments("/assessments?tab=clinical-reviews&review=QUEUED", records, () => {
    expect(document.querySelector('[data-slot="tabs-list"]')?.textContent).toMatch(/Clinical reviews\s*2/);
  });
});

test("clinical review rows show stage and a compact open action", async () => {
  const reviews = [{ assessmentId: id, reference: "ASM-000001", patient, facility: null, review: { state: "QUEUED", submittedAt: date, assignee: null, correctionPerson: null } }];
  await renderAssessments("/assessments?tab=clinical-reviews", records, async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    const table = document.querySelector('[aria-label="Clinical reviews"]');
    expect(table?.textContent).toContain("Awaiting reviewer");
    expect(table?.textContent).toContain("20 Sept 2026");
    const open = table?.querySelector('a[aria-label="Open clinical review ASM-000001"]');
    expect(open?.getAttribute("href")).toBe("/assessments/ASM-000001");
    expect(open?.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    expect(document.querySelector('.mobile-card-list a[aria-label="Open clinical review ASM-000001"]')).not.toBeNull();
  }, reviews);
});

test("my assessment actions link shows the same assigned work as the overview", async () => {
  const items = [
    { ...records[0], myAction: "EDIT_DRAFT" },
    { ...records[1], myAction: null },
    { ...records[2], myAction: "SEND_FOR_REVIEW" },
  ];
  await renderAssessments("/assessments?status=MY_ACTIONS", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("ASM-000003");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(table?.querySelector('a[aria-label="Send for review ASM-000003"]')).not.toBeNull();
    expect(document.body.textContent).toContain("2 total");
  });
});

test("assessment rows offer a status-aware action to open the assessment", async () => {
  await renderAssessments("/assessments", records, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    const openDraft = table?.querySelector('a[aria-label="Open draft ASM-000001"]');
    expect(openDraft?.getAttribute("href")).toBe("/assessments/ASM-000001");
    expect(openDraft?.getAttribute("title")).toBe("Open draft");
    expect(openDraft?.textContent).toBe("");
    expect(openDraft?.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    expect(table?.querySelector('a[aria-label="Review answers ASM-000002"]')).not.toBeNull();
    expect(table?.querySelector('a[aria-label="View score ASM-000003"]')).not.toBeNull();
  });
});
