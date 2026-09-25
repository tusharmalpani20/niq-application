import type { ApplicationConfig } from "@niq/application-config";
import type { CorrectPatientMrn, UpdatePatient, UpdateOrganizationUser } from "@niq/application-contracts";
import { createEntityId } from "@niq/application-domain";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditEvents, authSessions, facilities, facilityMemberships, organizationMemberships, organizations, patients, users } from "../db/schema";
import { decryptPatientData, encryptPatientData, patientDataKey } from "../security/patient-data";
import { keyedHash } from "../security/tokens";
import { ServiceError, type Principal, type RequestContext } from "./application";
import { facilityAccessCondition } from "./facility-access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
async function audit(tx: Transaction, actor: Principal, organizationId: string, context: RequestContext, action: string, entityType: string, entityId: string, fields: string[]) {
  await tx.insert(auditEvents).values({ id: createEntityId(), organizationId, actorType: "USER", actorMembershipId: actor.membershipId, action, resourceType: entityType, resourceId: entityId, requestId: context.requestId, metadata: { fields } });
}
export async function editPatient(db: Database, config: ApplicationConfig, actor: Principal, organizationId: string, locator: string, input: UpdatePatient, context: RequestContext) {
  const reference = /^([A-Z][A-Z0-9]{1,11})-([1-9]\d{0,9})$/.exec(locator);
  const match = reference ? and(eq(patients.referencePrefix, reference[1]!), eq(patients.serialNumber, Number(reference[2]))) : eq(patients.id, locator);
  const key = patientDataKey(config.PATIENT_DATA_ENCRYPTION_KEY, config.SESSION_SECRET);
  try {
    return await db.transaction(async tx => {
      const [prior] = await tx.select().from(patients).where(and(eq(patients.organizationId, organizationId), match, eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId))).for("update");
      if (!prior) throw new ServiceError("NOT_FOUND", "Patient not found.");
      const [facility] = await tx.select().from(facilities).where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, input.homeFacilityId), facilityAccessCondition(actor, organizationId, facilities.id))).for("share");
      if (!facility || (prior.homeFacilityId !== facility.id && facility.status !== "ACTIVE")) throw new ServiceError("NOT_FOUND", "Facility not found or inactive.");
      const profile = JSON.parse(decryptPatientData(prior.encryptedProfile, key)) as { name: string; phone?: string; email?: string };
      const changedFields = [
        prior.homeFacilityId !== facility.id && "homeFacilityId",
        prior.dateOfBirth !== input.dateOfBirth && "dateOfBirth",
        prior.gender !== input.gender && "gender",
        profile.name !== input.name && "name",
        (profile.phone ?? "") !== input.phone && "phone",
        (profile.email ?? "") !== (input.email ?? "") && "email",
      ].filter((field): field is string => Boolean(field));
      // Only the patient profile changes; existing assessment snapshots remain historical.
      const [updated] = await tx.update(patients).set({ homeFacilityId: facility.id, dateOfBirth: input.dateOfBirth, gender: input.gender,
        encryptedProfile: encryptPatientData(JSON.stringify({ name: input.name, ...(input.phone ? { phone: input.phone } : {}), ...(input.email ? { email: input.email } : {}) }), key),
        encryptionKeyVersion: config.PATIENT_DATA_KEY_VERSION, updatedAt: new Date(),
      }).where(and(eq(patients.id, prior.id), eq(patients.organizationId, organizationId))).returning();
      if (!updated) throw new ServiceError("NOT_FOUND", "Patient not found.");
      await audit(tx, actor, organizationId, context, "PATIENT_UPDATED", "patient", prior.id, changedFields);
      return { ...updated, facilityId: facility.id, facilityName: facility.name };
    });
  } catch (error) {
    if (errorCode(error) === "23505") throw new ServiceError("CONFLICT", "Patient changes conflict with an existing record.");
    throw error;
  }
}
export async function correctPatientMrn(db: Database, config: ApplicationConfig, actor: Principal, organizationId: string, locator: string, input: CorrectPatientMrn, context: RequestContext) {
  if (actor.role !== "ORGANIZATION_ADMIN" || actor.organizationId !== organizationId) throw new ServiceError("FORBIDDEN", "Only organization administrators can correct a medical record number.");
  const reference = /^([A-Z][A-Z0-9]{1,11})-([1-9]\d{0,9})$/.exec(locator);
  const match = reference ? and(eq(patients.referencePrefix, reference[1]!), eq(patients.serialNumber, Number(reference[2]))) : eq(patients.id, locator);
  const key = patientDataKey(config.PATIENT_DATA_ENCRYPTION_KEY, config.SESSION_SECRET);
  const mrn = input.medicalRecordNumber.trim().toUpperCase();
  try {
    return await db.transaction(async tx => {
      const [prior] = await tx.select().from(patients).where(and(eq(patients.organizationId, organizationId), match, eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId))).for("update");
      if (!prior) throw new ServiceError("NOT_FOUND", "Patient not found.");
      if (decryptPatientData(prior.encryptedExternalReference, key) === mrn) throw new ServiceError("CONFLICT", "Enter a different medical record number.");
      const [updated] = await tx.update(patients).set({
        encryptedExternalReference: encryptPatientData(mrn, key),
        externalReferenceLookupHash: await keyedHash(mrn, key.toString("base64")),
        encryptionKeyVersion: config.PATIENT_DATA_KEY_VERSION,
        updatedAt: new Date(),
      }).where(and(eq(patients.id, prior.id), eq(patients.organizationId, organizationId))).returning();
      if (!updated) throw new ServiceError("NOT_FOUND", "Patient not found.");
      await tx.insert(auditEvents).values({ id: createEntityId(), organizationId, actorType: "USER", actorMembershipId: actor.membershipId, action: "PATIENT_MRN_CORRECTED", resourceType: "patient", resourceId: prior.id, requestId: context.requestId, metadata: { reason: input.reason } });
      const [facility] = prior.homeFacilityId ? await tx.select({ id: facilities.id, name: facilities.name }).from(facilities).where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, prior.homeFacilityId))) : [];
      return { ...updated, facilityId: facility?.id ?? null, facilityName: facility?.name ?? null };
    });
  } catch (error) {
    if (errorCode(error) === "23505") throw new ServiceError("CONFLICT", "A patient with this medical record number already exists in this organization.");
    throw error;
  }
}
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error) return String(error.code);
  return "cause" in error ? errorCode(error.cause) : undefined;
}
export async function editOrganizationUser(db: Database, actor: Principal, organizationId: string, membershipId: string, input: UpdateOrganizationUser, context: RequestContext) {
  return db.transaction(async tx => {
    // Match membership activation's lock order to serialize concurrent admin changes.
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("no key update");
    const [target] = await tx.select({ membership: organizationMemberships, user: users }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.id, membershipId))).for("update");
    if (!target) throw new ServiceError("NOT_FOUND", "User membership not found.");
    if (target.user.platformRole === "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "Platform administrators must be managed separately.");
    const prior = await tx.select({ facilityId: facilityMemberships.facilityId }).from(facilityMemberships).where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, membershipId)));
    const accessChanged = input.role !== target.membership.role || prior.length !== input.facilityIds.length || prior.some(item => !input.facilityIds.includes(item.facilityId));
    if (membershipId === actor.membershipId && accessChanged) throw new ServiceError("CONFLICT", "You cannot change your own role or facility access.");
    if (actor.platformRole !== "NIQ_ADMIN") {
      const assigned = await tx.select({ facilityId: facilityMemberships.facilityId }).from(facilityMemberships).where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, actor.membershipId)));
      if (assigned.length && (!prior.length || !input.facilityIds.length || [...prior.map(item => item.facilityId), ...input.facilityIds].some(id => !assigned.some(item => item.facilityId === id)))) throw new ServiceError("FORBIDDEN", "You can manage users only within your assigned facilities.");
    }
    const selected = input.facilityIds.length ? await tx.select({ id: facilities.id, name: facilities.name }).from(facilities).where(and(eq(facilities.organizationId, organizationId), inArray(facilities.id, input.facilityIds))) : [];
    if (selected.length !== input.facilityIds.length) throw new ServiceError("NOT_FOUND", "One or more facilities were not found.");
    if (target.membership.role === "ORGANIZATION_ADMIN" && target.membership.isActive && target.user.status === "ACTIVE" && input.role !== "ORGANIZATION_ADMIN") {
      const remaining = await tx.select({ id: organizationMemberships.id }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(and(eq(organizationMemberships.organizationId, organizationId), ne(organizationMemberships.id, membershipId), eq(organizationMemberships.role, "ORGANIZATION_ADMIN"), eq(organizationMemberships.isActive, true), eq(users.status, "ACTIVE")));
      if (!remaining.length) throw new ServiceError("CONFLICT", "Keep at least one enabled organization administrator.");
    }
    await tx.update(users).set({ displayName: input.displayName, updatedAt: new Date() }).where(eq(users.id, target.user.id));
    await tx.update(organizationMemberships).set({ role: input.role, updatedAt: new Date() }).where(eq(organizationMemberships.id, membershipId));
    if (accessChanged) {
      await tx.delete(facilityMemberships).where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, membershipId)));
      if (input.facilityIds.length) await tx.insert(facilityMemberships).values(input.facilityIds.map(facilityId => ({ id: createEntityId(), organizationId, organizationMembershipId: membershipId, facilityId })));
      // A promotion cannot inherit a session authenticated without administrator MFA.
      await tx.update(authSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(authSessions.organizationId, organizationId), eq(authSessions.membershipId, membershipId), isNull(authSessions.revokedAt)));
    }
    await audit(tx, actor, organizationId, context, "USER_PROFILE_UPDATED", "membership", membershipId, Object.keys(input));
    return { membershipId, userId: target.user.id, email: target.user.email, displayName: input.displayName, status: target.user.status, role: input.role, active: target.membership.isActive, createdAt: target.membership.createdAt, facilities: selected };
  });
}
