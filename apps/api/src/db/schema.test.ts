import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  assessmentAnswers,
  assessments,
  auditEvents,
  authSessions,
  invitations,
  invitationFacilities,
  measurements,
  patients,
  questionnaireDefinitions,
  scoringRequests,
  scoringResults,
  mfaChallenges,
} from "./schema";

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.map((key) => key.getName());
}

describe("tenant data invariants", () => {
  test("assessment ownership is constrained through organization-scoped foreign keys", () => {
    expect(foreignKeyNames(assessments)).toContain("assessments_org_patient_fk");
    expect(foreignKeyNames(assessments)).toContain("assessments_org_facility_fk");
    expect(foreignKeyNames(assessments)).toContain("assessments_questionnaire_scope_fk");
    expect(foreignKeyNames(assessmentAnswers)).toContain("assessment_answers_org_assessment_fk");
    expect(foreignKeyNames(measurements)).toContain("measurements_org_assessment_fk");
    expect(foreignKeyNames(scoringRequests)).toContain("scoring_requests_org_assessment_fk");
    expect(foreignKeyNames(scoringResults)).toContain("scoring_results_org_assessment_fk");
    expect(foreignKeyNames(auditEvents)).toContain("audit_events_org_assessment_fk");
  });

  test("patient reference has no plaintext column and requires encrypted lookup material", () => {
    const columns = patients;
    expect("externalReference" in columns).toBe(false);
    expect(columns.encryptedExternalReference.notNull).toBe(true);
    expect(columns.externalReferenceLookupHash.notNull).toBe(true);
  });

  test("assessment derives questionnaire version from one immutable definition", () => {
    expect("questionnaireVersion" in assessments).toBe(false);
    expect(questionnaireDefinitions.scopeKey.notNull).toBe(true);
  });

  test("pending invitations have one organization-scoped reservation index", () => {
    const names = getTableConfig(invitations).indexes.map((index) => index.config.name);
    expect(names).toContain("invitations_pending_org_email_uidx");
  });

  test("entity IDs are application-generated canonical ULIDs", () => {
    const id = getTableConfig(patients).columns.find((column) => column.name === "id");
    expect(id?.getSQLType()).toBe("varchar(26)");
    expect(id?.hasDefault).toBe(false);
    expect(getTableConfig(patients).checks.map((constraint) => constraint.name)).toContain("patients_id_ulid_ck");
  });

  test("session and MFA identities are tied to the same tenant membership and user", () => {
    expect(foreignKeyNames(authSessions)).toContain("auth_sessions_org_membership_user_fk");
    expect(foreignKeyNames(mfaChallenges)).toContain("mfa_challenges_org_membership_user_fk");
    expect(foreignKeyNames(invitationFacilities)).toContain("invitation_facilities_org_facility_fk");
  });
});

describe("migration-only safeguards", () => {
  test("initial migration enforces seat limits and append-only audit storage", async () => {
    const migration = await Bun.file("./drizzle/0000_initial.sql").text();
    expect(migration).toContain("enforce_organization_user_limit");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("invitations_user_limit_trigger");
    expect(migration).toContain("audit_events_append_only_trigger");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC");
    expect(migration).toContain('"id" varchar(26) PRIMARY KEY NOT NULL');
    expect(migration).not.toContain("gen_random_uuid()");
  });

  test("authentication migration keeps only hashes and creates tenant-safe foreign keys", async () => {
    const migration = await Bun.file("./drizzle/0001_auth_foundation.sql").text();
    expect(migration).toContain('"token_hash" text NOT NULL');
    expect(migration).toContain('"otp_hash" text NOT NULL');
    expect(migration).not.toContain('"token" text');
    expect(migration).not.toContain('"otp" text');
    expect(migration.indexOf("organization_memberships_org_id_user_uidx")).toBeLessThan(migration.indexOf("auth_sessions_org_membership_user_fk"));
  });
});
