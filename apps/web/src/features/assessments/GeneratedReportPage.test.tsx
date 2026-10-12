import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AuthenticatedUser, GeneratedReport } from "@niq/application-contracts";
import { BrandingProvider } from "@/lib/branding-context";
import { GeneratedReportPage } from "./GeneratedReportPage";

async function renderWithResponse(response: unknown, inspect: () => void | Promise<void>) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => Response.json(response),
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  const user = { organizationId: "org", role: "DOCTOR" } as AuthenticatedUser;
  try {
    await act(async () => {
      root.render(<BrandingProvider><MemoryRouter initialEntries={["/assessments/assessment/generated-report"]}><Routes><Route element={<Outlet context={user}/>}><Route path="/assessments/:assessmentId/generated-report" element={<GeneratedReportPage/>}/></Route></Routes></MemoryRouter></BrandingProvider>);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await inspect();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

test("queued report shows automatic progress without a generation control", async () => {
  await renderWithResponse({ report: null, generation: { status: "QUEUED" } }, () => {
    expect(document.body.textContent).toContain("Report queued");
    expect(document.body.textContent).toContain("This page updates automatically");
    expect(document.body.textContent).not.toContain("Generate report draft");
    expect(document.body.textContent).not.toContain("Approve report");
  });
});

test("ready report shows HTML layout with access to the saved PDF", async () => {
  const report: GeneratedReport = {
    id: "report-1",
    revision: 0,
    status: "READY",
    runId: "run-1",
    model: "model-1",
    promptVersion: "1",
    generatedAt: "2026-10-12T08:00:00.000Z",
    approvedAt: "2026-10-12T08:00:00.000Z",
    patient: { displayName: "Test Patient", reference: "PAT-12", dateOfBirth: "1980-01-01", gender: "Female" },
    assessment: { id: "assessment", reference: "NIQ-12", completedAt: "2026-10-12T08:00:00.000Z", submissionId: "submission-1", scoreRevision: 1, ruleVersionId: "rules-2", checksum: "checksum" },
    classification: { id: "high", label: "High Risk", score: 27, color: "red" },
    metrics: [
      { id: "current_weight_kg", label: "Current weight", value: "62", unit: "kg", source: "assessment" },
      { id: "height_cm", label: "Height", value: "175", unit: "cm", source: "assessment" },
      { id: "bmi", label: "BMI", value: "20.2", source: "assessment" },
      { id: "wellness_score", label: "Wellness score", value: "80", unit: "/100", source: "face_scan" },
      { id: "sdnn", label: "SDNN", value: "42", unit: "ms", source: "face_scan" },
      { id: "body_fat", label: "Body fat", value: "21", unit: "%", source: "face_scan" },
    ],
    weightHistory: [],
    decision: { productStageChoice: null, plannedTreatmentStartDate: null },
    narrative: { overview: "Reviewed patient overview", keyFindings: "", actionSummary: "", monitoringSummary: "", nutritionAdvice: "Reviewed nutrition guidance" },
    guidance: { sections: [
      { id: "nutrition-1", kind: "nutrition", title: "Matched rule", text: "Raw rule wording for internal guidance" },
      { id: "product-1", kind: "product", title: "Product plan", text: "1 Invigour + 2 Protect\nAt least 90 days during treatment" },
    ] },
    issues: [],
    issueResolution: null,
    artifact: { sha256: "a".repeat(64), size: 1024, uploadedAt: "2026-10-12T08:00:00.000Z", brandingFingerprint: null },
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, async () => {
    expect(document.body.textContent).toContain("Final report ready");
    expect(document.body.textContent).not.toContain("Approve report");
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('[aria-label="Generated clinical nutrition report"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Reviewed patient overview");
    expect(document.body.textContent).toContain("Reviewed nutrition guidance");
    expect(document.body.textContent).toContain("Products in your plan");
    expect(document.body.textContent).not.toContain("Raw rule wording for internal guidance");
    expect(document.body.textContent).not.toContain("Draft for clinical review");
    expect(document.querySelectorAll(".clinical-report .brand-marks-partner-logo").length).toBeGreaterThan(1);
    expect(document.querySelector(".cr-metric-card .cr-metric-icon svg")).not.toBeNull();
    expect(document.querySelector(".cr-report-bmi svg[viewBox='0 0 240 122']")).not.toBeNull();
    expect(document.querySelector(".cr-vital-detail")?.textContent).toContain("SDNN");
    expect(document.body.textContent).toContain("Body fat");
    expect((document.querySelector(".cr-score-card strong") as HTMLElement)?.style.color).toBe("rgb(220, 61, 80)");
    expect(document.querySelector("a[download]")?.getAttribute("download")).toBe("NIQ-report-NIQ-12.pdf");
    await act(async () => { (document.querySelectorAll(".cr-preview-tab")[1] as HTMLButtonElement).click(); });
    expect(document.querySelector('[aria-label="Medical nutrition therapy report PDF preview"]')).not.toBeNull();
  });
});
