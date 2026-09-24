import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { updatePatientSchema, updateOrganizationUserSchema } from "@niq/application-contracts";
import { createEntityId } from "@niq/application-domain";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tables from "../db/schema";
import { PostgresApplicationService } from "./postgres-application";
import type { Principal } from "./application";

const context = { requestId: "profile-edit-test" };
test("edit schemas require mobile, clear optional email and reject invalid dates, roles and duplicate assignments", () => {
  const input = { medicalRecordNumber: "MRN", name: "Patient", homeFacilityId: createEntityId(), dateOfBirth: "2000-01-01", gender: "UNKNOWN", phone: "1234567890", email: null };
  expect(updatePatientSchema.safeParse({ ...input, phone: "" }).success).toBe(false);
  expect(updatePatientSchema.parse(input).email).toBeUndefined();
  expect(updatePatientSchema.safeParse({ ...input, dateOfBirth: "3000-01-01" }).success).toBe(false);
  const id = createEntityId();
  expect(updateOrganizationUserSchema.safeParse({ displayName: "Person", role: "DOCTOR", facilityIds: [id, id] }).success).toBe(false);
  expect(updateOrganizationUserSchema.safeParse({ displayName: "Person", role: "DOCTOR", facilityIds: [], email: "changed@example.com" }).success).toBe(false);
});

