import { expect, test } from "bun:test";
import { getReportSubmissionIssues, type AssessmentReport } from "./assessment-workflow";

const report: AssessmentReport = {
  id: "report-a", label: "Blood results", purpose: "", datePrecision: "DAY",
  year: null, month: null, day: null, files: [],
};
const file = { id: "file-a", reportId: report.id, originalFilename: "results.pdf", mediaType: "application/pdf", size: 100, status: "READY", createdAt: "2026-09-24" };

test("a saved report needs a date and a ready file before submission", () => {
  expect(getReportSubmissionIssues(report)).toEqual(["date", "file"]);
  expect(getReportSubmissionIssues({ ...report, year: 2026, month: 9, files: [file] })).toEqual(["date"]);
  expect(getReportSubmissionIssues({ ...report, year: 2026, month: 9, day: 24, files: [file] })).toEqual([]);
  expect(getReportSubmissionIssues({ ...report, datePrecision: "MONTH", year: 2026, month: 9, files: [file] })).toEqual([]);
  expect(getReportSubmissionIssues({ ...report, datePrecision: "MONTH", year: 2026, files: [file] })).toEqual(["date"]);
  expect(getReportSubmissionIssues({ ...report, datePrecision: "MONTH", year: 2026, month: 9, files: [{ ...file, status: "PENDING" }] })).toEqual(["file"]);
  expect(getReportSubmissionIssues({ ...report, label: " ", datePrecision: "MONTH", year: 2026, month: 9, files: [file] })).toEqual(["name"]);
});
