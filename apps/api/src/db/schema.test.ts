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
  scoringConnections,
  mfaChallenges,
  organizationEntitlements,
  organizationBrandAssets,
  organizations,
} from "./schema";

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.map((key) => key.getName());
}

describe("tenant data invariants", () => {
  test("organization color defaults follow the canonical branding palette", () => {
    expect(organizations.primaryColor.default).toBe("#0E9384");
    expect(organizations.secondaryColor.default).toBe("#175CD3");
  });

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

  test("patient serials are tenant-scoped and retain their issued prefix", () => {
    expect(organizations.patientReferencePrefix.notNull).toBe(true);
    expect(organizations.nextPatientSerial.default).toBe(1);
    expect(patients.referencePrefix.notNull).toBe(true);
    expect(patients.serialNumber.notNull).toBe(true);
    expect(getTableConfig(patients).indexes.map((index) => index.config.name)).toContain("patients_org_serial_uidx");
  });

  test("patient demographics use gender terminology", () => {
    expect(patients.gender.notNull).toBe(true);
    expect("sex" in patients).toBe(false);
  });

  test("assessment derives questionnaire version from one immutable definition", () => {
    expect("questionnaireVersion" in assessments).toBe(false);
    expect(questionnaireDefinitions.scopeKey.notNull).toBe(true);
  });

  test("pending invitations have one organization-scoped reservation index", () => {
    const names = getTableConfig(invitations).indexes.map((index) => index.config.name);
    expect(names).toContain("invitations_pending_org_email_uidx");
    expect(invitations.platformRole.notNull).toBe(true);
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

  test("organization onboarding stores only the Application-owned user entitlement", () => {
    expect("deploymentMode" in organizations).toBe(false);
    expect("scoringEnabled" in organizations).toBe(false);
    expect("faceScanEnabled" in organizations).toBe(false);
    expect("scoringMonthlyLimit" in organizationEntitlements).toBe(false);
    expect("faceScanMonthlyLimit" in organizationEntitlements).toBe(false);
    expect(organizationEntitlements.userLimit).toBeDefined();
  });

  test("organization logos are tenant-bound binary assets", () => {
    expect(organizationBrandAssets.content.notNull).toBe(true);
    expect(organizationBrandAssets.organizationId.notNull).toBe(true);
    expect(organizationBrandAssets.byteSize.notNull).toBe(true);
  });

  test("scoring credentials are stored only as encrypted bytes", () => {
    expect(scoringConnections.scoringOrganizationId.notNull).toBe(true);
    expect(scoringConnections.encryptedCredential.notNull).toBe(true);
    expect(scoringConnections.credentialIv.notNull).toBe(true);
    expect("credential" in scoringConnections).toBe(false);
  });
});

describe("migration-only safeguards", () => {
  test("patient references allocate an independent serial inside each organization", async () => {
    const migration = await Bun.file("./drizzle/0009_blushing_champions.sql").text();
    expect(migration).toContain("PARTITION BY \"organization_id\"");
    expect(migration).toContain("next_patient_serial = next_patient_serial + 1");
    expect(migration).toContain("patients_allocate_serial_trigger");
  });

  test("gender migration preserves existing patient values", async () => {
    const migration = await Bun.file("./drizzle/0010_fine_sinister_six.sql").text();
    expect(migration).toContain('ALTER TYPE "public"."patient_sex" RENAME TO "patient_gender"');
    expect(migration).toContain('RENAME COLUMN "sex" TO "gender"');
    expect(migration).not.toContain("DROP COLUMN");
  });

  test("branding defaults migrate to teal primary and blue secondary", async () => {
    const migration = await Bun.file("./drizzle/0011_lowly_shooting_star.sql").text();
    expect(migration).toContain('"primary_color" SET DEFAULT \'#0E9384\'');
    expect(migration).toContain('"secondary_color" SET DEFAULT \'#175CD3\'');
  });

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

  test("initial migration creates composite unique keys before dependent foreign keys", async () => {
    const migration = await Bun.file("./drizzle/0000_initial.sql").text();
    const dependencies = [
      ["assessments_org_id_uidx", "assessment_answers_org_assessment_fk"],
      ["organization_memberships_org_id_uidx", "assessment_answers_org_answerer_fk"],
      ["patients_org_id_uidx", "assessments_org_patient_fk"],
      ["facilities_org_id_uidx", "assessments_org_facility_fk"],
      ["questionnaire_definitions_scope_id_uidx", "assessments_questionnaire_scope_fk"],
      ["face_scan_sessions_org_id_uidx", "measurements_org_face_scan_fk"],
      ["scoring_requests_org_id_uidx", "scoring_results_org_request_fk"],
    ] as const;

    for (const [uniqueIndex, foreignKey] of dependencies) {
      expect(migration.indexOf(uniqueIndex)).toBeGreaterThan(-1);
      expect(migration.indexOf(uniqueIndex)).toBeLessThan(migration.indexOf(foreignKey));
    }
  });

  test("authentication migration keeps only hashes and creates tenant-safe foreign keys", async () => {
    const migration = await Bun.file("./drizzle/0001_auth_foundation.sql").text();
    expect(migration).toContain('"token_hash" text NOT NULL');
    expect(migration).toContain('"otp_hash" text NOT NULL');
    expect(migration).not.toContain('"token" text');
    expect(migration).not.toContain('"otp" text');
    expect(migration.indexOf("organization_memberships_org_id_user_uidx")).toBeLessThan(migration.indexOf("auth_sessions_org_membership_user_fk"));
  });

  test("MFA resend migration persists only counters and timestamps", async () => {
    const migration = await Bun.file("./drizzle/0002_spooky_ben_urich.sql").text();
    expect(migration).toContain('"resend_count" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migration).not.toContain("otp");
  });

  test("Scoring-owned configuration is removed from Application storage", async () => {
    const migration = await Bun.file("./drizzle/0007_remove_scoring_configuration.sql").text();
    expect(migration).toContain('DROP COLUMN "deployment_mode"');
    expect(migration).toContain('DROP COLUMN "scoring_monthly_limit"');
  });

  test("scoring connection migration never creates a plaintext credential column", async () => {
    const migration = await Bun.file("./drizzle/0004_high_the_professor.sql").text();
    expect(migration).toContain('"encrypted_credential" "bytea" NOT NULL');
    expect(migration).toContain('"credential_iv" "bytea" NOT NULL');
    expect(migration).not.toContain('\n\t"credential" ');
  });

  test("scoring organization mapping migration stores a required ULID", async () => {
    const migration = await Bun.file("./drizzle/0005_tense_wild_pack.sql").text();
    expect(migration).toContain('"scoring_organization_id" varchar(26) NOT NULL');
    expect(migration).toContain("scoring_connections_scoring_org_id_ulid_ck");
  });

  test("organization logo migration limits and tenant-binds stored image data", async () => {
    const migration = await Bun.file("./drizzle/0006_shiny_blonde_phantom.sql").text();
    expect(migration).toContain('CREATE TABLE "organization_brand_assets"');
    expect(migration).toContain('"byte_size" <= 2097152');
    expect(migration).toContain('CREATE UNIQUE INDEX "organization_brand_assets_org_uidx"');
    expect(migration).toContain("ON DELETE cascade");
  });

  test("platform administrator invitations default safely to regular users", async () => {
    const migration = await Bun.file("./drizzle/0008_fantastic_shockwave.sql").text();
    expect(migration).toContain('"platform_role" "platform_role" DEFAULT \'USER\' NOT NULL');
  });
});
