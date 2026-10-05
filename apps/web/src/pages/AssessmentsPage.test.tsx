import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { AssessmentsPage } from "./AssessmentsPage";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const date = "2026-09-20T00:00:00Z";
const patient = { id, reference: "PAT-1", displayName: "Example Patient" };
const records = ["DRAFT", "READY_FOR_SCORING", "SCORED"].map((status, index) => ({ id: `${id.slice(0, -1)}${index + 1}`, reference: `ASM-00000${index + 1}`, serialNumber: index + 1, organizationId: id, patient, facility: null, status, myAction: null as string | null, isPriority: false, createdAt: date, completedAt: null, riskCategory: null as "low" | "moderate" | "high" | null }));
type AssessmentFixture = Omit<(typeof records)[number], "facility" | "completedAt"> & { facility: { id: string; name: string } | null; completedAt: string | null };

function assessmentPage(items: AssessmentFixture[], input: string) {
  const params = new URL(input, "http://localhost").searchParams;
  const tab = params.get("tab") ?? "assessments";
  const status = params.get("status") ?? "all";
  const facility = params.get("facility") ?? "all";
  const risk = params.get("risk") ?? "all";
  const query = (params.get("query") ?? "").toLowerCase();
  const now = new Date();
  const matching = items.filter(item => {
    const matchesStatus = status === "all" || status === item.status ||
      (status === "WORK" && ["DRAFT", "READY_FOR_SCORING", "SCORING_UNAVAILABLE", "UNDER_REVIEW"].includes(item.status)) ||
      (status === "OPEN" && ["DRAFT", "READY_FOR_SCORING"].includes(item.status)) ||
      (status === "MY_ACTIONS" && !!item.myAction) ||
      (["EDIT_DRAFT", "CORRECT_DRAFT", "SEND_FOR_REVIEW"].includes(status) && item.myAction === status) ||
      (status === "PRIORITY" && item.isPriority) ||
      (status === "COMPLETED_THIS_MONTH" && item.status === "COMPLETED" && !!item.completedAt && new Date(item.completedAt).getMonth() === now.getMonth() && new Date(item.completedAt).getFullYear() === now.getFullYear());
    return matchesStatus && (tab !== "my-work" || !!item.myAction) && (tab !== "completed" || item.status === "COMPLETED") &&
      (facility === "all" || item.facility?.id === facility) && (risk === "all" || item.riskCategory === risk) &&
      (!query || `${item.reference} ${item.patient.reference} ${item.patient.displayName} ${item.facility?.name ?? ""}`.toLowerCase().includes(query));
  });
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "10");
  return { items: matching.slice((page - 1) * pageSize, page * pageSize), total: matching.length, allCount: items.length,
    myWorkCount: items.filter(item => !!item.myAction).length, completedCount: items.filter(item => item.status === "COMPLETED").length, page, pageSize };
}

async function renderAssessments(path: string, items: AssessmentFixture[], verify: (priorityWrites: boolean[]) => void | Promise<void>, reviewItems: unknown[] = [], reviewRequests: string[] = [], claimCommands: unknown[] = [], assessmentGate?: Promise<void>, reviewGate?: Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const priorityWrites: boolean[] = [];
  let storedItems = [...items];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH" && String(input).endsWith("/priority")) { const isPriority = JSON.parse(String(init.body)).isPriority as boolean; priorityWrites.push(isPriority); const assessmentId = String(input).match(/\/assessments\/([^/]+)\/priority$/)?.[1]; storedItems = storedItems.map(item => item.id === assessmentId ? { ...item, isPriority } : item); return Response.json({ assessmentId, isPriority }); }
    if (init?.method === "POST" && String(input).endsWith("/clinical-review")) { claimCommands.push(JSON.parse(String(init.body))); return Response.json({}); }
    const reviewId = String(input).match(/\/assessments\/([^/]+)\/clinical-review$/)?.[1];
    if (reviewId) return Response.json((reviewItems as Array<{ assessmentId: string; review: unknown }>).find(item => item.assessmentId === reviewId)?.review ?? {});
    if (String(input).includes("/clinical-reviews?")) reviewRequests.push(String(input));
    if (String(input).includes("/assessments/page?")) { await assessmentGate; return Response.json(assessmentPage(storedItems, String(input))); }
    if (String(input).includes("/clinical-reviews?")) { await reviewGate; return Response.json({ items: reviewItems, total: reviewItems.length || 2, page: 1, pageSize: 10 }); }
    return Response.json({ items: [] });
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

test("shows responsive assessment placeholders until the list finishes loading", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  await renderAssessments("/assessments", records, async () => {
    const loading = document.querySelector('[role="status"][aria-label="Loading assessments"]');
    expect(loading?.querySelectorAll(".mobile-card-list article")).toHaveLength(4);
    expect(loading?.querySelectorAll(".desktop-table tbody tr")).toHaveLength(6);
    expect(loading?.querySelector(".mobile-card-heading .mobile-card-actions")).not.toBeNull();
    expect(document.querySelector('[aria-label="Assessments pagination"]')).toBeNull();
    await act(async () => { finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="status"][aria-label="Loading assessments"]')).toBeNull();
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).toContain("ASM-000001");
  }, [], [], [], gate);
});