describe.skipIf(!process.env.PROFILE_TEST_DATABASE_URL)("profile edits PostgreSQL", () => {
  const client = postgres(process.env.PROFILE_TEST_DATABASE_URL!, { max: 4 });
  const db = drizzle(client);
  const config = loadApplicationConfig({ DATABASE_URL: process.env.PROFILE_TEST_DATABASE_URL ?? "postgres://localhost/unused", SESSION_SECRET: "profile-test-secret-at-least-32-characters" });
  const service = new PostgresApplicationService(db, config, { deliver: async () => {} });
  const org = createEntityId(), org2 = createEntityId(), a = createEntityId(), b = createEntityId(), user = createEntityId(), member = createEntityId(), targetUser = createEntityId(), targetMember = createEntityId();
  const actor: Principal = { userId: user, membershipId: member, organizationId: org, displayName: "Admin", email: `${user}@test.example`, role: "ORGANIZATION_ADMIN", platformRole: "USER" };
  let patientId: string;
  const assessmentId = createEntityId(), definitionId = createEntityId();
  const historicalSnapshot = { patient: { name: "Historical Patient", dateOfBirth: "1999-01-01" } };
  const input = { medicalRecordNumber: `MRN-${org}`, name: "Patient Original", homeFacilityId: a, dateOfBirth: "2000-01-01", gender: "UNKNOWN" as const, phone: "1234567890", email: "patient@example.com" };
  beforeAll(async () => {
    await db.insert(tables.organizations).values([{ id: org, legalName: "Profile Test", displayName: "Profile Test", slug: `profile-${org.toLowerCase()}` }, { id: org2, legalName: "Other", displayName: "Other", slug: `profile-${org2.toLowerCase()}` }]);
    await db.insert(tables.users).values([{ id: user, email: actor.email, displayName: actor.displayName, status: "ACTIVE" }, { id: targetUser, email: `${targetUser}@test.example`, displayName: "Colleague", status: "ACTIVE" }]);
    await db.insert(tables.organizationMemberships).values([{ id: member, organizationId: org, userId: user, role: "ORGANIZATION_ADMIN" }, { id: targetMember, organizationId: org, userId: targetUser, role: "DOCTOR" }]);
    await db.insert(tables.facilities).values([{ id: a, organizationId: org, name: "A", code: "A" }, { id: b, organizationId: org, name: "B", code: "B" }]);
    patientId = (await service.createPatient(actor, org, input, context)).id;
    await db.insert(tables.questionnaireDefinitions).values({ id: definitionId, organizationId: org, scopeKey: org, key: "test", version: "1", schema: {}, checksum: "test" });
    await db.insert(tables.assessments).values({ id: assessmentId, organizationId: org, patientId, facilityId: a, questionnaireDefinitionId: definitionId, questionnaireScopeKey: org, createdByMembershipId: member, workflow: historicalSnapshot });
  });
  afterAll(async () => { await client.end(); });
  test("persists encrypted patient edits and clears optional email, rejects tenant/source/destination violations", async () => {
    const edit = updatePatientSchema.parse({ ...input, name: "Corrected Patient", phone: "9876543210", email: "" });
    const result = await service.updatePatient(actor, org, patientId, edit, context);
    expect((await db.select().from(tables.assessments).where(eq(tables.assessments.id, assessmentId)))[0]!.workflow).toEqual(historicalSnapshot);
    const audit = (await db.select().from(tables.auditEvents).where(eq(tables.auditEvents.resourceId, patientId))).find(item => item.action === "PATIENT_UPDATED");
    expect(JSON.stringify(audit?.metadata)).not.toContain("Corrected Patient");
    expect(result.displayName).toBe("Corrected Patient"); expect(result.phone).toBe("9876543210"); expect(result.email).toBeUndefined();
    const [raw] = await db.select().from(tables.patients).where(eq(tables.patients.id, patientId));
    expect(Buffer.from(raw!.encryptedProfile).toString()).not.toContain("Corrected Patient");
    await expect(service.updatePatient(actor, org2, patientId, edit, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.insert(tables.facilityMemberships).values({ id: createEntityId(), organizationId: org, organizationMembershipId: member, facilityId: b });
    await expect(service.updatePatient(actor, org, patientId, edit, context)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.update(tables.facilityMemberships).set({ facilityId: a }).where(eq(tables.facilityMemberships.organizationMembershipId, member));
    await expect(service.updatePatient(actor, org, patientId, { ...edit, homeFacilityId: b }, context)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.delete(tables.facilityMemberships).where(eq(tables.facilityMemberships.organizationMembershipId, member));
    await db.update(tables.facilities).set({ status: "INACTIVE" }).where(eq(tables.facilities.id, a));
    expect((await service.updatePatient(actor, org, patientId, edit, context)).displayName).toBe("Corrected Patient");
    await service.createPatient(actor, org, { ...input, homeFacilityId: b, medicalRecordNumber: "SECOND" }, context);
    await expect(service.updatePatient(actor, org, patientId, { ...edit, medicalRecordNumber: "SECOND" }, context)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  test("updates role, name and assignments, revokes sessions, and protects self and last administrator", async () => {
    const edit = { displayName: "Edited Colleague", role: "NUTRITIONIST" as const, facilityIds: [b] };
    await expect(service.updateOrganizationUser({ ...actor, role: "DOCTOR" }, org, targetMember, edit, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.updateOrganizationUser(actor, org, member, edit, context)).rejects.toMatchObject({ code: "CONFLICT" });
    await db.insert(tables.authSessions).values({ id: createEntityId(), userId: targetUser, organizationId: org, membershipId: targetMember, tokenHash: `session-${org}`, expiresAt: new Date(Date.now() + 100000) });
    const result = await service.updateOrganizationUser(actor, org, targetMember, edit, context);
    expect(result.role).toBe("NUTRITIONIST"); expect(result.facilities.map(x => x.id)).toEqual([b]);
    expect((await db.select().from(tables.authSessions).where(eq(tables.authSessions.membershipId, targetMember)))[0]!.revokedAt).not.toBeNull();
    await expect(service.updateOrganizationUser({ ...actor, platformRole: "NIQ_ADMIN", membershipId: targetMember }, org, member, edit, context)).rejects.toMatchObject({ code: "CONFLICT" });
    await db.insert(tables.facilityMemberships).values({ id: createEntityId(), organizationId: org, organizationMembershipId: member, facilityId: a });
    await expect(service.updateOrganizationUser(actor, org, targetMember, { ...edit, facilityIds: [a] }, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.delete(tables.facilityMemberships).where(eq(tables.facilityMemberships.organizationMembershipId, member));
    await db.update(tables.users).set({ platformRole: "NIQ_ADMIN" }).where(eq(tables.users.id, targetUser));
    await expect(service.updateOrganizationUser(actor, org, targetMember, edit, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
