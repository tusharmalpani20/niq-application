import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentReports } from "./AssessmentReports";

test("reports shows the configured per-file limit", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" reports={[]} revision={0} onChanged={async () => {}} limits={{ fileBytes: 3 * 1024 * 1024, filesPerReport: 2, reportsPerAssessment: 4, assessmentBytes: 12 * 1024 * 1024 }}/>);
  expect(html).toContain("Up to 3 MB per file");
  expect(html).not.toContain("10 MB");
});

test("report cards retain download and labelled removal controls in a compact group", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" revision={2} onChanged={async () => {}} reports={[{
    id: "report-1", label: "Blood test", purpose: "Before treatment", datePrecision: "MONTH", year: 2026, month: 8, day: null,
    files: [{ id: "file-1", reportId: "report-1", originalFilename: "CBC.pdf", mediaType: "application/pdf", size: 1000, status: "READY", createdAt: "2026-08-01" }],
  }]}/>);
  expect(html).toContain("Report 1");
  expect(html).toContain("Before treatment");
  expect(html).toContain("Month and year");
  expect(html).toContain("2026-08");
  expect(html).toContain('aria-label="Remove CBC.pdf"');
  expect(html).toContain('aria-label="Add files to report 1"');
  expect(html).toContain("Add another report");
  expect(html).not.toContain("<h2");
});

test("read-only report cards have no mutation controls", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" revision={0} readOnly onChanged={async () => {}} reports={[]}/>);
  expect(html).not.toContain('data-slot="button"');
  expect(html).not.toContain('type="file"');
});
