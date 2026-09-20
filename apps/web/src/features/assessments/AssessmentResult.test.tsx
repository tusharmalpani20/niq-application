import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentResult, assessmentResultView } from "./AssessmentResult";
import type { AssessmentWorkflow } from "@niq/application-contracts";
const record = {
  result: { formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score: 0, classification: { id: "low", label: "Low", interpretation: "" }, components: [
    { id: "a", sectionId: "diet", label: "A", points: 0, status: "answered" }, { id: "b", sectionId: "diet", label: "B", points: null, status: "unanswered" },
  ], version: "FINAL-1", checksum: "a".repeat(64), resultReference: "result", calculatedAt: "2026-09-20T00:00:00.000Z", clinicalUsePermitted: true },
  binding: { version: "FINAL-1", checksum: "a".repeat(64) },
  manifest: { version: "overlay", sections: [{ id: "personal", title: "Personal details", fields: [] }, { id: "diet", title: "Dietary details", fields: [{ id: "a", owner: "scoring" }, { id: "b", owner: "scoring" }] }] },
  progress: { answered: 4, required: 4, percent: 100, configurationError: false, sections: [{ id: "personal", percent: 100, required: 4, answered: 4, missingFieldIds: [] }, { id: "diet", percent: null, required: 0, answered: 0, missingFieldIds: [] }] }, reports: [],
} as unknown as AssessmentWorkflow;
test("shows optional-answer subtotal separately from complete required questionnaire", () => {
  const view = assessmentResultView(record)!;
  expect(view.sections[1]).toMatchObject({ points: 0, label: "Answered subtotal", unanswered: 1 });
  expect(view.sections[0]).toMatchObject({ points: null, label: "Not scored" });
  const html = renderToStaticMarkup(<AssessmentResult record={record} onSection={() => {}}/>);
  expect(html).toContain("100%");
  expect(html).toContain("Answered subtotal: 0 points");
  expect(html).toContain("1 unanswered");
  expect(html).not.toContain("Score percentage");
});
test("rejects inconsistent persisted results instead of showing fabricated totals", () => {
  const value = record.result as Record<string, unknown>;
  expect(assessmentResultView({ ...record, result: { ...value, score: 1 } })).toBeNull();
  expect(assessmentResultView({ ...record, result: { ...value, checksum: "b".repeat(64) } })).toBeNull();
  expect(assessmentResultView({ ...record, result: { ...value, components: [] } })).toBeNull();
});

test("unresolved component includes the server reason rather than implying processing", () => {
  const original = record.result as { components: Array<Record<string, unknown>> };
  const pending = { ...record, result: { ...original, components: original.components.map((component, index) => index === 1 ? { ...component, status: "pending", reason: "Enter both weights to calculate weight loss." } : component) } };
  const html = renderToStaticMarkup(<AssessmentResult record={pending} onSection={() => {}}/>);
  expect(html).toContain("B: Enter both weights to calculate weight loss.");
  expect(html).not.toContain("Processing");
});
