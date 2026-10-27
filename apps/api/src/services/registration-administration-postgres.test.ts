import { afterAll, describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { createEntityId } from "@niq/application-domain";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "../db/schema";
import { PostgresApplicationService } from "./postgres-application";
import type { Principal } from "./application";

const testDatabaseUrl = process.env.AUDIT_TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const url = new URL(testDatabaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.port !== "55439" || url.pathname !== "/fixture_app" || url.search || url.hash
  ) {
    throw new Error("AUDIT_TEST_DATABASE_URL must use loopback port 55439 and the disposable fixture_app database.");
  }
}

// Only use a migrated disposable database; delivery stays in memory.
describe.skipIf(!testDatabaseUrl)("registration and account database acceptance", () => {
  const client = postgres(testDatabaseUrl!, { max: 12 });
  const db = drizzle(client);
  const config = loadApplicationConfig({ DATABASE_URL: testDatabaseUrl, SESSION_SECRET: "isolated-registration-audit-secret-at-least-32-characters" });
  const delivered: Array<{ email: string; otp: string }> = [];
  const service = new PostgresApplicationService(db, config, { deliver: async item => { delivered.push(item); } });
  const context = { requestId: "isolated-registration-acceptance" };
  afterAll(async () => { await client.end(); });
  async function organization(userLimit?: number) {
    const organizationId = createEntityId(), userId = createEntityId(), membershipId = createEntityId(), facilityId = createEntityId();
    const actor: Principal = { organizationId, userId, membershipId, role: "ORGANIZATION_ADMIN", platformRole: "USER", email: `${userId}@example.test`, displayName: "Synthetic administrator" };
    await db.insert(t.organizations).values({ id: organizationId, legalName: "Isolated acceptance", displayName: "Isolated acceptance", slug: `acceptance-${organizationId.toLowerCase()}` });
    await db.insert(t.users).values({ id: userId, email: actor.email, displayName: actor.displayName, status: "ACTIVE" });
    await db.insert(t.organizationMemberships).values({ id: membershipId, organizationId, userId, role: actor.role });
    await db.insert(t.facilities).values({ id: facilityId, organizationId, name: "Synthetic facility", code: "TEST" });
    if (userLimit !== undefined) await db.insert(t.organizationEntitlements).values({ id: createEntityId(), organizationId, userLimit, changedByMembershipId: membershipId, reason: "Isolated seat acceptance" });
    return { actor, organizationId, facilityId };
  }
  const patient = (homeFacilityId: string, medicalRecordNumber: string) => ({ homeFacilityId, medicalRecordNumber, name: "Synthetic registration patient", dateOfBirth: "2000-01-01", gender: "UNKNOWN" as const, phone: "9012345678" });
  const invite = (f: Awaited<ReturnType<typeof organization>>, email: string) => service.inviteUser(f.actor, f.organizationId, { email, role: "DOCTOR", facilityIds: [f.facilityId] }, context);
  test("patient demographics are encrypted, reference reopens, and normalized duplicates are rejected", async () => {
    const f = await organization();
    const saved = await service.createPatient(f.actor, f.organizationId, patient(f.facilityId, " Mrn-Same "), context);
    expect(saved.reference).toBe("PAT-1");
    expect((await service.getPatient(f.actor, f.organizationId, saved.reference)).displayName).toBe("Synthetic registration patient");
    const [raw] = await db.select().from(t.patients).where(eq(t.patients.id, saved.id));
    expect(Buffer.from(raw!.encryptedProfile).toString()).not.toContain("Synthetic registration patient");
    expect(Buffer.from(raw!.encryptedExternalReference).toString()).not.toContain("MRN-SAME");
    await expect(service.createPatient(f.actor, f.organizationId, patient(f.facilityId, "mrn-same"), context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(t.patients).where(eq(t.patients.organizationId, f.organizationId))).toHaveLength(1);
    expect(await db.select().from(t.auditEvents).where(and(eq(t.auditEvents.organizationId, f.organizationId), eq(t.auditEvents.action, "PATIENT_CREATED")))).toHaveLength(1);
  });
  test("eight simultaneous duplicate registrations save one patient and one audit event", async () => {
    const f = await organization();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.createPatient(f.actor, f.organizationId, patient(f.facilityId, "SAME-CONCURRENT"), context)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.filter(r => r.status === "rejected");
    expect(failed).toHaveLength(7);
    for (const result of failed) expect(result.reason).toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(t.patients).where(eq(t.patients.organizationId, f.organizationId))).toHaveLength(1);
    expect(await db.select().from(t.auditEvents).where(and(eq(t.auditEvents.organizationId, f.organizationId), eq(t.auditEvents.action, "PATIENT_CREATED")))).toHaveLength(1);
  });
  test("distinct concurrent registrations get unique references and another organization can reuse the MRN", async () => {
    const f = await organization(), other = await organization();
    const saved = await Promise.all(Array.from({ length: 8 }, (_, i) => service.createPatient(f.actor, f.organizationId, patient(f.facilityId, `DISTINCT-${i}`), context)));
    expect(new Set(saved.map(row => row.reference)).size).toBe(8);
    expect(saved.map(row => Number(row.reference.split("-")[1])).sort((a,b) => a-b)).toEqual([1,2,3,4,5,6,7,8]);
    expect((await service.createPatient(other.actor, other.organizationId, patient(other.facilityId, "DISTINCT-0"), context)).reference).toBe("PAT-1");
  });
  test("audit failure rolls back the patient, audit row, and reference allocation", async () => {
    const f = await organization(), requestId = `reject-patient-audit-${createEntityId()}`;
    await client`create function isolated_reject_patient_audit() returns trigger language plpgsql as $$ begin if NEW.request_id like 'reject-patient-audit-%' then raise exception 'isolated audit rejection'; end if; return NEW; end $$`;
    await client`create trigger isolated_reject_patient_audit before insert on audit_events for each row execute function isolated_reject_patient_audit()`;
    try {
      await expect(service.createPatient(f.actor, f.organizationId, patient(f.facilityId, "ROLLBACK"), { requestId })).rejects.toThrow();
      expect(await db.select().from(t.patients).where(eq(t.patients.organizationId, f.organizationId))).toHaveLength(0);
      expect(await db.select().from(t.auditEvents).where(eq(t.auditEvents.requestId, requestId))).toHaveLength(0);
      expect((await db.select().from(t.organizations).where(eq(t.organizations.id, f.organizationId)))[0]!.nextPatientSerial).toBe(1);
    } finally { await client`drop trigger isolated_reject_patient_audit on audit_events`; await client`drop function isolated_reject_patient_audit()`; }
  });
  test("invitation activates once, preserves facility access, signs in and signs out its stored session", async () => {
    const f = await organization(), pending = await invite(f, `${createEntityId()}@example.test`);
    const input = { token: pending.token, displayName: "Synthetic invited doctor", password: "isolated-long-password-for-test" };
    const results = await Promise.allSettled([service.acceptInvitation(input, context), service.acceptInvitation(input, context)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "INVALID_OR_EXPIRED_TOKEN" });
    const accepted = results.find(r => r.status === "fulfilled");
    if (accepted?.status !== "fulfilled") throw new Error("Expected activation");
    expect(await db.select().from(t.facilityMemberships).where(eq(t.facilityMemberships.organizationMembershipId, accepted.value.membershipId))).toHaveLength(1);
    const login = await service.signIn({ email: accepted.value.email, password: input.password }, context);
    const session = login.kind === "authenticated" ? login.session : await service.verifyMfa({ challengeToken: login.challengeToken, otp: [...delivered].reverse().find(item => item.email === accepted.value.email)!.otp }, context);
    expect(await service.authenticate(session.token)).toMatchObject({ membershipId: accepted.value.membershipId });
    await service.signOut(session.token, context);
    expect(await service.authenticate(session.token)).toBeNull();
    expect((await db.select().from(t.authSessions).where(eq(t.authSessions.membershipId, accepted.value.membershipId)))[0]!.revokedAt).toBeInstanceOf(Date);
  });
  test("an invited administrator signs in with password followed by a one-use OTP", async () => {
    const f = await organization();
    const pending = await service.inviteUser(f.actor, f.organizationId, { email: `${createEntityId()}@example.test`, role: "ORGANIZATION_ADMIN", facilityIds: [f.facilityId] }, context);
    const password = "isolated-administrator-password";
    const principal = await service.acceptInvitation({ token: pending.token, displayName: "Synthetic invited administrator", password }, context);
    const login = await service.signIn({ email: principal.email, password }, context);
    expect(login.kind).toBe("mfa_required");
    if (login.kind !== "mfa_required") throw new Error("Administrator requires OTP");
    const deliveredOtp = [...delivered].reverse().find(item => item.email === principal.email)!;
    expect(deliveredOtp.otp).toMatch(/^\d{6}$/);
    const session = await service.verifyMfa({ challengeToken: login.challengeToken, otp: deliveredOtp.otp }, context);
    expect(await service.authenticate(session.token)).toMatchObject({ membershipId: principal.membershipId, role: "ORGANIZATION_ADMIN" });
    await expect(service.verifyMfa({ challengeToken: login.challengeToken, otp: deliveredOtp.otp }, context)).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_TOKEN" });
    await service.signOut(session.token, context);
    expect(await service.authenticate(session.token)).toBeNull();
  });
  test("expired and revoked links cannot activate or partially create an account", async () => {
    const f = await organization();
    for (const status of ["EXPIRED", "REVOKED"] as const) {
      const pending = await invite(f, `${createEntityId()}@example.test`);
      await db.update(t.invitations).set(status === "EXPIRED" ? { expiresAt: new Date(0) } : { status }).where(eq(t.invitations.id, pending.invitation!.id));
      await expect(service.acceptInvitation({ token: pending.token, displayName: "Must not be saved", password: "isolated-long-password-for-test" }, context)).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_TOKEN" });
      expect(await db.select().from(t.users).where(eq(t.users.email, pending.invitation!.email))).toHaveLength(0);
      expect(await db.select().from(t.auditEvents).where(and(eq(t.auditEvents.resourceId, pending.invitation!.id), eq(t.auditEvents.action, "INVITATION_ACCEPTED")))).toHaveLength(0);
    }
  });
  test("eight invitations competing for the final seat admit one request and activation keeps the limit", async () => {
    const f = await organization(2);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => invite(f, `${createEntityId()}@example.test`)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    for (const failed of results.filter(r => r.status === "rejected")) expect(failed.reason).toMatchObject({ code: "USER_LIMIT_REACHED" });
    expect(await db.select().from(t.invitations).where(eq(t.invitations.organizationId, f.organizationId))).toHaveLength(1);
    expect(await db.select().from(t.auditEvents).where(and(eq(t.auditEvents.organizationId, f.organizationId), eq(t.auditEvents.action, "USER_INVITED")))).toHaveLength(1);
    const winner = results.find(r => r.status === "fulfilled");
    if (winner?.status !== "fulfilled") throw new Error("Expected reservation");
    await service.acceptInvitation({ token: winner.value.token, displayName: "Final seat", password: "isolated-long-password-for-test" }, context);
    await expect(invite(f, `${createEntityId()}@example.test`)).rejects.toMatchObject({ code: "USER_LIMIT_REACHED" });
    expect(await db.select().from(t.organizationMemberships).where(eq(t.organizationMemberships.organizationId, f.organizationId))).toHaveLength(2);
  });
});
