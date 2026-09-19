import { describe, expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "../db/client";
import { keyedHash } from "../security/tokens";
import { PostgresApplicationService } from "./postgres-application";
import type { Principal } from "./application";

const actor: Principal = { userId: "admin", membershipId: "membership", organizationId: "niq", email: "admin@example.com", displayName: "Admin", role: "ORGANIZATION_ADMIN", platformRole: "NIQ_ADMIN" };
const config = { SESSION_SECRET: "test-secret", INVITATION_TTL_HOURS: 72 } as ApplicationConfig;
const context = { requestId: "test" };

// Record SQL predicates and writes without touching the development database.
function fixture(status = "PENDING", missing = false, conflict = false) {
  const writes: Record<string, any>[] = [];
  const audits: Record<string, any>[] = [];
  const predicates: { sql: string; params: unknown[] }[] = [];
  const locks: string[] = [];
  let selects = 0;
  let transactions = 0;
  const invite = { id: "invite", email: "colleague@example.com", status, expiresAt: new Date(0), tokenHash: "old-hash" };
  const tx = {
    select() {
      const rows = selects++ === 0 ? (missing ? [] : [invite]) : (conflict ? [{ id: "existing" }] : []);
      const chain = {
        from: () => chain,
        where: (predicate: any) => { predicates.push(new PgDialect().sqlToQuery(predicate)); return chain; },
        for: (lock: string) => { locks.push(lock); return chain; },
        limit: async () => rows,
      };
      return chain;
    },
    update: () => ({ set: (data: Record<string, any>) => {
      writes.push(data);
      return { where: () => ({ returning: async () => [{ invitationId: invite.id, email: invite.email, expiresAt: data.expiresAt }] }) };
    } }),
    insert: () => ({ values: async (data: Record<string, any>) => { audits.push(data); } }),
  };
  const db = { transaction: async (run: any) => { transactions++; return run(tx); } } as unknown as Database;
  return { service: new PostgresApplicationService(db, config, { deliver: async () => {} }), writes, audits, predicates, locks, get transactions() { return transactions; } };
}

describe("platform invitation lifecycle", () => {
  test("requires NIQ administrator authority before accessing the database", async () => {
    const f = fixture();
    const member = { ...actor, platformRole: "USER" as const };
    await expect(f.service.revokePlatformAdministratorInvitation(member, "invite", context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.service.regeneratePlatformAdministratorInvitation(member, "invite", context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.transactions).toBe(0);
  });
  test("locks and scopes invitations by ID, organization, and platform role", async () => {
    const f = fixture("PENDING", true);
    await expect(f.service.revokePlatformAdministratorInvitation(actor, "invite", context)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.predicates[0]?.params).toEqual(["invite", "niq", "NIQ_ADMIN"]);
    expect(f.predicates[0]?.sql).toContain('"invitations"."organization_id"');
    expect(f.predicates[0]?.sql).toContain('"invitations"."platform_role"');
    expect(f.locks).toEqual(["update"]);
    expect(f.writes).toHaveLength(0);
  });
  for (const status of ["ACCEPTED", "REVOKED"]) {
    test(`cannot revoke or revive ${status.toLowerCase()} invitations`, async () => {
      for (const operation of ["revokePlatformAdministratorInvitation", "regeneratePlatformAdministratorInvitation"] as const) {
        const f = fixture(status);
        await expect(f.service[operation](actor, "invite", context)).rejects.toMatchObject({ code: "CONFLICT" });
        expect(f.writes).toHaveLength(0);
      }
    });
  }
  test("revocation disables the pending link and records the actor", async () => {
    const f = fixture();
    await f.service.revokePlatformAdministratorInvitation(actor, "invite", context);
    expect(f.writes[0]?.status).toBe("REVOKED");
    expect(f.audits[0]).toMatchObject({ action: "PLATFORM_ADMIN_INVITATION_REVOKED", actorMembershipId: actor.membershipId });
  });
  for (const status of ["PENDING", "EXPIRED"]) {
    test(`regenerates ${status.toLowerCase()} invitations with a new hashed token and expiry`, async () => {
      const f = fixture(status);
      const before = Date.now();
      const result = await f.service.regeneratePlatformAdministratorInvitation(actor, "invite", context);
      expect(f.writes[0]?.tokenHash).toBe(await keyedHash(result.token, config.SESSION_SECRET));
      expect(f.writes[0]?.tokenHash).not.toBe("old-hash");
      expect(f.writes[0]?.status).toBe("PENDING");
      expect(f.writes[0]?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 72 * 3_600_000);
      expect(f.audits[0]?.action).toBe("PLATFORM_ADMIN_INVITATION_REGENERATED");
      expect(JSON.stringify(f.audits)).not.toContain(result.token);
    });
  }
  test("does not revive an old invitation when the email has an account or another invitation", async () => {
    const f = fixture("EXPIRED", false, true);
    await expect(f.service.regeneratePlatformAdministratorInvitation(actor, "invite", context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.writes).toHaveLength(0);
  });
});
