import { describe, expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "../db/client";
import { keyedHash } from "../security/tokens";
import { PostgresApplicationService } from "./postgres-application";
import type { Principal } from "./application";

const actor: Principal = { userId: "admin", membershipId: "membership", organizationId: "tenant", email: "admin@example.com", displayName: "Admin", role: "ORGANIZATION_ADMIN", platformRole: "USER" };
const config = { SESSION_SECRET: "test-secret", INVITATION_TTL_HOURS: 72 } as ApplicationConfig;
const context = { requestId: "test" };

function fixture({ status = "PENDING", missing = false, conflict = false, assigned = [] as string[], targets = [] as string[] } = {}) {
  const writes: Record<string, any>[] = [];
  const audits: Record<string, any>[] = [];
  const writePredicates: { sql: string; params: unknown[] }[] = [];
  const predicates: { sql: string; params: unknown[] }[] = [];
  let transactions = 0;
  let selects = 0;
  const invite = { id: "invite", email: "colleague@example.com", status, expiresAt: new Date(0), tokenHash: "old-hash" };
  const queues = [missing ? [] : [invite], assigned.map((facilityId) => ({ facilityId })), ...(assigned.length ? [targets.map((facilityId) => ({ facilityId }))] : []), conflict ? [{ id: "existing" }] : [], []];
  const tx = {
    select() {
      const rows = queues[selects++] ?? [];
      const chain = {
        from: () => chain,
        where: (predicate: any) => { predicates.push(new PgDialect().sqlToQuery(predicate)); return chain; },
        for: () => chain,
        limit: async () => rows,
        then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      };
      return chain;
    },
    update: () => ({ set: (data: Record<string, any>) => {
      writes.push(data);
      return { where: (predicate: any) => { writePredicates.push(new PgDialect().sqlToQuery(predicate)); return { returning: async () => [{ id: invite.id, email: invite.email, expiresAt: data.expiresAt }] }; } };
    } }),
    insert: () => ({ values: async (data: Record<string, any>) => { audits.push(data); } }),
  };
  const db = { transaction: async (run: any) => { transactions++; return run(tx); } } as unknown as Database;
  return { service: new PostgresApplicationService(db, config, { deliver: async () => {} }), writes, audits, predicates, writePredicates, get transactions() { return transactions; } };
}

describe("tenant invitation lifecycle", () => {
  test("rejects non-admin and cross-organization actors before database access", async () => {
    const f = fixture();
    await expect(f.service.manageUserInvitation({ ...actor, role: "OTHER_MEDICAL" }, "tenant", "invite", "regenerate", context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.service.manageUserInvitation(actor, "other", "invite", "revoke", context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.transactions).toBe(0);
  });
  test("scopes invitation lookup to organization and tenant role", async () => {
    const f = fixture({ missing: true });
    await expect(f.service.manageUserInvitation(actor, "tenant", "invite", "revoke", context)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.predicates[0]?.params).toEqual(["invite", "tenant", "USER"]);
    expect(f.writes).toHaveLength(0);
  });
  for (const status of ["ACCEPTED", "REVOKED"]) test(`does not revive ${status} invitations`, async () => {
    const f = fixture({ status });
    await expect(f.service.manageUserInvitation(actor, "tenant", "invite", "regenerate", context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.writes).toHaveLength(0);
  });
  for (const targets of [[], ["elsewhere"], ["allowed", "elsewhere"]]) test(`restricted admins cannot manage invitations outside their facilities: ${targets.join(",") || "all"}`, async () => {
    const f = fixture({ assigned: ["allowed"], targets });
    await expect(f.service.manageUserInvitation(actor, "tenant", "invite", "revoke", context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.writes).toHaveLength(0);
  });
  test("restricted admins may revoke within their own facility", async () => {
    const f = fixture({ assigned: ["allowed"], targets: ["allowed"] });
    await f.service.manageUserInvitation(actor, "tenant", "invite", "revoke", context);
    expect(f.writes[0]?.status).toBe("REVOKED");
    expect(f.audits[0]?.action).toBe("USER_INVITATION_REVOKED");
  });
  for (const status of ["PENDING", "EXPIRED"]) test(`rotates token and renews expiry for ${status}`, async () => {
    const f = fixture({ status });
    const before = Date.now();
    const result = await f.service.manageUserInvitation(actor, "tenant", "invite", "regenerate", context);
    const renewed = f.writes.at(-1)!;
    expect(renewed.status).toBe("PENDING");
    expect(f.writePredicates[0]?.params).toEqual(["tenant", "colleague@example.com", "invite", "PENDING"]);
    expect(renewed.tokenHash).toBe(await keyedHash(result.token!, config.SESSION_SECRET));
    expect(renewed.tokenHash).not.toBe("old-hash");
    expect(renewed.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 72 * 3_600_000);
    expect(f.audits[0]?.action).toBe("USER_INVITATION_REGENERATED");
    expect(JSON.stringify(f.audits)).not.toContain(result.token!);
  });
  test("does not regenerate for an email which already has an account", async () => {
    const f = fixture({ conflict: true });
    await expect(f.service.manageUserInvitation(actor, "tenant", "invite", "regenerate", context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.writes).toHaveLength(0);
  });
  test("cannot disable own membership", async () => {
    const f = fixture();
    await expect(f.service.setUserActive(actor, "tenant", actor.membershipId, false, context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.transactions).toBe(0);
  });
});

describe("tenant administrator access safeguards", () => {
  function accessFixture(remaining: number) {
    let selects = 0;
    const writes: unknown[] = [];
    const locks: string[] = [];
    const tx = {
      select() {
        const rows = [[], [{ id: "target", role: "ORGANIZATION_ADMIN", isActive: true }], Array.from({ length: remaining }, () => ({ id: "other-admin" }))][selects++] ?? [];
        const chain = {
          from: () => chain, innerJoin: () => chain, where: () => chain,
          for: (lock: string) => { locks.push(lock); return chain; }, limit: async () => rows,
          then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
        };
        return chain;
      },
      update: () => ({ set: (data: unknown) => { writes.push(data); return { where: () => ({ returning: async () => [{ id: "target", isActive: false }] }) }; } }),
      insert: () => ({ values: async () => {} }),
    };
    const db = { transaction: async (run: any) => run(tx) } as unknown as Database;
    return { service: new PostgresApplicationService(db, config, { deliver: async () => {} }), writes, locks };
  }
  test("does not disable the last enabled administrator", async () => {
    const f = accessFixture(0);
    await expect(f.service.setUserActive(actor, "tenant", "target", false, context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.locks).toEqual(["no key update"]);
    expect(f.writes).toHaveLength(0);
  });
  test("disables access and revokes sessions when another administrator remains", async () => {
    const f = accessFixture(1);
    await f.service.setUserActive(actor, "tenant", "target", false, context);
    expect(f.writes[0]).toMatchObject({ isActive: false });
    expect(f.writes[1]).toHaveProperty("revokedAt");
  });
});
