import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ApplicationConfig } from "@niq/application-config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { encryptPatientData, patientDataKey } from "../security/patient-data";
import type { Principal } from "./application";
import { PostgresApplicationService } from "./postgres-application";

// Uses temporary tables on one connection; opt in with an existing test database.
describe.skipIf(process.env.ASSESSMENT_PAGE_TEST !== "1")("assessment page against PostgreSQL", () => {
  const config = { SESSION_SECRET: "assessment-page-test-secret" } as ApplicationConfig;
  const client = postgres(process.env.DATABASE_URL ?? "postgres://localhost/postgres", { max: 1, prepare: false });
  const service = new PostgresApplicationService(drizzle(client), config, { deliver: async () => {} });
  const actor: Principal = { userId: "user", organizationId: "org", membershipId: "member-a", email: "a@example.test", displayName: "A", role: "OTHER_MEDICAL", platformRole: "USER" };
  const options = { page: 1, pageSize: 2, tab: "assessments" as const, facility: "all", status: "all", risk: "all" as const, query: "" };
  const key = patientDataKey(undefined, config.SESSION_SECRET);
  const seal = (value: unknown) => JSON.stringify({ encrypted: encryptPatientData(JSON.stringify(value), key).toString("base64") });

  beforeAll(async () => {
    await client`create temporary table facility_memberships (organization_id text, organization_membership_id text, facility_id text)`;
    await client`create temporary table facilities (id text, organization_id text, name text)`;
    await client`create temporary table patients (id text, organization_id text, home_facility_id text, reference_prefix text, serial_number int, is_archived boolean, encrypted_profile bytea)`;
    await client`create temporary table assessments (id text, organization_id text, patient_id text, facility_id text, serial_number int, status text, created_by_membership_id text, current_owner_membership_id text, clinical_review jsonb, current_submission_id text, created_at timestamptz, updated_at timestamptz, completed_at timestamptz, final_risk_category text)`;
    await client`create temporary table assessment_priorities (organization_id text, assessment_id text, membership_id text)`;
    await client`insert into facilities values ('f1','org','Central'),('f2','org','North')`;
    await client`insert into facility_memberships values ('org','member-a','f1')`;
    const alpha = encryptPatientData(JSON.stringify({ name: "Alpha Patient" }), key);
    const beta = encryptPatientData(JSON.stringify({ name: "Beta Patient" }), key);
    await client`insert into patients values ('p1','org','f1','PAT',1,false,${alpha}),('p2','org','f1','PAT',2,false,${beta}),('p3','org','f2','PAT',3,false,${alpha})`;
    const high = seal({ finalSnapshot: { score: { risk: { status: "ORIGINAL", classification: { id: "high" } } } } });
    const low = seal({ finalSnapshot: { score: { risk: { status: "ORIGINAL", classification: { id: "low" } } } } });
    const correction = seal({ correctionPerson: { membershipId: "member-a" } });
    await client`insert into assessments (id, organization_id, patient_id, facility_id, serial_number, status, created_by_membership_id, current_owner_membership_id, clinical_review, current_submission_id, created_at, updated_at, completed_at) values
      ('owned','org','p1','f1',1,'DRAFT','member-a','member-a',null,null,'2026-10-04', '2026-10-04',null),
      ('legacy','org','p2','f1',2,'DRAFT','member-b',null,${correction}::jsonb,null,'2026-10-05','2026-10-05',null),
      ('hidden','org','p1','f1',3,'DRAFT','member-b','member-b',null,null,'2026-10-06','2026-10-06',null),
      ('high','org','p2','f1',4,'COMPLETED','member-b',null,${high}::jsonb,null,'2026-10-07','2026-10-07','2026-10-07'),
      ('low','org','p1','f1',5,'COMPLETED','member-b',null,${low}::jsonb,null,'2026-10-08','2026-10-08','2026-10-08'),
      ('other-facility','org','p3','f2',6,'COMPLETED','member-b',null,${high}::jsonb,null,'2026-10-09','2026-10-09','2026-10-09')`;
    await client`insert into assessment_priorities values ('org','owned','member-a')`;
  });
  afterAll(async () => { await client.end(); });

  test("keeps facility and legacy ownership boundaries while paging", async () => {
    const first = await service.listAssessmentPage(actor, "org", options);
    expect(first).toMatchObject({ total: 4, allCount: 4, myWorkCount: 2, completedCount: 2, page: 1, pageSize: 2 });
    expect(first.items.map(item => item.id)).toEqual(["low", "high"]);
    expect(first.items.map(item => item.riskCategory)).toEqual(["low", "high"]);
    const second = await service.listAssessmentPage(actor, "org", { ...options, page: 2, tab: "my-work" });
    expect(second.total).toBe(2);
    expect(second.items).toEqual([]);
    const work = await service.listAssessmentPage(actor, "org", { ...options, tab: "my-work" });
    expect(work.items.map(item => [item.id, item.myAction])).toEqual([["legacy", "CORRECT_DRAFT"], ["owned", "EDIT_DRAFT"]]);
  });

  test("filters encrypted names, risk, status, and personal priorities", async () => {
    const names = await service.listAssessmentPage(actor, "org", { ...options, query: "Beta Patient" });
    expect(names.items.map(item => item.id)).toEqual(["high", "legacy"]);
    expect(names).toMatchObject({ total: 2, allCount: 2, myWorkCount: 1, completedCount: 1 });
    const risk = await service.listAssessmentPage(actor, "org", { ...options, risk: "high" });
    expect(risk).toMatchObject({ total: 1, allCount: 1, myWorkCount: 0, completedCount: 1 });
    expect(risk.items[0]?.id).toBe("high");
    const correction = await service.listAssessmentPage(actor, "org", { ...options, status: "CORRECT_DRAFT" });
    expect(correction.items.map(item => item.id)).toEqual(["legacy"]);
    expect(correction).toMatchObject({ total: 1, allCount: 1, myWorkCount: 2, completedCount: 2 });
    const priority = await service.listAssessmentPage(actor, "org", { ...options, status: "PRIORITY" });
    expect(priority.items.map(item => item.id)).toEqual(["owned"]);
    const myWork = await service.listAssessmentPage(actor, "org", { ...options, tab: "my-work", status: "CORRECT_DRAFT" });
    expect(myWork).toMatchObject({ total: 1, allCount: 4, myWorkCount: 1, completedCount: 2 });
    const completed = await service.listAssessmentPage(actor, "org", { ...options, tab: "completed", status: "DRAFT" });
    expect(completed).toMatchObject({ total: 0, allCount: 4, myWorkCount: 2, completedCount: 0 });
  });
});