test("loads the next assessment page from the API", async () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ ...records[0]!, id: `${id.slice(0, -2)}${String(index + 1).padStart(2, "0")}`, reference: `ASM-${String(index + 1).padStart(6, "0")}`, serialNumber: index + 1 }));
  await renderAssessments("/assessments", items, async () => {
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).toContain("ASM-000010");
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).not.toContain("ASM-000011");
    const next = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Assessments pagination"] button')].at(-1)!;
    await act(async () => { next.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).toContain("ASM-000011");
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).not.toContain("ASM-000001");
    expect(document.querySelector('[aria-label="Assessments pagination"]')?.textContent).toContain("Page 2 of 2");
  });
});

test("open-assessment link shows only drafts and assessments ready for scoring", async () => {
  await renderAssessments("/assessments?status=OPEN", records, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
    expect(table?.querySelector('[data-status="draft"]')?.getAttribute("style")).toContain("var(--surface-subtle)");
    expect(table?.querySelector('[data-status="draft"] .status-dot')?.getAttribute("style")).toContain("var(--client-muted)");
    expect(document.body.textContent).toContain("Page 1 of 1");
  });
});

test("priority filter and star control reflect a saved change", async () => {
  await renderAssessments("/assessments?status=PRIORITY", [{ ...records[0]!, isPriority: true }, records[1]!], async writes => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(document.querySelector('button[aria-label="Clear My priorities filter"]')).not.toBeNull();
    const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Remove priority from ASM-000001"]')!;
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { remove.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(writes).toEqual([false]);
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).not.toContain("ASM-000001");
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
    expect(document.body.textContent).toContain("Page 1 of 1");
    expect(document.querySelector('button[aria-label="Clear Assessment and review work filter"]')).not.toBeNull();
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
    expect(document.querySelector('[data-slot="tabs-trigger"][data-selected]')?.textContent).toContain("Completed");
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

test("risk category filter uses completed assessments' reviewed categories", async () => {
  const items = [
    { ...records[0]!, status: "COMPLETED", completedAt: date, riskCategory: "high" as const },
    { ...records[1]!, status: "COMPLETED", completedAt: date, riskCategory: "moderate" as const },
    { ...records[2]!, status: "COMPLETED", completedAt: date, riskCategory: null },
    { ...records[2]!, id: `${id.slice(0, -1)}4`, reference: "ASM-000004", status: "SCORED", riskCategory: null },
  ];
  await renderAssessments("/assessments?risk=high", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
    expect(table?.textContent).not.toContain("ASM-000004");
    expect(document.querySelector('[aria-label="Filter by risk category"]')).not.toBeNull();
  });
  await renderAssessments("/assessments?tab=completed&risk=moderate", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000001");
  });
});

test("risk category filters My work and remains available on every tab", async () => {
  const items = [
    { ...records[0]!, myAction: "EDIT_DRAFT", riskCategory: "high" as const },
    { ...records[1]!, myAction: "CORRECT_DRAFT", riskCategory: "low" as const },
  ];
  await renderAssessments("/assessments?tab=my-work&risk=high", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(document.querySelector('[aria-label="Filter by risk category"]')).not.toBeNull();
  });
  await renderAssessments("/assessments?tab=clinical-reviews&risk=high", items, () => {
    expect(document.querySelector('[aria-label="Filter by risk category"]')).not.toBeNull();
  });
});

