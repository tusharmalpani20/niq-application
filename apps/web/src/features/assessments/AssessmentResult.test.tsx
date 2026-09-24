import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentResult, assessmentResultView, sectionScoreLabel } from "./AssessmentResult";
import type { AssessmentWorkflow } from "@niq/application-contracts";
const record = {
  reference: "ASM-000001",
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
  expect(html).toContain("Required answers");
  expect(html).not.toContain("100%");
  expect(html).toContain("0 pts (partial)");
  expect(html).toContain("1 unanswered");
  expect(html).not.toContain("Score percentage");
  expect(html).not.toContain("Technical details");
  expect(html).not.toContain("Rule checksum");
  expect(html).not.toContain("Result reference");
});
test("rejects inconsistent persisted results instead of showing fabricated totals", () => {
  const value = record.result as Record<string, unknown>;
  expect(assessmentResultView({ ...record, result: { ...value, score: 1 } })).toBeNull();
  expect(assessmentResultView({ ...record, result: { ...value, checksum: "b".repeat(64) } })).toBeNull();
  expect(assessmentResultView({ ...record, result: { ...value, components: [] } })).toBeNull();
});

test("completed blank assessment shows a dash without a risk category", () => {
  const value = record.result as { components: Array<Record<string, unknown>> };
  const blank = { ...record, result: { ...value, score: null, classification: null,
    components: value.components.map(component => ({ ...component, points: null, status: "unanswered" })) } };
  expect(assessmentResultView(blank)).not.toBeNull();
  const html = renderToStaticMarkup(<AssessmentResult record={blank} onSection={() => {}} />);
  expect(html).toContain("Final NIQ score");
  expect(html).toContain("—");
  expect(html).not.toContain("Low");
  expect(html).not.toContain("0 points");
  expect(assessmentResultView({ ...blank, result: { ...blank.result, components: value.components } })).toBeNull();
});

test("server-scored Vital IQ appears in the final total when the questionnaire is blank", () => {
  const value = record.result as { components: Array<Record<string, unknown>> };
  const combined = { ...record, result: { ...value, score: 1, questionnaireScore: null, faceScan: { sessionId: "scan-1", points: 1 },
    components: value.components.map(component => ({ ...component, points: null, status: "unanswered" })) } };
  expect(assessmentResultView(combined)).not.toBeNull();
  const html = renderToStaticMarkup(<AssessmentResult record={combined} onSection={() => {}} />);
  expect(html).toContain("Final NIQ score");
  expect(html).not.toContain("Questionnaire — + Vital IQ 1");
  expect(assessmentResultView({ ...combined, result: { ...combined.result, score: 2 } })).toBeNull();
});

test("unresolved component includes the server reason rather than implying processing", () => {
  const original = record.result as { components: Array<Record<string, unknown>> };
  const pending = { ...record, result: { ...original, components: original.components.map((component, index) => index === 1 ? { ...component, status: "pending", reason: "Enter both weights to calculate weight loss." } : component) } };
  const html = renderToStaticMarkup(<AssessmentResult record={pending} onSection={() => {}}/>);
  expect(html).toContain("B: Enter both weights to calculate weight loss.");
  expect(html).not.toContain("Processing");
});

test("section badges preserve zero scores and distinguish partial totals from unscored sections", () => {
  expect(sectionScoreLabel({points: 0, unanswered: 0, unresolved: 0})).toBe("0 pts");
  expect(sectionScoreLabel({points: 8, unanswered: 1, unresolved: 0})).toBe("8 pts (partial)");
  expect(sectionScoreLabel({points: 8, unanswered: 0, unresolved: 1})).toBe("8 pts (partial)");
  expect(sectionScoreLabel({points: null, unanswered: 2, unresolved: 0})).toBeNull();
});
