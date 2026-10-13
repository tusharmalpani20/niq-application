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
    SVGElement: dom.window.SVGElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: typeof response === "function" ? response : async () => Response.json(response),
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

test("review-required generation never presents a final PDF", async () => {
  await renderWithResponse({ report: null, generation: { status: "FAILED", failureCode: "REVIEW_REQUIRED" } }, () => {
    expect(document.body.textContent).toContain("Clinical review required");
    expect(document.body.textContent).toContain("before a PDF can be issued");
    expect(document.body.textContent).not.toContain("Final report ready");
    expect(document.querySelector(".cr-download")).toBeNull();
  });
});

const readyReport: GeneratedReport = {
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
      { id: "weight_loss_percent", label: "Reported weight loss", value: "8", unit: "%", source: "assessment" },
      { id: "wellness_score", label: "Wellness score", value: "80", unit: "/100", source: "face_scan" },
      { id: "systolic", label: "Systolic blood pressure", value: "131", unit: "mmHg", source: "face_scan" },
      { id: "diastolic", label: "Diastolic blood pressure", value: "84", unit: "mmHg", source: "face_scan" },
      { id: "sdnn", label: "SDNN", value: "42", unit: "ms", source: "face_scan", referenceRange: "60–100 ms", outsideReferenceRange: true },
      { id: "body_fat", label: "Body fat", value: "21", unit: "%", source: "face_scan" },
      { id: "hba1c", label: "HbA1c", value: "5.8", unit: "%", source: "face_scan" },
    ],
    weightHistory: [],
    decision: { productStageChoice: null, plannedTreatmentStartDate: null },
    narrative: { overview: "Reviewed patient overview", keyFindings: "Current weight is 62 kg and blood pressure is 131/84 mmHg.", actionSummary: "Reviewed action plan", monitoringSummary: "Reviewed monitoring plan", overallSummary: "High nutritional risk and treatment-related eating difficulty call for early nutrition support. Follow the reviewed nutrition plan and monitor intake, weight and symptoms with the care team.", nutritionAdvice: "Reviewed nutrition guidance", treatmentAdvice: "Reviewed treatment guidance", conditionAdvice: "Reviewed condition guidance", effectsAdvice: "Reviewed effects guidance" },
    guidance: { sections: [
      { id: "nutrition-1", kind: "nutrition", title: "Matched rule", text: "Energy: 30–35 kcal/kg/day\nProtein: 1.5–2.0 g/kg/day\nRaw rule wording for internal guidance" },
      { id: "product-1", kind: "product", title: "Product plan", text: "1 Invigour + 2 Protect\nAt least 90 days during treatment" },
    ] },
    issues: [],
    issueResolution: null,
    artifact: { sha256: "a".repeat(64), size: 1024, uploadedAt: "2026-10-12T08:00:00.000Z", brandingFingerprint: null },
};

