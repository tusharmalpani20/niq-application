import { expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { membershipRoles } from "@niq/application-contracts";
import type { Database } from "../db/client";
import { facilityMemberships, invitations, organizationEntitlements, organizationMemberships, organizations, scoringConnections, users } from "../db/schema";
import type { Principal } from "./application";
import { PostgresApplicationService } from "./postgres-application";
import { AssessmentWorkflowService } from "./assessment-workflow";

const actor: Principal = { userId: "user", membershipId: "member", organizationId: "org", email: "person@example.test", displayName: "Person", role: "DOCTOR", platformRole: "USER" };
const config = { SESSION_SECRET: "test-secret-that-is-at-least-32-characters" } as ApplicationConfig;

for (const role of membershipRoles) test(`invitation acceptance preserves ${role} and facility access`, async () => {
  const writes: { table: unknown; values: any }[] = [];
  const replies = [
    [{ id: "invite", organizationId: "org", email: actor.email, role, platformRole: "USER", expiresAt: new Date(Date.now() + 60_000) }],
    [],
    [{ facilityId: "assigned-facility" }],
  ];
  const tx = {
    select() {
      const rows = replies.shift();
      const chain = { from: () => chain, where: () => chain, for: () => chain, limit: async () => rows, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
      return chain;
    },
    insert: (table: unknown) => ({ values: async (values: any) => { writes.push({ table, values }); } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
  const db = { transaction: async (run: any) => run(tx) } as unknown as Database;
  const service = new PostgresApplicationService(db, config, { deliver: async () => {} });
  const principal = await service.acceptInvitation({ token: "invitation-token", displayName: "Person", password: "test-password-for-fixture" }, { requestId: "audit" });
  expect(principal.role).toBe(role);
  expect(writes.find(w => w.table === organizationMemberships)?.values.role).toBe(role);
  expect(writes.find(w => w.table === facilityMemberships)?.values[0]).toMatchObject({ organizationId: "org", organizationMembershipId: principal.membershipId, facilityId: "assigned-facility" });
  expect(writes.find(w => w.table === users)?.values.mfaEnabled).toBe(role === "ORGANIZATION_ADMIN");
});

for (const role of ["DOCTOR", "NUTRITIONIST", "OTHER_MEDICAL", "SUPPORT"] as const) test(`${role} cannot administer users or facilities`, async () => {
  // No database mock: a missing permission must fail before persistence is touched.
  const service = new PostgresApplicationService({} as Database, config, { deliver: async () => {} });
  await expect(service.listUsers({ ...actor, role }, "org")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(service.setUserActive({ ...actor, role }, "org", "other", false, { requestId: "audit" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(service.createFacility({ ...actor, role }, "org", {} as any, { requestId: "audit" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("organization details hide invitations and scoring connections from support", async () => {
  const queried: unknown[] = [];
  const records = new Map<unknown, unknown[]>([
    [organizations, [{ id: "org", displayName: "Example" }]],
    [organizationEntitlements, [{ userLimit: 10, effectiveFrom: new Date() }]],
    [invitations, [{ id: "invite", email: "invitee@example.test", role: "DOCTOR", status: "PENDING", expiresAt: new Date() }]],
    [scoringConnections, [{ deploymentId: "deployment", scoringOrganizationId: "scoring-org", keyVersion: "v1", activatedAt: new Date() }]],
  ]);
  const db = {
    select: () => ({ from(table: unknown) {
      queried.push(table);
      const rows = records.get(table) ?? [];
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: async () => rows,
        then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      };
      return query;
    } }),
  } as unknown as Database;
  const service = new PostgresApplicationService(db, config, { deliver: async () => {} });
  const support = await service.getOrganization({ ...actor, role: "SUPPORT" }, "org");
  expect(support.invitations).toEqual([]);
  expect(support.scoringConnection).toBeNull();
  expect(queried).not.toContain(invitations);
  expect(queried).not.toContain(scoringConnections);
  const admin = await service.getOrganization({ ...actor, role: "ORGANIZATION_ADMIN" }, "org");
  expect(admin.invitations).toHaveLength(1);
  expect(admin.scoringConnection?.deploymentId).toBe("deployment");
});

test("support cannot read facility clinical performance", async () => {
  const service = new PostgresApplicationService({} as Database, config, { deliver: async () => {} });
  await expect(service.getFacilityPerformance({ ...actor, role: "SUPPORT" }, "org", "facility")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("facility performance rejects a different organization before querying", async () => {
  const service = new PostgresApplicationService({} as Database, config, { deliver: async () => {} });
  await expect(service.getFacilityPerformance({ ...actor, role: "ORGANIZATION_ADMIN" }, "other-org", "facility")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("clinical gate rejects support, cross-tenant and platform actors for every clinical operation", () => {
  const check = AssessmentWorkflowService.prototype.clinicalActor;
  for (const permission of ["assessments.read", "assessments.create", "assessments.edit", "assessments.submit", "scans.perform", "reports.manage", "scores.review"] as const) {
    for (const role of ["DOCTOR", "NUTRITIONIST", "OTHER_MEDICAL"] as const) expect(() => check({ ...actor, role }, "org", permission)).not.toThrow();
    const adminCheck = () => check({ ...actor, role: "ORGANIZATION_ADMIN" }, "org", permission);
    if (permission === "assessments.create" || permission === "scores.review") expect(adminCheck).toThrow();
    else expect(adminCheck).not.toThrow();
    expect(() => check({ ...actor, role: "SUPPORT" }, "org", permission)).toThrow();
    expect(() => check(actor, "other-org", permission)).toThrow();
    expect(() => check({ ...actor, platformRole: "NIQ_ADMIN" }, "org", permission)).toThrow();
  }
});

test("organization admins cannot initialize or retry creating an assessment", async () => {
  // Both entry points must reject before consulting patient records or the database.
  const workflow = new AssessmentWorkflowService({ db: {} as Database, applicationService: {} as any, config });
  const admin = { ...actor, role: "ORGANIZATION_ADMIN" as const };
  await expect(workflow.initialize(admin, "org", { patientId: "patient", requestKey: "request" }, { requestId: "audit" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(workflow.retryInitialization(admin, "org", "initialization", { requestId: "audit" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