test("switching tabs retains the selected risk category", async () => {
  const items = [
    { ...records[0]!, myAction: "EDIT_DRAFT", riskCategory: "high" as const },
    { ...records[1]!, myAction: "EDIT_DRAFT", riskCategory: "low" as const },
  ];
  await renderAssessments("/assessments?risk=high", items, async () => {
    const myWork = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')).find(tab => tab.textContent?.includes("My work"));
    await act(async () => { myWork?.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[data-slot="tabs-trigger"][data-selected]')?.textContent).toContain("My work");
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).toContain("ASM-000001");
    expect(document.querySelector('[aria-label="Assessments"]')?.textContent).not.toContain("ASM-000002");
    expect(document.querySelector('[aria-label="Filter by risk category"]')?.textContent).toContain("High risk");
  });
});

test("clinical review risk filter is sent with other queue filters", async () => {
  const requests: string[] = [];
  await renderAssessments(`/assessments?tab=clinical-reviews&facility=${id}&review=QUEUED&risk=high`, records, async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    expect(requests.some(url => {
      const params = new URL(url, "http://localhost").searchParams;
      return params.get("risk") === "high" && params.get("facilityId") === id && params.get("state") === "QUEUED" && params.get("page") === "1";
    })).toBe(true);
  }, [], requests);
});

test("a scoring issue remains visible when opened from an older status link", async () => {
  const items = [{ ...records[0], status: "SCORING_UNAVAILABLE" }, records[1]!];
  await renderAssessments("/assessments?status=SCORING_UNAVAILABLE", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("Scoring unavailable");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(document.querySelector('button[aria-label="Clear Scoring unavailable filter"]')).not.toBeNull();
  });
});

test("clinical reviews tab shows its unfiltered total", async () => {
  await renderAssessments("/assessments?tab=clinical-reviews&review=QUEUED", records, () => {
    expect(document.querySelector('[data-slot="tabs-list"]')?.textContent).toMatch(/Clinical reviews\s*2/);
  });
});

test("clinical review loading uses responsive placeholders", async () => {
  let finishLoading!: () => void;
  const gate = new Promise<void>(resolve => { finishLoading = resolve; });
  const reviews = [{ assessmentId: id, reference: "ASM-000001", patient, facility: null, review: { state: "QUEUED", submittedAt: date, assignee: null, correctionPerson: null } }];
  await renderAssessments("/assessments?tab=clinical-reviews", records, async () => {
    const loading = document.querySelector('[role="status"][aria-label="Loading clinical reviews"]');
    expect(loading?.querySelectorAll(".mobile-card-list article")).toHaveLength(4);
    expect(loading?.querySelectorAll(".desktop-table tbody tr")).toHaveLength(6);
    expect(loading?.querySelector(".mobile-card-list .assessment-card-footer")).not.toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); finishLoading(); await gate; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="status"][aria-label="Loading clinical reviews"]')).toBeNull();
    expect(document.querySelector('[aria-label="Clinical reviews"]')?.textContent).toContain("ASM-000001");
  }, reviews, [], [], undefined, gate);
});

test("clinical reviews filters the backend queue by facility", async () => {
  const requests: string[] = [];
  await renderAssessments(`/assessments?tab=clinical-reviews&facility=${id}`, records, async () => {
    expect(document.querySelector('[aria-label="Filter by facility"]')).not.toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    expect(requests.some(url => new URL(url, "http://localhost").searchParams.get("facilityId") === id)).toBe(true);
  }, [], requests);
});

test("clinical review rows show stage and a compact open action", async () => {
  const reviews = [{ assessmentId: id, reference: "ASM-000001", patient, facility: null, review: { state: "QUEUED", submittedAt: date, assignee: null, correctionPerson: null } }];
  await renderAssessments("/assessments?tab=clinical-reviews", records, async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    const table = document.querySelector('[aria-label="Clinical reviews"]');
    expect(table?.textContent).toContain("Awaiting reviewer");
    expect(table?.textContent).toContain("20 Sept 2026");
    expect(table?.querySelector('[data-status="awaiting-reviewer"]')?.getAttribute("style")).toContain("var(--warning-soft)");
    expect(table?.querySelector('[data-status="awaiting-reviewer"] .status-dot')?.getAttribute("style")).toContain("var(--warning)");
    expect(document.body.textContent).not.toContain("Page 1 of 1");
    const open = table?.querySelector('a[aria-label="View review ASM-000001"]');
    expect(open?.getAttribute("href")).toBe("/assessments/ASM-000001");
    expect(open?.textContent).toBe("View review");
    expect(open?.querySelector("svg.lucide-eye")).not.toBeNull();
    expect(document.querySelector('.mobile-card-list .assessment-card-footer a[aria-label="View review ASM-000001"]')).not.toBeNull();
  }, reviews);
});

