import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentReports } from "./AssessmentReports";

test("reports shows the configured per-file limit", () => {
  const html = renderToStaticMarkup(<AssessmentReports organizationId="org" assessmentId="assessment" reports={[]} revision={0} onChanged={async () => {}} limits={{ fileBytes: 3 * 1024 * 1024, filesPerReport: 2, reportsPerAssessment: 4, assessmentBytes: 12 * 1024 * 1024 }}/>);
  expect(html).toContain("Up to 3 MB per file");
  expect(html).not.toContain("10 MB");
});
