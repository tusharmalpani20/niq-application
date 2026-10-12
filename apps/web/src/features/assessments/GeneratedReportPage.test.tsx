import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AuthenticatedUser } from "@niq/application-contracts";
import { GeneratedReportPage } from "./GeneratedReportPage";

async function renderWithResponse(response: unknown, inspect: () => void) {
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
      root.render(<MemoryRouter initialEntries={["/assessments/assessment/generated-report"]}><Routes><Route element={<Outlet context={user}/>}><Route path="/assessments/:assessmentId/generated-report" element={<GeneratedReportPage/>}/></Route></Routes></MemoryRouter>);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    inspect();
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

test("ready report previews and downloads the saved PDF without another approval", async () => {
  const report = {
    status: "READY",
    assessment: { reference: "NIQ-12", ruleVersionId: "rules-2" },
    generatedAt: "2026-10-12T08:00:00.000Z",
    artifact: { sha256: "a".repeat(64), size: 1024 },
  };
  await renderWithResponse({ report, generation: { status: "READY" } }, () => {
    expect(document.body.textContent).toContain("Final report ready");
    expect(document.body.textContent).not.toContain("Approve report");
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('[aria-label="Medical nutrition therapy report PDF preview"]')).not.toBeNull();
    expect(document.querySelector("a[download]")?.getAttribute("download")).toBe("NIQ-report-NIQ-12.pdf");
  });
});
