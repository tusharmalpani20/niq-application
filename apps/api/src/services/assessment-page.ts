import { formatAssessmentReference, type AssessmentPageQuery, type AssessmentPageResponse, type AssessmentSummary } from "@niq/application-contracts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { assessmentPriorities, assessments, facilities, patients } from "../db/schema";
import { decryptPatientData, patientDataKey } from "../security/patient-data";
import type { Principal } from "./application";
import { ServiceError } from "./application";
import { assessmentVisibilityCondition, canSeeAssessment } from "./assessment-access";
import { loadAssessmentRiskCategories } from "./assessment-risk-categories";
import { facilityAccessCondition } from "./facility-access";
import { myAssessmentAction } from "./my-assessment-action";
import type { ClinicalReviewStored } from "./clinical-review-state";

const workStatuses = new Set(["DRAFT", "READY_FOR_SCORING", "UNDER_REVIEW", "SCORING_UNAVAILABLE"]);
const openStatuses = new Set(["DRAFT", "READY_FOR_SCORING"]);

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number] & { myAction: AssessmentSummary["myAction"] };

function unseal<T>(value: unknown, key: Buffer): T {
  const encrypted = (value as { encrypted?: string } | null)?.encrypted;
  if (!encrypted) throw new ServiceError("CONFLICT", "Assessment data could not be read.");
  return JSON.parse(decryptPatientData(Buffer.from(encrypted, "base64"), key)) as T;
}

async function loadCandidates(db: Database, actor: Principal, organizationId: string) {
  // Review state is needed here only for legacy ownership and draft correction actions.
  // Completed review snapshots and patient profiles are loaded after pagination.
  return db.select({
    id: assessments.id,
    serialNumber: assessments.serialNumber,
    organizationId: assessments.organizationId,
    patientId: patients.id,
    patientReferencePrefix: patients.referencePrefix,
    patientSerialNumber: patients.serialNumber,
    patientArchived: patients.isArchived,
    patientAccessible: sql<boolean>`(${facilityAccessCondition(actor, organizationId, patients.homeFacilityId)})`,
    facilityId: facilities.id,
    facilityName: facilities.name,
    status: assessments.status,
    createdByMembershipId: assessments.createdByMembershipId,
    currentOwnerMembershipId: assessments.currentOwnerMembershipId,
    clinicalReview: sql<typeof assessments.$inferSelect.clinicalReview>`case when ${assessments.status} in ('DRAFT', 'SCORED', 'SCORING_PENDING', 'SCORING_UNAVAILABLE') then ${assessments.clinicalReview} else null end`,
    createdAt: assessments.createdAt,
    updatedAt: assessments.updatedAt,
    completedAt: assessments.completedAt,
    priorityMembershipId: assessmentPriorities.membershipId,
  }).from(assessments)
    .innerJoin(patients, and(eq(patients.organizationId, assessments.organizationId), eq(patients.id, assessments.patientId)))
    .leftJoin(facilities, and(eq(facilities.organizationId, assessments.organizationId), eq(facilities.id, assessments.facilityId)))
    .leftJoin(assessmentPriorities, and(eq(assessmentPriorities.organizationId, assessments.organizationId), eq(assessmentPriorities.assessmentId, assessments.id), eq(assessmentPriorities.membershipId, actor.membershipId)))
    .where(and(eq(assessments.organizationId, organizationId), facilityAccessCondition(actor, organizationId, assessments.facilityId), assessmentVisibilityCondition(actor)))
    .orderBy(desc(assessments.createdAt), desc(assessments.id));
}

function matchesStatus(row: Candidate, status: string, now: Date): boolean {
  if (status === "all") return true;
  if (status === "WORK") return workStatuses.has(row.status);
  if (status === "OPEN") return openStatuses.has(row.status);
  if (status === "MY_ACTIONS") return row.myAction !== null;
  if (["EDIT_DRAFT", "CORRECT_DRAFT", "SEND_FOR_REVIEW"].includes(status)) return row.myAction === status;
  if (status === "PRIORITY") return row.priorityMembershipId !== null;
  if (status === "COMPLETED_THIS_MONTH") return row.status === "COMPLETED" && row.completedAt !== null && row.completedAt.getFullYear() === now.getFullYear() && row.completedAt.getMonth() === now.getMonth();
  return row.status === status;
}

