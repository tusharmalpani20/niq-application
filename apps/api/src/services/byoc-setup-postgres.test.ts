import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ByocSetupService } from "./byoc-setup";
import { PostgresApplicationService } from "./postgres-application";

const url = process.env.BYOC_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== "/fixture_byoc" || parsed.username !== "fixture_user" || parsed.search || parsed.hash) throw Error("Use isolated fixture_byoc on loopback:55440");
}
describe.skipIf(!url)("BYOC first hospital administrator", () => {
  const sql = postgres(url ?? "postgres://fixture_user@127.0.0.1:55440/fixture_byoc", { max: 4, onnotice: () => {} });
  const db = drizzle(sql);
  const token = "isolated-byoc-setup-token-at-least-32-characters";
  const config = loadApplicationConfig({ DATABASE_URL: url ?? "postgres://fixture_user@127.0.0.1:55440/fixture_byoc", SESSION_SECRET: "isolated-byoc-session-secret-at-least-32-characters", DEPLOYMENT_MODE: "client-cloud", AUTH_MODE: "local", BYOC_SETUP_TOKEN: token, BYOC_SETUP_EXPIRES_AT: new Date(Date.now()+3600_000).toISOString() });
  const input = { organizationName: "Synthetic hospital", organizationSlug: "synthetic-hospital", adminName: "Hospital administrator", adminEmail: "hospital@example.test", adminPassword: "strong-isolated-password" };
  beforeEach(async () => {
    // This suite accepts only the dedicated, throwaway fixture endpoint above.
    await sql`drop trigger if exists fail_byoc_audit on audit_events`;
    await sql`drop function if exists fail_byoc_audit()`;
    await sql`truncate table byoc_installation_setups, organizations, users cascade`;
  });
  afterAll(() => sql.end());
  test("rejects missing/wrong token and expired setup without creating users", async () => {
    const setup = new ByocSetupService(db, config);
    await expect(setup.complete("wrong", input, "bad-token")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const expired = new ByocSetupService(db, { ...config, BYOC_SETUP_EXPIRES_AT: new Date(0).toISOString() });
    await expect(expired.complete(token, input, "expired")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await sql`select count(*)::int n from users`)[0]!.n).toBe(0);
  });
  test("creates exactly one hospital admin under simultaneous setup, then stays closed after token rotation", async () => {
    const setup = new ByocSetupService(db, config);
    const results = await Promise.allSettled([setup.complete(token,input,"first"),setup.complete(token,{...input,adminEmail:"second@example.test"},"second")]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const rejected=results.find(r=>r.status==="rejected");
    expect(rejected?.status==="rejected" && rejected.reason).toMatchObject({code:"CONFLICT"});
    const [user] = await sql`select email,platform_role,mfa_enabled,password_hash from users`;
    expect(user!.platform_role).toBe("USER"); expect(user!.mfa_enabled).toBe(true);
    expect(user!.password_hash).not.toContain(input.adminPassword);
    expect(Array.from(await sql`select role from organization_memberships`)).toEqual([{role:"ORGANIZATION_ADMIN"}]);
    expect((await sql`select count(*)::int n from audit_events where action='BYOC_HOSPITAL_SETUP_COMPLETED'`)[0]!.n).toBe(1);
    expect((await setup.status(token)).state).toBe("completed");
    const rotated = new ByocSetupService(db,{...config,BYOC_SETUP_TOKEN:token+"-rotated"});
    await expect(rotated.complete(token+"-rotated",input,"repeat")).rejects.toMatchObject({code:"CONFLICT"});
    const application = new PostgresApplicationService(db, config, {deliver:async()=>{}});
    await expect(application.signIn({email:user!.email as string,password:input.adminPassword},{requestId:"login"})).resolves.toMatchObject({kind:"mfa_required"});
  });
  test("audit failure rolls back the organization, account, entitlement and completion marker together", async () => {
    await sql`create function fail_byoc_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$`;
    await sql`create trigger fail_byoc_audit before insert on audit_events for each row execute function fail_byoc_audit()`;
    try {
      await expect(new ByocSetupService(db, config).complete(token,input,"rollback")).rejects.toBeDefined();
      for (const table of ["organizations","users","organization_memberships","organization_entitlements","audit_events","byoc_installation_setups"]) {
        const result = await sql.unsafe(`select count(*)::int n from ${table}`);
        expect(result[0]!.n).toBe(0);
      }
    } finally {
      await sql`drop trigger fail_byoc_audit on audit_events`;
      await sql`drop function fail_byoc_audit()`;
    }
    await expect(new ByocSetupService(db,config).complete(token,input,"retry-after-rollback")).resolves.toMatchObject({signInRequired:true});
  });
  test("pre-existing organization blocks first setup even without a completion marker", async () => {
    await sql`insert into organizations(id,legal_name,display_name,slug) values ('01ARZ3NDEKTSV4RRFFQ69G5FAV','Existing fixture','Existing fixture','existing-fixture')`;
    await expect(new ByocSetupService(db,config).complete(token,input,"existing-organization")).rejects.toMatchObject({code:"CONFLICT"});
    expect((await sql`select count(*)::int n from users`)[0]!.n).toBe(0);
    expect((await sql`select count(*)::int n from byoc_installation_setups`)[0]!.n).toBe(0);
  });
  test("pre-existing user blocks first setup even without an organization", async () => {
    await sql`insert into users(id,email,display_name,status,platform_role) values ('01ARZ3NDEKTSV4RRFFQ69G5FAV','existing@example.test','Existing fixture','ACTIVE','USER')`;
    await expect(new ByocSetupService(db,config).complete(token,input,"existing-user")).rejects.toMatchObject({code:"CONFLICT"});
    expect((await sql`select count(*)::int n from organizations`)[0]!.n).toBe(0);
  });
  test("caller cannot supply platform privileges, roles or entitlements", async () => {
    const setup = new ByocSetupService(db,config);
    for (const extra of [{platformRole:"NIQ_ADMIN"},{role:"NIQ_ADMIN"},{userLimit:99999}]) {
      await expect(setup.complete(token,{...input,...extra},"forbidden-extra")).rejects.toMatchObject({code:"VALIDATION_ERROR"});
    }
    expect((await sql`select count(*)::int n from users`)[0]!.n).toBe(0);
  });
  test("non-BYOC and missing or expired setup configuration remain closed", async () => {
    for (const change of [{DEPLOYMENT_MODE:"niq-hosted" as const},{BYOC_SETUP_TOKEN:undefined},{BYOC_SETUP_EXPIRES_AT:undefined},{BYOC_SETUP_EXPIRES_AT:new Date(0).toISOString()}]) {
      const setup = new ByocSetupService(db,{...config,...change});
      await expect(setup.status(token)).rejects.toMatchObject({code:"FORBIDDEN"});
      await expect(setup.complete(token,input,"disabled")).rejects.toMatchObject({code:"FORBIDDEN"});
    }
    expect((await sql`select count(*)::int n from users`)[0]!.n).toBe(0);
  });
  test("production configuration reports OTP delivery blocked without relaxing MFA", async () => {
    const setup = new ByocSetupService(db,{...config,NODE_ENV:"production",DEV_OTP_DELIVERY:false,DEV_FIXED_OTP:false});
    expect((await setup.status(token)).otpDeliveryConfigured).toBe(false);
    await setup.complete(token,input,"production-first-admin");
    expect((await sql`select mfa_enabled,platform_role from users`)[0]).toMatchObject({mfa_enabled:true,platform_role:"USER"});
    expect((await sql`select count(*)::int n from auth_sessions`)[0]!.n).toBe(0);
  });

});
