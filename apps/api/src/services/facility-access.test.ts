import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PostgresApplicationService } from "./postgres-application";
import type { Principal } from "./application";
import { encryptPatientData, patientDataKey } from "../security/patient-data";

// Run with FACILITY_TEST_SOCKET pointing to an isolated PostgreSQL Unix socket.
// All fixtures are temporary tables and disappear when the connection closes.
describe.skipIf(!process.env.FACILITY_TEST_SOCKET)("facility access against PostgreSQL", () => {
  const client = postgres({ host: process.env.FACILITY_TEST_SOCKET, port: 55439, database: "postgres", max: 1, prepare: false });
  const config = { SESSION_SECRET: "facility-test-secret", PATIENT_DATA_KEY_VERSION: "v1" } as ApplicationConfig;
  const service = new PostgresApplicationService(drizzle(client), config, { deliver: async () => {} });
  const actor: Principal = { userId: "user", membershipId: "restricted", organizationId: "org", email: "test@example.com", displayName: "Test", role: "OTHER_MEDICAL", platformRole: "USER" };
  beforeAll(async () => {
    await client`create temporary table facility_memberships (organization_id text, organization_membership_id text, facility_id text)`;
    await client`create temporary table facilities (id text, organization_id text, name text, code text, timezone text default 'UTC', status text default 'ACTIVE', created_at timestamptz default now(), updated_at timestamptz default now())`;
    await client`create temporary table patients (id text, organization_id text, home_facility_id text, reference_prefix text, serial_number int, date_of_birth date, gender text, encrypted_profile bytea, encrypted_external_reference bytea, is_archived boolean default false, created_at timestamptz default now(), updated_at timestamptz default now())`;
    await client`create temporary table assessments (id text, organization_id text, patient_id text, facility_id text, serial_number serial, status text default 'DRAFT', completed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now())`;
    await client`insert into facilities (id, organization_id, name, code) values ('a','org','A','A'), ('b','org','B','B'), ('c','other','C','C')`;
    await client`insert into facility_memberships values ('org','restricted','a'), ('org','multi','a'), ('org','multi','b'), ('org','inactive','b')`;
    const encrypted = encryptPatientData(JSON.stringify({ name: "Fixture" }), patientDataKey(undefined, config.SESSION_SECRET));
    await client`insert into patients (id, organization_id, home_facility_id, reference_prefix, serial_number, date_of_birth, gender, encrypted_profile) values
      ('patient-a','org','a','PAT',1,'2000-01-01','UNKNOWN',${encrypted}),
      ('patient-b','org','b','PAT',2,'2000-01-01','UNKNOWN',${encrypted}),
      ('patient-c','other','c','PAT',1,'2000-01-01','UNKNOWN',${encrypted}),
      ('unassigned','org',null,'PAT',3,'2000-01-01','UNKNOWN',${encrypted})`;
    const mrn = encryptPatientData("TEST-MRN", patientDataKey(undefined, config.SESSION_SECRET));
    await client`update patients set encrypted_external_reference = ${mrn}`;
    await client`insert into assessments (id, organization_id, patient_id, facility_id) values
      ('assessment-a','org','patient-a','a'),
      ('assessment-b','org','patient-b','b'),
      ('assessment-c','other','patient-c','c'),
      ('assessment-unassigned','org','unassigned',null)`;
  });
  afterAll(async () => { await client.end(); });
  test("filters patient and facility lists to the assigned facility", async () => {
    expect((await service.listPatients(actor, "org")).map((row) => row.id)).toEqual(["patient-a"]);
    expect((await service.listFacilities(actor, "org")).map((row) => row.id)).toEqual(["a"]);
  });
  test("blocks direct IDs and references outside the assignment", async () => {
    expect((await service.getPatient(actor, "org", "PAT-1")).id).toBe("patient-a");
    await expect(service.getPatient(actor, "org", "patient-b")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getPatient(actor, "org", "PAT-2")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getPatient(actor, "other", "patient-c")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  test("rejects registration at an unassigned facility before inserting", async () => {
    await expect(service.createPatient(actor, "org", { medicalRecordNumber: "TEST", name: "Fixture", homeFacilityId: "b", dateOfBirth: "2000-01-01", gender: "UNKNOWN", phone: "9012345678" }, { requestId: "test" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [count] = await client`select count(*)::int as total from patients`;
    expect(count?.total).toBe(4);
  });
  test("supports multiple assignments and explicit all-facility membership", async () => {
    expect((await service.listPatients({ ...actor, membershipId: "multi" }, "org")).map((row) => row.id).sort()).toEqual(["patient-a", "patient-b"]);
    expect((await service.listPatients({ ...actor, membershipId: "all" }, "org")).map((row) => row.id).sort()).toEqual(["patient-a", "patient-b", "unassigned"]);
  });
  test("filters assessment lists to assigned facilities", async () => {
    expect((await service.listAssessments(actor, "org")).map((row) => row.id)).toEqual(["assessment-a"]);
    expect((await service.listAssessments({ ...actor, membershipId: "multi" }, "org")).map((row) => row.id).sort()).toEqual(["assessment-a", "assessment-b"]);
    expect((await service.listAssessments({ ...actor, membershipId: "all" }, "org")).map((row) => row.id).sort()).toEqual(["assessment-a", "assessment-b", "assessment-unassigned"]);
  });
  test("does not exempt assigned organization admins or widen access for inactive facilities", async () => {
    expect((await service.listPatients({ ...actor, role: "ORGANIZATION_ADMIN" }, "org")).map((row) => row.id)).toEqual(["patient-a"]);
    await client`update facilities set status = 'INACTIVE' where id = 'b'`;
    expect((await service.listPatients({ ...actor, membershipId: "inactive" }, "org")).map((row) => row.id)).toEqual(["patient-b"]);
  });
  test("reads assignment changes on the next request and prevents broader invitations", async () => {
    const changing = { ...actor, membershipId: "changing" };
    await client`insert into facility_memberships values ('org','changing','a')`;
    expect((await service.listPatients(changing, "org")).map((row) => row.id)).toEqual(["patient-a"]);
    await client`update facility_memberships set facility_id = 'b' where organization_membership_id = 'changing'`;
    expect((await service.listPatients(changing, "org")).map((row) => row.id)).toEqual(["patient-b"]);
    await expect(service.inviteUser({ ...actor, role: "ORGANIZATION_ADMIN" }, "org", { email: "fixture@example.com", role: "OTHER_MEDICAL", facilityIds: [] }, { requestId: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