test("eligible clinicians can claim an awaiting review from the queue", async () => {
  const commands: unknown[] = [];
  const reviews = [{ assessmentId: id, reference: "ASM-000001", patient, facility: null, review: { state: "QUEUED", submittedAt: date, assignee: null, correctionPerson: null, revision: 3, scoreRevision: 2, allowedActions: ["CLAIM"] } }];
  await renderAssessments("/assessments?tab=clinical-reviews", records, async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    const claim = document.querySelector<HTMLButtonElement>('[aria-label="Clinical reviews"] button');
    expect(claim?.textContent).toBe("Claim");
    const mobileFooter = document.querySelector(".mobile-card-list .assessment-card-footer");
    expect(mobileFooter?.querySelector('a[aria-label="View review ASM-000001"]')).not.toBeNull();
    expect(mobileFooter?.querySelector("button")?.textContent).toBe("Claim");
    await act(async () => { claim?.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: "CLAIM", expectedRevision: 3, expectedScoreRevision: 2 });
  }, reviews, [], commands);
});

test("clinical review priority star saves and updates the assessment list", async () => {
  const reviews = [{ assessmentId: records[0]!.id, reference: "ASM-000001", patient, facility: null, isPriority: false, review: { state: "QUEUED", submittedAt: date, assignee: null, correctionPerson: null, allowedActions: [] } }];
  await renderAssessments("/assessments?tab=clinical-reviews", records, async writes => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    const star = document.querySelector<HTMLButtonElement>('[aria-label="Clinical reviews"] button[aria-label="Mark as priority ASM-000001"]');
    expect(star?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { star?.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(writes).toEqual([true]);
    expect(document.querySelector('[aria-label="Clinical reviews"] button[aria-label="Remove priority from ASM-000001"]')?.getAttribute("aria-pressed")).toBe("true");
  }, reviews);
});

test("all assessments offers Claim only for a claimable clinical review", async () => {
  const commands: unknown[] = [];
  const items = [
    { ...records[0]!, status: "UNDER_REVIEW" },
    { ...records[1]!, status: "SCORED" },
  ];
  const reviews = [{ assessmentId: items[0]!.id, reference: items[0]!.reference, patient, facility: null, review: { state: "QUEUED", revision: 2, scoreRevision: 1, allowedActions: ["CLAIM"] } }];
  await renderAssessments("/assessments", items, async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const table = document.querySelector('[aria-label="Assessments"]');
    const claim = Array.from(table?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(button => button.textContent === "Claim");
    expect(claim).toBeDefined();
    const rows = table?.querySelectorAll("tbody tr");
    expect(rows?.[0]?.textContent).toContain("Claim");
    expect(rows?.[1]?.textContent).not.toContain("Claim");
    await act(async () => { claim?.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: "CLAIM", expectedRevision: 2, expectedScoreRevision: 1 });
  }, reviews, [], commands);
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
    expect(table?.querySelector('a[aria-label="Review & send ASM-000003"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="tabs-trigger"][data-selected]')?.textContent).toContain("My work");
  });
});

test("quick-action links filter to the matching assigned assessments", async () => {
  const items = [
    { ...records[0], myAction: "CORRECT_DRAFT" },
    { ...records[1], myAction: "EDIT_DRAFT" },
    { ...records[2], myAction: "SEND_FOR_REVIEW" },
  ];
  await renderAssessments("/assessments?status=CORRECT_DRAFT", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000003");
  });
  await renderAssessments("/assessments?status=SEND_FOR_REVIEW", items, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000003");
    expect(table?.textContent).not.toContain("ASM-000001");
  });
});

