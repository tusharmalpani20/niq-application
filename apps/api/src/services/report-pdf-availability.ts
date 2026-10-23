import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { GeneratedReport } from "../../../../packages/contracts/src/generated-report";
import type { Database } from "../db/client";
import { assessments, generatedReportArtifacts, generatedReports } from "../db/schema";
import { decryptPatientData } from "../security/patient-data";
import { emptyClinicalReview, type ClinicalReviewStored } from "./clinical-review-state";
import { reportSourceFingerprint } from "./report-source-fingerprint";

type ReportData = Pick<GeneratedReport, "assessment" | "decision" | "issues">;
/** Read-only, bounded batch projection. Does not fetch PDF bytes or generate a report. */
export async function loadReportPdfAvailability(db: Database, organizationId: string, assessmentIds: string[], key: Buffer): Promise<Map<string, boolean>> {
  const available = new Map(assessmentIds.map(id => [id, false]));
  if (!assessmentIds.length) return available;
  // Select the same latest final report as downloadPdf, even during a later retry.
  const finals = db.selectDistinctOn([generatedReports.assessmentId], {
    id: generatedReports.id, assessmentId: generatedReports.assessmentId, revision: generatedReports.revision,
    content: generatedReports.content, sourceFingerprint: generatedReports.sourceFingerprint,
  }).from(generatedReports).where(and(eq(generatedReports.organizationId, organizationId), inArray(generatedReports.assessmentId, assessmentIds),
    or(eq(generatedReports.status, "READY"), eq(generatedReports.status, "APPROVED"))))
    .orderBy(generatedReports.assessmentId, desc(generatedReports.createdAt), desc(generatedReports.id)).as("final_reports");
  const rows = await db.select({ assessmentId: finals.assessmentId, content: finals.content, sourceFingerprint: finals.sourceFingerprint,
    revision: finals.revision, artifactRevision: generatedReportArtifacts.revision, artifactSize: generatedReportArtifacts.size,
    storedBytes: sql<number>`octet_length(${generatedReportArtifacts.encryptedPdf})`,
    status: assessments.status, currentSubmissionId: assessments.currentSubmissionId, completedAt: assessments.completedAt, clinicalReview: assessments.clinicalReview,
  }).from(finals).innerJoin(assessments, and(eq(assessments.organizationId, organizationId), eq(assessments.id, finals.assessmentId)))
    .leftJoin(generatedReportArtifacts, and(eq(generatedReportArtifacts.organizationId, organizationId), eq(generatedReportArtifacts.assessmentId, finals.assessmentId), eq(generatedReportArtifacts.reportId, finals.id)));
  const unseal = <T>(value: unknown): T => {
    const encrypted = (value as { encrypted?: string } | null)?.encrypted;
    if (!encrypted) throw new Error("Missing encrypted content");
    return JSON.parse(decryptPatientData(Buffer.from(encrypted, "base64"), key)) as T;
  };
  for (const row of rows) {
    if (!row.content || row.artifactRevision !== row.revision || !row.artifactSize || !row.storedBytes) continue;
    try {
      const data = unseal<ReportData>(row.content);
      const review = row.clinicalReview ? unseal<ClinicalReviewStored>(row.clinicalReview) : emptyClinicalReview();
      available.set(row.assessmentId, data.issues.length === 0 && reportSourceFingerprint(row, review, data.assessment.checksum, data.decision) === row.sourceFingerprint);
    } catch { /* Unreadable or legacy content fails closed without breaking the list. */ }
  }
  return available;
}
