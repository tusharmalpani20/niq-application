import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { createApp } from "../app";
import { isDatabaseSchemaReady } from "./client";

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

// Actual readiness SQL and HTTP handler, restricted to an isolated migrated database.
describe.skipIf(!testDatabaseUrl)("database readiness acceptance", () => {
  const client = postgres(testDatabaseUrl!, { max: 1, prepare: false });
  afterAll(async () => { await client.end(); });
  const app = (sql: postgres.Sql) => createApp({ allowedOrigin: "http://localhost:5173", authMode: "disabled", checkDatabase: () => isDatabaseSchemaReady(sql) });
  test("a fully migrated database returns ready", async () => {
    const response = await app(client).request("/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
  test("missing required table returns 503 and rollback restores readiness", async () => {
    await expect(client.begin(async tx => {
      await tx`alter table generated_report_artifacts rename to isolated_missing_artifacts`;
      const response = await app(tx as unknown as postgres.Sql).request("/ready");
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ status: "not_ready" });
      throw new Error("rollback isolated schema change");
    })).rejects.toThrow("rollback isolated schema change");
    expect((await app(client).request("/ready")).status).toBe(200);
  });
  test("missing required column returns 503 and rollback restores readiness", async () => {
    await expect(client.begin(async tx => {
      await tx`alter table generated_reports rename column lease_token to isolated_missing_lease`;
      const response = await app(tx as unknown as postgres.Sql).request("/ready");
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ status: "not_ready" });
      throw new Error("rollback isolated column change");
    })).rejects.toThrow("rollback isolated column change");
    expect((await app(client).request("/ready")).status).toBe(200);
  });
  test("a real refused database connection returns 503", async () => {
    const unavailable = postgres("postgres://127.0.0.1:1/postgres", { max: 1, connect_timeout: 1 });
    try {
      const response = await app(unavailable).request("/ready");
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ status: "not_ready" });
    } finally { await unavailable.end({ timeout: 1 }); }
  });
});