export async function listAssessmentPage(db: Database, actor: Principal, organizationId: string, options: AssessmentPageQuery, sessionSecret: string, encryptionKey?: string): Promise<AssessmentPageResponse> {
  const key = patientDataKey(encryptionKey, sessionSecret);
  const candidates = (await loadCandidates(db, actor, organizationId)).flatMap((row): Candidate[] => {
    const correctionPersonId = row.clinicalReview ? unseal<ClinicalReviewStored>(row.clinicalReview, key).correctionPerson?.membershipId ?? null : null;
    if (!canSeeAssessment(row, actor, correctionPersonId)) return [];
    return [{ ...row, myAction: !row.patientArchived && row.patientAccessible ? myAssessmentAction(actor, row, correctionPersonId) : null }];
  });
  // Shared filters define the population represented by every tab badge.
  let shared = candidates.filter(row => options.facility === "all" || row.facilityId === options.facility);

  const normalizedQuery = options.query.trim().toLowerCase();
  const nameByPatient = new Map<string, string>();
  if (normalizedQuery) {
    const unmatched = shared.filter(row => !`${formatAssessmentReference(row.serialNumber)} ${row.patientReferencePrefix}-${row.patientSerialNumber} ${row.facilityName ?? ""}`.toLowerCase().includes(normalizedQuery));
    const patientIds = [...new Set(unmatched.map(row => row.patientId))];
    if (patientIds.length) {
      const profiles = await db.select({ id: patients.id, encryptedProfile: patients.encryptedProfile }).from(patients)
        .where(and(eq(patients.organizationId, organizationId), inArray(patients.id, patientIds)));
      for (const profile of profiles) nameByPatient.set(profile.id, (JSON.parse(decryptPatientData(profile.encryptedProfile, key)) as { name: string }).name);
    }
    shared = shared.filter(row => `${formatAssessmentReference(row.serialNumber)} ${row.patientReferencePrefix}-${row.patientSerialNumber} ${nameByPatient.get(row.patientId) ?? ""} ${row.facilityName ?? ""}`.toLowerCase().includes(normalizedQuery));
  }

  // Risk categories depend on encrypted review and scoring state. Resolve the
  // shared set only when risk filtering requires counts for every tab.
  let riskById = new Map<string, AssessmentSummary["riskCategory"]>();
  if (options.risk !== "all" && shared.length) {
    riskById = await categoriesForRows(db, organizationId, shared, key);
    shared = shared.filter(row => riskById.get(row.id) === options.risk);
  }
  let allCount = shared.length;
  let myWorkCount = shared.filter(row => row.myAction !== null).length;
  let completedCount = shared.filter(row => row.status === "COMPLETED").length;
  const filtered = shared.filter(row =>
    (options.tab !== "my-work" || row.myAction !== null) &&
    (options.tab !== "completed" || row.status === "COMPLETED") &&
    matchesStatus(row, options.status, new Date()));
  const total = filtered.length;
  // A tab-specific status filter changes its own badge, while other badges
  // continue to show the counts reached by the shared filters.
  if (options.tab === "my-work") myWorkCount = total;
  else if (options.tab === "completed") completedCount = total;
  else allCount = total;
  const visible = filtered.slice((options.page - 1) * options.pageSize, options.page * options.pageSize);
  if (options.risk === "all" && visible.length) riskById = await categoriesForRows(db, organizationId, visible, key);
  const missingNames = [...new Set(visible.filter(row => !nameByPatient.has(row.patientId)).map(row => row.patientId))];
  if (missingNames.length) {
    const profiles = await db.select({ id: patients.id, encryptedProfile: patients.encryptedProfile }).from(patients)
      .where(and(eq(patients.organizationId, organizationId), inArray(patients.id, missingNames)));
    for (const profile of profiles) nameByPatient.set(profile.id, (JSON.parse(decryptPatientData(profile.encryptedProfile, key)) as { name: string }).name);
  }
  return {
    items: visible.map(row => ({
      id: row.id, reference: formatAssessmentReference(row.serialNumber), serialNumber: row.serialNumber, organizationId: row.organizationId,
      patient: { id: row.patientId, reference: `${row.patientReferencePrefix}-${row.patientSerialNumber}`, displayName: nameByPatient.get(row.patientId) ?? "" },
      facility: row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null,
      status: row.status, riskCategory: riskById.get(row.id) ?? null, myAction: row.myAction, isPriority: row.priorityMembershipId !== null,
      createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt,
    })),
    total, allCount, myWorkCount, completedCount, page: options.page, pageSize: options.pageSize,
  };
}

async function categoriesForRows(db: Database, organizationId: string, rows: Candidate[], key: Buffer) {
  const details = await db.select({ id: assessments.id, status: assessments.status, currentSubmissionId: assessments.currentSubmissionId, clinicalReview: assessments.clinicalReview, finalRiskCategory: assessments.finalRiskCategory })
    .from(assessments).where(and(eq(assessments.organizationId, organizationId), inArray(assessments.id, rows.map(row => row.id))));
  return loadAssessmentRiskCategories(db, organizationId, details, <T>(value: unknown) => unseal<T>(value, key));
}
