import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { encryptPatientData, patientDataKey } from "../security/patient-data";
import type { Principal } from "./application";
import { PostgresApplicationService } from "./postgres-application";

// Temporary tables keep the integration test isolated from application data.
describe.skipIf(process.env.PATIENT_PAGE_TEST !== "1")("patient page against PostgreSQL", () => {
  const config = { SESSION_SECRET: "patient-page-test-secret" } as ApplicationConfig;
  const client = process.env.PATIENT_PAGE_TEST_SOCKET
    ? postgres({ host: process.env.PATIENT_PAGE_TEST_SOCKET, port: 55443, database: "postgres", max: 1, prepare: false })
    : postgres(process.env.PATIENT_PAGE_DATABASE_URL ?? "postgres://localhost/postgres", { max: 1, prepare: false });
  const service = new PostgresApplicationService(drizzle(client), config, { deliver: async () => {} });
  const actor: Principal = { userId: "user", organizationId: "org", membershipId: "member", email: "a@example.test", displayName: "A", role: "ORGANIZATION_ADMIN", platformRole: "USER" };
  const options = { page: 1, pageSize: 2, facility: "all", gender: "all" as const, sort: "assessment-newest" as const, query: "", registered: "all" as const };

  beforeAll(async () => {
    await client`create temporary table facility_memberships (organization_id text, organization_membership_id text, facility_id text)`;
    await client`create temporary table facilities (id text, organization_id text, name text)`;
    await client`create temporary table patients (id text, organization_id text, home_facility_id text, reference_prefix text, serial_number int, date_of_birth date, gender text, encrypted_profile bytea, encrypted_external_reference bytea, is_archived boolean, created_at timestamptz, updated_at timestamptz)`;
    await client`create temporary table assessments (id text, organization_id text, patient_id text, facility_id text, status text, current_owner_membership_id text, created_by_membership_id text, clinical_review jsonb, created_at timestamptz)`;
    await client`insert into facilities values ('f1','org','Central'),('f2','org','North')`;
    await client`insert into facility_memberships values ('org','member','f1')`;
    const key = patientDataKey(undefined, config.SESSION_SECRET);
    const mrn = encryptPatientData("MRN", key);
    for (const [id, facility, serial, name, gender, created] of [
      ["p1", "f1", 1, "Alpha Patient", "FEMALE", "2026-09-01"],
      ["p2", "f1", 2, "Beta Patient", "MALE", "2026-09-02"],
      ["p3", "f1", 3, "Gamma Patient", "FEMALE", "2026-09-03"],
      ["p4", "f2", 4, "Hidden Patient", "FEMALE", "2026-09-04"],
    ] as const) {
      const profile = encryptPatientData(JSON.stringify({ name }), key);
      await client`insert into patients values (${id}, 'org', ${facility}, 'PAT', ${serial}, null, ${gender}, ${profile}, ${mrn}, false, ${created}::timestamptz, ${created}::timestamptz)`;
    }
    await client`insert into assessments values
      ('a1','org','p1','f1','COMPLETED',null,'member',null,'2026-09-05T00:00:00Z'),
      ('a2','org','p1','f1','COMPLETED',null,'member',null,'2026-09-07T00:00:00Z'),
      ('a3','org','p2','f1','COMPLETED',null,'member',null,'2026-09-06T00:00:00Z'),
      ('a4','org','p4','f2','COMPLETED',null,'member',null,'2026-09-09T00:00:00Z')`;
  });
  afterAll(async () => { await client.end(); });

  test("pages after sorting by aggregated latest assessment and keeps scoped totals", async () => {
    const first = await service.listPatientPage(actor, "org", options);
    expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(first.items.map(item => item.id)).toEqual(["p1", "p2"]);
    expect(first.items[0]?.lastAssessmentAt?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    const second = await service.listPatientPage(actor, "org", { ...options, page: 2 });
    expect(second.items.map(item => item.id)).toEqual(["p3"]);
    expect(second.items[0]?.lastAssessmentAt).toBeNull();
  });

  test("filters name, facility, gender, and registration order before paging", async () => {
    expect((await service.listPatientPage(actor, "org", { ...options, query: "beta" })).items.map(item => item.id)).toEqual(["p2"]);
    expect((await service.listPatientPage(actor, "org", { ...options, gender: "Female" })).total).toBe(2);
    expect((await service.listPatientPage(actor, "org", { ...options, facility: "f2" })).total).toBe(0);
    expect((await service.listPatientPage(actor, "org", { ...options, sort: "registered-oldest" })).items.map(item => item.id)).toEqual(["p1", "p2"]);
    expect((await service.listPatientPage(actor, "org", { ...options, sort: "assessment-oldest" })).items.map(item => item.id)).toEqual(["p2", "p1"]);
  });
});
