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
  ) throw new Error("AUDIT_TEST_DATABASE_URL must use loopback port 55439 and the disposable fixture_app database.");
}

// Real table constraints and service transactions, without any external delivery.
describe.skipIf(!testDatabaseUrl)("cross-organization administration PostgreSQL", () => {
  const client = postgres(testDatabaseUrl ?? "postgres://fixture_user@127.0.0.1:55439/fixture_app", { max: 4 });
  const db = drizzle(client);
  const config = loadApplicationConfig({ DATABASE_URL: testDatabaseUrl ?? "postgres://fixture_user@127.0.0.1:55439/fixture_app", SESSION_SECRET: "isolated-cross-organization-test-secret-at-least-32-characters" });
  const service = new PostgresApplicationService(db, config, { deliver: async () => {} });
  afterAll(async () => { await client.end(); });
  const context = () => ({ requestId: `cross-organization-test-${createEntityId()}` });
  async function organization() {
    const organizationId = createEntityId(), userId = createEntityId(), membershipId = createEntityId(), facilityId = createEntityId();
    const admin: Principal = { organizationId, userId, membershipId, role: "ORGANIZATION_ADMIN", platformRole: "USER", email: `${userId}@example.test`, displayName: "Synthetic organization administrator" };
    await db.insert(t.organizations).values({ id: organizationId, legalName: "Cross-organization fixture", displayName: "Cross-organization fixture", slug: `cross-${organizationId.toLowerCase()}` });
    await db.insert(t.users).values({ id: userId, email: admin.email, displayName: admin.displayName, status: "ACTIVE" });
    await db.insert(t.organizationMemberships).values({ id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN" });
    await db.insert(t.facilities).values({ id: facilityId, organizationId, name: "Original facility", code: "ORIGINAL" });
    return { organizationId, admin, facilityId };
  }
  async function fixture() {
    const home = await organization(), target = await organization();
    const userId = createEntityId(), membershipId = createEntityId();
    const platform: Principal = { ...home.admin, userId, membershipId, email: `${userId}@example.test`, displayName: "Synthetic NIQ administrator", platformRole: "NIQ_ADMIN" };
    await db.insert(t.users).values({ id: userId, email: platform.email, displayName: platform.displayName, status: "ACTIVE", platformRole: "NIQ_ADMIN" });
    await db.insert(t.organizationMemberships).values({ id: membershipId, organizationId: home.organizationId, userId, role: "ORGANIZATION_ADMIN" });
    return { home, target, platform };
  }
  async function audit(requestId: string) {
    const rows = await db.select().from(t.auditEvents).where(eq(t.auditEvents.requestId, requestId));
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }
  async function platformAttribution(f: Awaited<ReturnType<typeof fixture>>, requestId: string, action: string, resourceId: string) {
    expect(await audit(requestId)).toMatchObject({ organizationId: f.target.organizationId, action, resourceId, actorType: "NIQ_ADMIN", actorMembershipId: null, metadata: { actorUserId: f.platform.userId } });
    expect(await db.select().from(t.organizationMemberships).where(and(eq(t.organizationMemberships.organizationId, f.target.organizationId), eq(t.organizationMemberships.userId, f.platform.userId)))).toHaveLength(0);
  }
  test("NIQ administrator creates a target facility with true global actor attribution", async () => {
    const f = await fixture(), c = context();
    const saved = await service.createFacility(f.platform, f.target.organizationId, { name: "Created across organizations", code: "CROSS", timezone: "UTC" }, c);
    expect(saved).toMatchObject({ organizationId: f.target.organizationId, name: "Created across organizations", code: "CROSS" });
    expect((await db.select().from(t.facilities).where(eq(t.facilities.id, saved!.id)))[0]).toMatchObject({ name: "Created across organizations" });
    await platformAttribution(f, c.requestId, "FACILITY_CREATED", saved!.id);
  });
  test("NIQ administrator edits the target facility and saves the matching audit atomically", async () => {
    const f = await fixture(), c = context();
    await service.updateFacility(f.platform, f.target.organizationId, f.target.facilityId, { name: "Edited across organizations", status: "INACTIVE" }, c);
    expect((await db.select().from(t.facilities).where(eq(t.facilities.id, f.target.facilityId)))[0]).toMatchObject({ name: "Edited across organizations", status: "INACTIVE" });
    await platformAttribution(f, c.requestId, "FACILITY_UPDATED", f.target.facilityId);
  });
  test("NIQ administrator invites target staff without forging a target organization membership", async () => {
    const f = await fixture(), c = context();
    const saved = await service.inviteUser(f.platform, f.target.organizationId, { email: `${createEntityId()}@example.test`, role: "DOCTOR", facilityIds: [f.target.facilityId] }, c);
    const [row] = await db.select().from(t.invitations).where(eq(t.invitations.id, saved.invitation!.id));
    expect(row).toMatchObject({ organizationId: f.target.organizationId, role: "DOCTOR", invitedByMembershipId: null });
    expect(await db.select().from(t.invitationFacilities).where(eq(t.invitationFacilities.invitationId, row!.id))).toMatchObject([{ organizationId: f.target.organizationId, facilityId: f.target.facilityId }]);
    await platformAttribution(f, c.requestId, "USER_INVITED", row!.id);
  });
  for (const action of ["regenerate", "revoke"] as const) test(`NIQ administrator can ${action} a target staff invitation with true actor attribution`, async () => {
    const f = await fixture();
    const pending = await service.inviteUser(f.target.admin, f.target.organizationId, { email: `${createEntityId()}@example.test`, role: "DOCTOR", facilityIds: [f.target.facilityId] }, context());
    const c = context();
    await service.manageUserInvitation(f.platform, f.target.organizationId, pending.invitation!.id, action, c);
    const [row] = await db.select().from(t.invitations).where(eq(t.invitations.id, pending.invitation!.id));
    if (action === "regenerate") { expect(row!.status).toBe("PENDING"); expect(row!.tokenHash).not.toBe(pending.invitation!.tokenHash); }
    else expect(row!.status).toBe("REVOKED");
    await platformAttribution(f, c.requestId, action === "regenerate" ? "USER_INVITATION_REGENERATED" : "USER_INVITATION_REVOKED", row!.id);
  });
  test("same-organization administrator operations preserve native membership attribution", async () => {
    const f = await fixture();
    for (const actor of [f.target.admin, f.platform]) {
      const org = actor.organizationId, c = context();
      const saved = await service.createFacility(actor, org, { name: "Native facility", code: createEntityId(), timezone: "UTC" }, c);
      expect(await audit(c.requestId)).toMatchObject({ organizationId: org, actorType: "USER", actorMembershipId: actor.membershipId, resourceId: saved!.id });
      const inviteContext = context();
      const pending = await service.inviteUser(actor, org, { email: `${createEntityId()}@example.test`, role: "DOCTOR", facilityIds: [saved!.id] }, inviteContext);
      expect(pending.invitation!.invitedByMembershipId).toBe(actor.membershipId);
      expect(await audit(inviteContext.requestId)).toMatchObject({ organizationId: org, actorType: "USER", actorMembershipId: actor.membershipId });
    }
  });
  test("ordinary organization administrators cannot write across organizations or leave partial records", async () => {
    const f = await fixture(), c = context();
    await expect(service.createFacility(f.home.admin, f.target.organizationId, { name: "Forbidden", code: "DENIED", timezone: "UTC" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.updateFacility(f.home.admin, f.target.organizationId, f.target.facilityId, { name: "Forbidden" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.inviteUser(f.home.admin, f.target.organizationId, { email: `${createEntityId()}@example.test`, role: "DOCTOR", facilityIds: [f.target.facilityId] }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(t.facilities).where(eq(t.facilities.organizationId, f.target.organizationId))).toMatchObject([{ name: "Original facility" }]);
    expect(await db.select().from(t.invitations).where(eq(t.invitations.organizationId, f.target.organizationId))).toHaveLength(0);
    expect(await db.select().from(t.auditEvents).where(eq(t.auditEvents.requestId, c.requestId))).toHaveLength(0);
  });
  test("a facility outside the invitation target is rejected without invitation, assignment or audit writes", async () => {
    const f = await fixture(), c = context();
    await expect(service.inviteUser(f.platform, f.target.organizationId, { email: `${createEntityId()}@example.test`, role: "DOCTOR", facilityIds: [f.home.facilityId] }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(t.invitations).where(eq(t.invitations.organizationId, f.target.organizationId))).toHaveLength(0);
    expect(await db.select().from(t.invitationFacilities).where(eq(t.invitationFacilities.organizationId, f.target.organizationId))).toHaveLength(0);
    expect(await db.select().from(t.auditEvents).where(eq(t.auditEvents.requestId, c.requestId))).toHaveLength(0);
    expect(await db.select().from(t.organizationMemberships).where(and(eq(t.organizationMemberships.organizationId, f.target.organizationId), eq(t.organizationMemberships.userId, f.platform.userId)))).toHaveLength(0);
  });
  test("a target audit failure rolls back the cross-organization facility update", async () => {
    const f = await fixture(), c = { requestId: `reject-crossorg-audit-${createEntityId()}` };
    await client`create function isolated_reject_crossorg_audit() returns trigger language plpgsql as $$ begin if NEW.request_id like 'reject-crossorg-audit-%' then raise exception 'isolated cross-organization audit failure'; end if; return NEW; end $$`;
    await client`create trigger isolated_reject_crossorg_audit before insert on audit_events for each row execute function isolated_reject_crossorg_audit()`;
    try {
      await expect(service.updateFacility(f.platform, f.target.organizationId, f.target.facilityId, { name: "Must roll back" }, c)).rejects.toMatchObject({ cause: { message: "isolated cross-organization audit failure" } });
      expect((await db.select().from(t.facilities).where(eq(t.facilities.id, f.target.facilityId)))[0]!.name).toBe("Original facility");
      expect(await db.select().from(t.auditEvents).where(eq(t.auditEvents.requestId, c.requestId))).toHaveLength(0);
    } finally { await client`drop trigger isolated_reject_crossorg_audit on audit_events`; await client`drop function isolated_reject_crossorg_audit()`; }
  });
});