test("ready report shows HTML layout with access to the saved PDF", async () => {
  const report = readyReport;
  await renderWithResponse({ report, generation: { status: "READY" } }, async () => {
    expect(document.body.textContent).toContain("Final report ready");
    expect(document.body.textContent).not.toContain("Approve report");
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('[aria-label="Generated clinical nutrition report"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Reviewed patient overview");
    expect(document.body.textContent).toContain("Reviewed nutrition guidance");
    expect(document.querySelectorAll(".cr-nutrition-target-card").length).toBe(2);
    expect(document.querySelector(".cr-nutrition-targets")?.textContent).toContain("30–35 kcal/kg/day");
    expect(document.querySelector(".cr-nutrition-targets")?.textContent).toContain("1.5–2.0 g/kg/day");
    expect(document.body.textContent).toContain("Supplement recommendation");
    expect(document.body.textContent).toContain("Reviewed treatment guidance");
    expect(document.querySelector('[aria-label="During treatment"]')?.textContent).toContain("Reviewed treatment guidance");
    expect(document.querySelector('[aria-label="Intervention"]')?.textContent).not.toContain("Reviewed treatment guidance");
    expect(document.body.textContent).toContain("Reviewed condition guidance");
    expect(document.body.textContent).toContain("Reviewed effects guidance");
    const summary = document.querySelector('[aria-label="Report summary"]')!;
    expect(summary.textContent).toContain("High Risk");
    expect(summary.textContent).toContain("27 NIQ points");
    expect(summary.querySelector('[aria-label="Overall clinical summary"]')?.textContent).toContain("High nutritional risk and treatment-related eating difficulty");
    expect(summary.textContent).not.toContain("Reviewed nutrition guidance");
    expect(summary.textContent).not.toContain("Reviewed action plan");
    expect(summary.textContent).not.toContain("Reviewed monitoring plan");
    expect(summary.querySelector(".cr-summary-targets, .cr-summary-grid, .cr-summary-plan")).toBeNull();
    expect(document.querySelector(".clinical-report > .cr-sheet:last-child")?.getAttribute("aria-label")).toBe("Report summary");
    expect(document.body.textContent).not.toContain("Raw rule wording for internal guidance");
    expect(document.body.textContent).not.toContain("Draft for clinical review");
    expect(document.body.textContent).not.toContain("Final clinical report");
    expect(document.body.textContent).not.toContain("Current weight is 62 kg and blood pressure is 131/84 mmHg.");
    expect(document.body.textContent).toContain("Assessment indicators");
    expect(document.body.textContent).toContain("Reported weight loss");
    expect(document.querySelectorAll(".cr-supplement-item").length).toBe(2);
    expect(document.querySelectorAll(".clinical-report .brand-marks-partner-logo").length).toBeGreaterThan(1);
    expect(document.querySelector(".cr-metric-card .cr-metric-icon svg")).not.toBeNull();
    expect(document.querySelector(".cr-report-bmi svg[viewBox='0 0 240 122']")).not.toBeNull();
    expect(document.querySelector(".cr-vital-detail")?.textContent).toContain("SDNN");
    expect(document.querySelector(".cr-vital-detail")?.textContent).toContain("Reference: 60–100 ms");
    expect(document.querySelector(".cr-vital-detail dt .cr-metric-icon svg")).not.toBeNull();
    expect(document.body.textContent).toContain("Body fat");
    expect(document.body.textContent).not.toContain("HbA1c");
    expect(document.querySelector('[aria-label="Vital IQ measurements"] .cr-section-intro')).toBeNull();
    const patientOverview = document.querySelector('[aria-label="Patient overview"]')!;
    expect(patientOverview.querySelector(".cr-report-bmi")).not.toBeNull();
    expect(patientOverview.textContent).not.toContain("Reviewed patient overview");
    expect(document.querySelector(".cr-clinical-interpretation")?.textContent).toContain("Reviewed patient overview");
    expect((document.querySelector(".cr-score-card strong") as HTMLElement)?.style.color).toBe("rgb(220, 61, 80)");
    expect(document.querySelector("a[download]")?.getAttribute("download")).toBe("NIQ-report-NIQ-12.pdf");
    await act(async () => { (document.querySelectorAll(".cr-preview-tab")[1] as HTMLButtonElement).click(); });
    expect(document.querySelector('[aria-label="Medical nutrition therapy report PDF preview"]')).not.toBeNull();
  });
});

test("assessment facts and structured rule schedule stay separate from the three AI sections", async () => {
  const report: GeneratedReport = { ...readyReport,
    clinicalFacts: [{ label: "Diagnosis", value: "Breast cancer" }, { label: "Diet", value: "Vegetarian" }],
    productPlans: [{ id: "plan", duration: "At least 3 months", durationAmount: 90, items: [{
      productName: "Invigour", quantityPerDay: 1, unit: "sachet", timesPerDay: 1,
      preparation: "Mix in 150 ml water", mealTiming: "after breakfast",
    }] }],
    productCatalog: [{ id: "product-1", name: "Invigour", description: "A nutrition supplement.", aliases: [] }],
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    const overview = document.querySelector('[aria-label="Patient overview"]')!;
    const intervention = document.querySelector('[aria-label="Intervention"]')!;
    const recommendations = document.querySelector('[aria-label="Recommendations"]')!;
    expect(overview.querySelector(".cr-clinical-facts")?.textContent).toContain("Breast cancer");
    const factIcons = overview.querySelectorAll(".cr-clinical-fact-icon svg");
    expect(factIcons.length).toBe(2);
    expect(Array.from(factIcons).every(icon => icon.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(overview.textContent).not.toContain("Reviewed patient overview");
    expect(document.querySelector(".cr-clinical-interpretation")?.textContent).toContain("Reviewed patient overview");
    expect(intervention.textContent).toContain("1 sachet");
    expect(intervention.textContent).toContain("A nutrition supplement.");
    expect(intervention.textContent).toContain("Once daily · after breakfast");
    expect(intervention.textContent).toContain("Mix in 150 ml water");
    expect(intervention.textContent).toContain("At least 3 months");
    expect(intervention.textContent).not.toContain("2 Protect");
    expect(recommendations.textContent).toContain("Reviewed monitoring plan");
    const summary = document.querySelector('[aria-label="Report summary"]')!;
    expect(summary.textContent).toContain("Breast cancer");
    expect(summary.textContent).not.toContain("Invigour");
    expect(summary.textContent).not.toContain("1 sachet per day");
    expect(summary.textContent).not.toContain("At least 3 months");
    expect(summary.textContent).not.toContain("2 Protect");
    expect(document.body.textContent).not.toContain("HbA1c");
  });
});

test("older reports get a brief closing recap from reviewed narrative", async () => {
  const report: GeneratedReport = { ...readyReport, narrative: {
    ...readyReport.narrative,
    overallSummary: undefined,
    keyFindings: "Weight loss raises nutritional concern. A second detail stays on the interpretation page.",
    nutritionAdvice: "Use the reviewed nutrition approach. A second nutrition detail stays above.",
    actionSummary: "Discuss changes with the care team. A second action stays above.",
    monitoringSummary: "Monitor weight and intake. A second monitoring detail stays above.",
  } };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    const summary = document.querySelector('[aria-label="Overall clinical summary"]')!;
    expect(Array.from(summary.querySelectorAll("p")).map(point => point.textContent)).toEqual([
      "Weight loss raises nutritional concern.",
      "Use the reviewed nutrition approach.",
      "Discuss changes with the care team.",
      "Monitor weight and intake.",
    ]);
    expect(summary.textContent).not.toContain("second detail");
  });
});

