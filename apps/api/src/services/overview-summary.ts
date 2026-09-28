import { formatAssessmentReference, hasPermission, type OverviewSummary } from "@niq/application-contracts";
import type { ApplicationConfig } from "@niq/application-config";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../db/client";
import { assessmentPriorities, assessments, facilities, patients } from "../db/schema";
import { decryptPatientData, patientDataKey } from "../security/patient-data";
import type { Principal } from "./application";
import { ServiceError } from "./application";
import { facilityAccessCondition } from "./facility-access";
import { myAssessmentAction } from "./my-assessment-action";

export async function loadOverviewSummary(db: Database, config: ApplicationConfig, actor: Principal, organizationId: string, priorityPage: number, recentPage: number): Promise<OverviewSummary> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000);
  // Raw SQL fragments bypass Drizzle's timestamp column encoder; bind ISO strings instead of Date objects.
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const thirtyDaysAgoSql = sql`${thirtyDaysAgo.toISOString()}::timestamptz`;
  const threeDaysAgoSql = sql`${threeDaysAgo.toISOString()}::timestamptz`;
  const canReadAssessments = hasPermission(actor.role, "assessments.list");
  const patientScope = and(eq(patients.organizationId, organizationId), eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId));
  const assessmentScope = and(eq(assessments.organizationId, organizationId), facilityAccessCondition(actor, organizationId, assessments.facilityId));
  const key = patientDataKey(config.PATIENT_DATA_ENCRYPTION_KEY, config.SESSION_SECRET);
  const displayName = (value: Uint8Array) => (JSON.parse(decryptPatientData(value, key)) as { name: string }).name;
  const [patientCounts] = await db.select({ total: sql<number>`count(*)::int`, added: sql<number>`count(*) filter (where ${patients.createdAt} between ${thirtyDaysAgoSql} and ${nowSql})::int` }).from(patients).where(patientScope);

  let completedCount = 0, completedAdded30Days = 0, scoringIssues = 0;
  let myAssessmentActions = 0, readyToSend = 0, correctionsToMake = 0;
  let priority: OverviewSummary["priority"] = { total: 0, page: priorityPage, pageSize: 3, items: [] };
  if (canReadAssessments) {
    const [counts] = await db.select({
      completed: sql<number>`count(*) filter (where ${assessments.status} = 'COMPLETED')::int`,
      added: sql<number>`count(*) filter (where ${assessments.status} = 'COMPLETED' and ${assessments.completedAt} between ${thirtyDaysAgoSql} and ${nowSql})::int`,
      issues: sql<number>`count(*) filter (where ${assessments.status} = 'SCORING_UNAVAILABLE')::int`,
    }).from(assessments).where(assessmentScope);
    completedCount = counts?.completed ?? 0;
    completedAdded30Days = counts?.added ?? 0;
    scoringIssues = counts?.issues ?? 0;
    if (actor.platformRole === "USER") {
      const actionRows = await db.select({ status: assessments.status, createdByMembershipId: assessments.createdByMembershipId, review: assessments.clinicalReview })
        .from(assessments).innerJoin(patients, and(eq(patients.organizationId, assessments.organizationId), eq(patients.id, assessments.patientId)))
        .where(and(assessmentScope, eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId), inArray(assessments.status, ["DRAFT", "SCORED"])));
      for (const row of actionRows) {
        let correctionPerson: string | null = null;
        if (row.review) {
          const encrypted = (row.review as { encrypted?: string }).encrypted;
          if (!encrypted) throw new ServiceError("CONFLICT", "Assessment review data could not be read.");
          const review = JSON.parse(decryptPatientData(Buffer.from(encrypted, "base64"), key)) as { correctionPerson?: { membershipId?: string } };
          correctionPerson = review.correctionPerson?.membershipId ?? null;
        }
        const action = myAssessmentAction(actor, row, correctionPerson);
        if (action) myAssessmentActions++;
        if (action === "CORRECT_DRAFT") correctionsToMake++;
        if (action === "SEND_FOR_REVIEW") readyToSend++;
      }
    }
    const priorityScope = and(eq(assessmentPriorities.organizationId, organizationId), eq(assessmentPriorities.membershipId, actor.membershipId), assessmentScope);
    const [priorityCount] = await db.select({ total: sql<number>`count(*)::int` }).from(assessmentPriorities)
      .innerJoin(assessments, and(eq(assessments.organizationId, assessmentPriorities.organizationId), eq(assessments.id, assessmentPriorities.assessmentId))).where(priorityScope);
    const priorityRows = await db.select({ id: assessments.id, serialNumber: assessments.serialNumber, patientId: patients.id, patientPrefix: patients.referencePrefix,
      patientSerial: patients.serialNumber, profile: patients.encryptedProfile, status: assessments.status, createdAt: assessments.createdAt, completedAt: assessments.completedAt })
      .from(assessmentPriorities).innerJoin(assessments, and(eq(assessments.organizationId, assessmentPriorities.organizationId), eq(assessments.id, assessmentPriorities.assessmentId)))
      .innerJoin(patients, and(eq(patients.organizationId, assessments.organizationId), eq(patients.id, assessments.patientId)))
      .where(priorityScope).orderBy(desc(assessments.createdAt), desc(assessments.id)).limit(3).offset((priorityPage - 1) * 3);
    priority = { total: priorityCount?.total ?? 0, page: priorityPage, pageSize: 3, items: priorityRows.map(row => ({ id: row.id, reference: formatAssessmentReference(row.serialNumber),
      patient: { id: row.patientId, reference: `${row.patientPrefix}-${row.patientSerial}`, displayName: displayName(row.profile) },
      status: row.status, createdAt: row.createdAt, completedAt: row.completedAt })) };
  }

  const latest = alias(assessments, "recent_assessment");
  const activity = canReadAssessments ? sql<Date>`greatest(${patients.createdAt}, coalesce((select max(${latest.createdAt}) from ${assessments} as ${latest} where ${latest.organizationId} = ${organizationId} and ${latest.patientId} = ${patients.id} and ${facilityAccessCondition(actor, organizationId, latest.facilityId)}), ${patients.createdAt}))` : sql<Date>`${patients.createdAt}`;
  const recentScope = and(patientScope, ...(canReadAssessments ? [gte(activity, threeDaysAgoSql), lte(activity, nowSql)] : []));
  const [recentCount] = await db.select({ total: sql<number>`count(*)::int` }).from(patients).where(recentScope);
  const recentRows = await db.select({ id: patients.id, prefix: patients.referencePrefix, serial: patients.serialNumber, profile: patients.encryptedProfile,
    createdAt: patients.createdAt, facilityId: facilities.id, facilityName: facilities.name })
    .from(patients).leftJoin(facilities, and(eq(facilities.organizationId, patients.organizationId), eq(facilities.id, patients.homeFacilityId)))
    .where(recentScope).orderBy(desc(activity), desc(patients.id)).limit(4).offset((recentPage - 1) * 4);
  const latestByPatient = new Map<string, OverviewSummary["priority"]["items"][number]>();
  if (canReadAssessments && recentRows.length) {
    const assessmentRows = await db.selectDistinctOn([assessments.patientId], { id: assessments.id, serialNumber: assessments.serialNumber, patientId: patients.id, patientPrefix: patients.referencePrefix,
      patientSerial: patients.serialNumber, profile: patients.encryptedProfile, status: assessments.status, createdAt: assessments.createdAt, completedAt: assessments.completedAt })
      .from(assessments).innerJoin(patients, and(eq(patients.organizationId, assessments.organizationId), eq(patients.id, assessments.patientId)))
      .where(and(assessmentScope, inArray(assessments.patientId, recentRows.map(row => row.id))))
      .orderBy(assessments.patientId, desc(assessments.createdAt), desc(assessments.id));
    for (const row of assessmentRows) if (!latestByPatient.has(row.patientId)) latestByPatient.set(row.patientId, { id: row.id, reference: formatAssessmentReference(row.serialNumber),
      patient: { id: row.patientId, reference: `${row.patientPrefix}-${row.patientSerial}`, displayName: displayName(row.profile) },
      status: row.status, createdAt: row.createdAt, completedAt: row.completedAt });
  }
  return { patientCount: patientCounts?.total ?? 0, patientsAdded30Days: patientCounts?.added ?? 0, completedCount, completedAdded30Days,
    myAssessmentActions, readyToSend, correctionsToMake, scoringIssues, priority,
    recent: { total: recentCount?.total ?? 0, page: recentPage, pageSize: 4, items: recentRows.map(row => ({
      patient: { id: row.id, reference: `${row.prefix}-${row.serial}`, displayName: displayName(row.profile),
        homeFacility: row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null, createdAt: row.createdAt },
      assessment: latestByPatient.get(row.id) ?? null,
    })) } };
}