test("my work separates drafts, corrections, and ready-to-send assessments from reviews and completed work", async () => {
  const items = [
    { ...records[0], myAction: "EDIT_DRAFT" },
    { ...records[0], id: `${id.slice(0, -1)}4`, reference: "ASM-000004", myAction: "CORRECT_DRAFT" },
    { ...records[2], myAction: "SEND_FOR_REVIEW" },
    { ...records[1], status: "UNDER_REVIEW" },
    { ...records[1], id: `${id.slice(0, -1)}5`, reference: "ASM-000005", status: "COMPLETED", completedAt: date },
  ];
  await renderAssessments("/assessments?tab=my-work", items, async () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.textContent).toContain("ASM-000001");
    expect(table?.textContent).toContain("ASM-000004");
    expect(table?.textContent).toContain("ASM-000003");
    expect(table?.textContent).not.toContain("ASM-000002");
    expect(table?.textContent).not.toContain("ASM-000005");
    expect(table?.querySelector('[data-status="needs-correction"]')).not.toBeNull();
    expect(table?.querySelector('[data-status="ready-to-send"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="tabs-list"]')?.textContent).toMatch(/All assessments\s*5.*My work\s*3.*Completed\s*1/);
    const completedTab = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')).find(item => item.textContent?.includes("Completed"));
    expect(completedTab).toBeDefined();
    await act(async () => { completedTab?.click(); });
    const completedTable = document.querySelector('[aria-label="Assessments"]');
    expect(completedTable?.textContent).toContain("ASM-000005");
    expect(completedTable?.textContent).not.toContain("ASM-000001");
  });
});

test("all assessments keeps actual statuses while my work shows the required action", async () => {
  const items = [
    { ...records[0]!, myAction: "CORRECT_DRAFT" },
    { ...records[2]!, myAction: "SEND_FOR_REVIEW" },
  ];
  await renderAssessments("/assessments", items, async () => {
    const all = document.querySelector('[aria-label="Assessments"]');
    expect(all?.querySelector('[data-status="draft"]')).not.toBeNull();
    expect(all?.querySelector('[data-status="scored"]')?.getAttribute("style")).toContain("var(--primary-soft)");
    expect(all?.querySelector('[data-status="needs-correction"]')).toBeNull();
    const myWorkTab = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')).find(item => item.textContent?.includes("My work"));
    await act(async () => { myWorkTab?.click(); });
    const myWork = document.querySelector('[aria-label="Assessments"]');
    expect(myWork?.querySelector('[data-status="needs-correction"]')).not.toBeNull();
    expect(myWork?.querySelector('[data-status="ready-to-send"]')).not.toBeNull();
  });
});

test("assessment rows offer a status-aware action to open the assessment", async () => {
  await renderAssessments("/assessments", records, () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    const openDraft = table?.querySelector('a[aria-label="Continue draft ASM-000001"]');
    expect(openDraft?.getAttribute("href")).toBe("/assessments/ASM-000001");
    expect(openDraft?.textContent).toBe("Continue draft");
    expect(openDraft?.querySelector("svg.lucide-pencil")).not.toBeNull();
    expect(table?.querySelector('a[aria-label="Review answers ASM-000002"]')).not.toBeNull();
    expect(table?.querySelector('a[aria-label="View score ASM-000003"]')).not.toBeNull();
    expect(table?.querySelector('button[aria-label^="Download PDF"]')).toBeNull();
    const mobileCards = [...document.querySelectorAll('.assessment-mobile-card')];
    expect(mobileCards).toHaveLength(3);
    expect(mobileCards.every(card => card.querySelector('.assessment-card-footer > a') && card.querySelector('.mobile-card-heading button[aria-label*="priority"]'))).toBe(true);
  });
});

test("completed assessments show a PDF download entry point until reports are available", async () => {
  const completed = { ...records[0]!, status: "COMPLETED", completedAt: date };
  await renderAssessments("/assessments?tab=completed", [completed], () => {
    const table = document.querySelector('[aria-label="Assessments"]');
    expect(table?.querySelector('a[aria-label="View result ASM-000001"]')?.textContent).toBe("View result");
    expect(table?.querySelector('a[aria-label="View result ASM-000001"] svg.lucide-eye')).not.toBeNull();
    const download = table?.querySelector<HTMLButtonElement>('button[aria-label="Download PDF for ASM-000001 (not yet available)"]');
    expect(download?.textContent).toContain("Download PDF");
    expect(download?.disabled).toBe(true);
    expect(document.querySelector('.assessment-mobile-card .assessment-card-secondary button[aria-label="Download PDF for ASM-000001 (not yet available)"]')).not.toBeNull();
  });
});