test("updating a ready PDF uses the saved report and refreshes its download link", async () => {
  const updated = { ...readyReport, artifact: { ...readyReport.artifact!, sha256: "b".repeat(64) } };
  const requests: string[] = [];
  await renderWithResponse(async (input: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${input}`);
    return Response.json(init?.method === "POST" ? { report: updated } : { report: readyReport, generation: { status: "READY" } });
  }, async () => {
    expect(document.querySelector("a[download]")?.getAttribute("href")).toContain(`revision=${"a".repeat(64)}`);
    const button = Array.from(document.querySelectorAll("button")).find(item => item.textContent?.includes("Update PDF layout"));
    expect(button).toBeDefined();
    await act(async () => { button!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(requests.some(request => request.includes("POST /api/v1/organizations/org/assessments/assessment/generated-report/refresh-pdf"))).toBe(true);
    expect(document.querySelector("a[download]")?.getAttribute("href")).toContain(`revision=${"b".repeat(64)}`);
  });
});

test("kidney guidance replaces fixed nutrition targets with an individualisation caution", async () => {
  const caution = "Dietary recommendations should be individualized based on renal function, electrolyte status, fluid intake/output, and overall nutritional status, in consultation with the treating oncologist and/or oncology dietitian.";
  const report: GeneratedReport = { ...readyReport, guidance: { sections: [...readyReport.guidance.sections, { id: "comorbidity_kidney_disease", kind: "comorbidity", title: "Kidney disease", text: caution }] } };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    expect(document.querySelector(".cr-renal-caution")?.textContent).toContain("Individualise nutrition targets");
    expect(document.querySelector(".cr-renal-caution")?.textContent).toContain(caution);
    expect(document.querySelector(".cr-nutrition-targets")).toBeNull();
    expect(document.body.textContent).not.toContain("30–35 kcal/kg/day");
  });
});

test("clinical interpretation is shown when it adds meaning beyond measurements", async () => {
  const report: GeneratedReport = { ...readyReport, narrative: { ...readyReport.narrative, keyFindings: "Significant weight loss suggests malnutrition." } };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    expect(document.querySelector(".cr-clinical-interpretation")?.textContent).toContain("Significant weight loss suggests malnutrition.");
  });
});

test("clinical interpretation keeps care implications but omits a measurement recap", async () => {
  const meaningfulFindings = [
    "The recorded weight loss alongside moderate nutrition risk makes early nutrition support and monitoring important.",
    "The recorded 10.1% weight loss makes preventing further weight and muscle loss an important priority.",
  ];
  for (const keyFindings of meaningfulFindings) {
    const report: GeneratedReport = { ...readyReport, narrative: { ...readyReport.narrative, keyFindings } };
    await renderWithResponse({ report, generation: { status: "READY" } }, () => {
      expect(document.querySelector(".cr-clinical-interpretation")?.textContent).toContain(keyFindings);
    });
  }
  const measurementOnly = "Your recorded weight decreased from 76 kg to 72 kg, a loss of 5.3%.";
  const report: GeneratedReport = { ...readyReport, narrative: { ...readyReport.narrative, keyFindings: measurementOnly } };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    expect(document.querySelector(".cr-clinical-interpretation")?.textContent).not.toContain(measurementOnly);
  });
});

test("care guidance keeps approved sentences and uses matched clinical headings", async () => {
  const report: GeneratedReport = {
    ...readyReport,
    narrative: {
      ...readyReport.narrative,
      conditionAdvice: "Discuss a 1.2–1.5 g/kg/day target with your care team. Review fluid intake.",
      effectsAdvice: "Try small meals. Call your care team if vomiting continues.",
    },
    guidance: { sections: [
      ...readyReport.guidance.sections,
      { id: "comorbidity_kidney_disease", kind: "comorbidity", title: "Kidney disease", text: "Individualize targets with the treating team." },
      { id: "toxicity_nausea", kind: "toxicity", title: "Nausea", text: "Matched source guidance" },
    ] },
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    const care = document.querySelector('[aria-label="Recommendations"]')!;
    expect(care.querySelectorAll(".cr-advice-block").length).toBe(4);
    expect(care.textContent).toContain("Kidney disease");
    expect(care.textContent).toContain("Nausea");
    expect(Array.from(care.querySelectorAll(".cr-advice-block"))[0]?.querySelectorAll(".cr-advice-points li").length).toBe(2);
    expect(care.textContent).toContain("1.2–1.5 g/kg/day");
    expect(care.textContent).toContain("Call your care team if vomiting continues.");
    expect(care.textContent).not.toContain("Matched source guidance");
  });
});

test("action and monitoring advice remain in recommendations without other care advice", async () => {
  const report: GeneratedReport = {
    ...readyReport,
    weightHistory: [{ date: null, kg: 70, label: "Previous weight" }, { date: "2026-10-12", kg: 69 }],
    narrative: { ...readyReport.narrative, conditionAdvice: "", effectsAdvice: "" },
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    const status = document.querySelector('[aria-label="Nutrition status"]')!;
    expect(status.querySelector(".cr-weight-panel")).not.toBeNull();
    const recommendations = document.querySelector('[aria-label="Recommendations"]')!;
    expect(recommendations.textContent).toContain("Reviewed action plan");
    expect(recommendations.textContent).toContain("Reviewed monitoring plan");
    expect(status.textContent).not.toContain("Reviewed action plan");
  });
});

test("dense condition advice starts a new headed recommendations page", async () => {
  const conditionAdvice = Array.from({ length: 12 }, (_, index) => `Condition guidance step ${index + 1} stays with the care team.`).join(" ");
  const report: GeneratedReport = {
    ...readyReport,
    narrative: { ...readyReport.narrative, conditionAdvice },
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    const conditionPage = document.querySelector('[aria-label="Other health conditions"]')!;
    const recommendations = document.querySelector('[aria-label="Recommendations"]')!;
    expect(conditionPage.querySelectorAll(".cr-advice-points li").length).toBe(10);
    expect(recommendations.textContent).toContain("(continued)");
    expect(recommendations.querySelectorAll(".cr-advice-points li").length).toBeGreaterThan(4);
    expect(recommendations.querySelector(".cr-sheet-header")).not.toBeNull();
    expect(recommendations.querySelector(".cr-sheet-footer")).not.toBeNull();
  });
});
