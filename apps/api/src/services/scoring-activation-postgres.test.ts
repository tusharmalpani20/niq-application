import { afterAll, describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { createEntityId } from "@niq/application-domain";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "../db/schema";
import { decryptCredential } from "../security/credential-encryption";
import type { Principal } from "./application";
import { PostgresApplicationService } from "./postgres-application";

const url = process.env.SCORING_ACTIVATION_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.hostname !== "127.0.0.1" || parsed.port !== "55441" || parsed.pathname !== "/fixture_activation") throw Error("Use isolated fixture_activation on loopback:55441");
}
describe.skipIf(!url)("durable Scoring activation", () => {
  const fixtureUrl = url ?? "postgres://tm@127.0.0.1:55441/fixture_activation";
  const sql = postgres(fixtureUrl, { max: 5 });
  const db = drizzle(sql);
  const key = Buffer.alloc(32, 9).toString("base64");
  const config = loadApplicationConfig({ DATABASE_URL: fixtureUrl, SESSION_SECRET: "isolated-activation-session-secret-at-least-32-characters", SCORING_API_URL: "https://scoring.example.test/api", SCORING_CREDENTIAL_ENCRYPTION_KEY: key });
  const service = new PostgresApplicationService(db, config, { deliver: async () => {} });
  afterAll(() => sql.end());
  async function fixture() {
    const organizationId = createEntityId(), userId = createEntityId(), membershipId = createEntityId();
    const actor: Principal = { organizationId, userId, membershipId, role: "ORGANIZATION_ADMIN", platformRole: "USER", email: `${userId}@example.test`, displayName: "Synthetic administrator" };
    await db.insert(t.organizations).values({ id: organizationId, legalName: "Activation fixture", displayName: "Activation fixture", slug: `activate-${organizationId.toLowerCase()}` });
    await db.insert(t.users).values({ id: userId, email: actor.email, displayName: actor.displayName, status: "ACTIVE" });
    await db.insert(t.organizationMemberships).values({ id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN" });
    return { organizationId, actor };
  }
  const remote = () => ({ deploymentId: createEntityId(), clientId: createEntityId(), credential: `niq_dep_fixture.${"secret".repeat(8)}` });
  test("failed local audit rolls back credential, retry uses original exchange UUID and records one audit", async () => {
    const f = await fixture(), result = remote(), calls: Array<Record<string, string>> = [];
    const originalFetch = globalThis.fetch;
    const activationToken = `niq_act_${"a".repeat(48)}`;
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => { expect(String(_url)).toBe("https://scoring.example.test/api/v1/activate"); expect(init.redirect).toBe("error"); calls.push(JSON.parse(String(init.body))); return Response.json(result, { status: 201 }); }) as unknown as typeof fetch;
    await sql`create function reject_activation_audit() returns trigger language plpgsql as $$ begin if NEW.request_id='fail-activation-audit' then raise exception 'synthetic activation audit failure'; end if; return NEW; end $$`;
    await sql`create trigger reject_activation_audit before insert on audit_events for each row execute function reject_activation_audit()`;
    try {
      await expect(service.activateScoring(f.actor, f.organizationId, { activationToken }, { requestId: "fail-activation-audit" })).rejects.toThrow();
      expect(await db.select().from(t.scoringConnections).where(eq(t.scoringConnections.organizationId, f.organizationId))).toHaveLength(0);
      await sql`drop trigger reject_activation_audit on audit_events`; await sql`drop function reject_activation_audit()`;
      const recovered = await service.activateScoring(f.actor, f.organizationId, { activationToken }, { requestId: "recover-activation" });
      expect(recovered).toMatchObject({ connection: { deploymentId: result.deploymentId } });
      expect(calls[0]!.activationRequestId!).toMatch(/^[a-f0-9-]{36}$/);
      expect(calls[1]!.activationRequestId!).toBe(calls[0]!.activationRequestId!);
      const [saved] = await db.select().from(t.scoringConnections).where(eq(t.scoringConnections.organizationId, f.organizationId));
      expect(decryptCredential(saved!.encryptedCredential, saved!.credentialIv, key)).toBe(result.credential);
      const [raw] = await sql`select row_to_json(a)::text as body from scoring_activation_attempts a where organization_id=${f.organizationId}`;
      expect(raw!.body).not.toContain(activationToken);
      expect(raw!.body).not.toContain(result.credential);
      await service.activateScoring(f.actor, f.organizationId, { activationToken }, { requestId: "duplicate-save" });
      expect(calls).toHaveLength(2);
      const audits = await db.select().from(t.auditEvents).where(eq(t.auditEvents.organizationId, f.organizationId));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.metadata).not.toHaveProperty("credential");
    } finally {
      globalThis.fetch = originalFetch;
      await sql`drop trigger if exists reject_activation_audit on audit_events`; await sql`drop function if exists reject_activation_audit()`;
    }
  });
  test("disconnect cancels an unfinished first activation before a credential is saved", async () => {
    const f = await fixture(), originalFetch = globalThis.fetch;
    let release!: (response: Response) => void, started!: () => void;
    const gate = new Promise<void>(resolve => { started = resolve; });
    globalThis.fetch = (async () => { started(); return new Promise<Response>(resolve => { release = resolve; }); }) as unknown as typeof fetch;
    try {
      const pending = service.activateScoring(f.actor, f.organizationId, { activationToken: `niq_act_${"d".repeat(48)}` }, { requestId: "first-activation-pending" });
      await gate;
      await service.disconnectScoring(f.actor, f.organizationId, { requestId: "cancel-first-activation" });
      release(Response.json(remote(), { status: 201 }));
      await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.select().from(t.scoringConnections).where(eq(t.scoringConnections.organizationId, f.organizationId))).toHaveLength(0);
    } finally { globalThis.fetch = originalFetch; }
  });
  test("a late response cannot replace a newer token or reconnect after disconnect", async () => {
    const f = await fixture(), originalFetch = globalThis.fetch;
    const slowToken = `niq_act_${"s".repeat(48)}`, fastToken = `niq_act_${"f".repeat(48)}`;
    const fast = remote();
    let release!: (response: Response) => void, started!: () => void;
    let gate = new Promise<void>(resolve => { started = resolve; });
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.activationToken === slowToken) { started(); return new Promise<Response>(resolve => { release = resolve; }); }
      return Response.json(fast, { status: 201 });
    }) as unknown as typeof fetch;
    try {
      const older = service.activateScoring(f.actor, f.organizationId, { activationToken: slowToken }, { requestId: "older-token" });
      await gate;
      await service.activateScoring(f.actor, f.organizationId, { activationToken: fastToken }, { requestId: "newer-token" });
      release(Response.json(remote(), { status: 201 }));
      await expect(older).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await db.select().from(t.scoringConnections).where(eq(t.scoringConnections.organizationId, f.organizationId)))[0]!.deploymentId).toBe(fast.deploymentId);
      gate = new Promise<void>(resolve => { started = resolve; });
      const pending = service.activateScoring(f.actor, f.organizationId, { activationToken: slowToken }, { requestId: "pending-reconnect" });
      await gate;
      await service.disconnectScoring(f.actor, f.organizationId, { requestId: "disconnect-during-activation" });
      release(Response.json(remote(), { status: 201 }));
      await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.select().from(t.scoringConnections).where(eq(t.scoringConnections.organizationId, f.organizationId))).toHaveLength(0);
    } finally { globalThis.fetch = originalFetch; }
  });

});
