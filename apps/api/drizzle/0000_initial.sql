CREATE TYPE "public"."assessment_status" AS ENUM('DRAFT', 'READY_FOR_SCORING', 'SCORING_PENDING', 'SCORING_UNAVAILABLE', 'SCORED', 'UNDER_REVIEW', 'COMPLETED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."facility_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."measurement_provenance" AS ENUM('AUTO_FACE_SCAN', 'AUTOMATED_MANUAL_FALLBACK');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('ORGANIZATION_ADMIN', 'MEDICAL', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."patient_sex" AS ENUM('FEMALE', 'MALE', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('REQUESTED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."scoring_request_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "assessment_answers" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"question_key" text NOT NULL,
	"answer" jsonb NOT NULL,
	"answered_by_membership_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_answers_id_ulid_ck" CHECK ("assessment_answers"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"patient_id" varchar(26) NOT NULL,
	"facility_id" varchar(26),
	"questionnaire_definition_id" varchar(26) NOT NULL,
	"questionnaire_scope_key" text NOT NULL,
	"status" "assessment_status" DEFAULT 'DRAFT' NOT NULL,
	"assigned_to_membership_id" varchar(26),
	"created_by_membership_id" varchar(26) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_questionnaire_scope_ck" CHECK ("assessments"."questionnaire_scope_key" = 'GLOBAL' OR "assessments"."questionnaire_scope_key" = "assessments"."organization_id"::text),
	CONSTRAINT "assessments_id_ulid_ck" CHECK ("assessments"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"actor_membership_id" varchar(26),
	"assessment_id" varchar(26),
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"ip_address_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_id_ulid_ck" CHECK ("audit_events"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "face_scan_sessions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"provider" text NOT NULL,
	"provider_session_reference" text,
	"status" "scan_status" DEFAULT 'REQUESTED' NOT NULL,
	"failure_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_scan_sessions_id_ulid_ck" CHECK ("face_scan_sessions"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" "facility_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_id_ulid_ck" CHECK ("facilities"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "facility_memberships" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"organization_membership_id" varchar(26) NOT NULL,
	"facility_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_memberships_id_ulid_ck" CHECK ("facility_memberships"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" DEFAULT 'MEDICAL' NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_membership_id" varchar(26),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_id_ulid_ck" CHECK ("invitations"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"face_scan_session_id" varchar(26),
	"provenance" "measurement_provenance" NOT NULL,
	"values" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"recorded_by_membership_id" varchar(26),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurements_id_ulid_ck" CHECK ("measurements"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "organization_entitlements" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"user_limit" integer,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"changed_by_membership_id" varchar(26),
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_entitlements_user_limit_ck" CHECK ("organization_entitlements"."user_limit" IS NULL OR "organization_entitlements"."user_limit" >= 0),
	CONSTRAINT "organization_entitlements_id_ulid_ck" CHECK ("organization_entitlements"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"role" "membership_role" DEFAULT 'MEDICAL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_id_ulid_ck" CHECK ("organization_memberships"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "organization_status" DEFAULT 'ACTIVE' NOT NULL,
	"logo_object_key" text,
	"primary_color" text DEFAULT '#175CD3' NOT NULL,
	"secondary_color" text DEFAULT '#0E9384' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_id_ulid_ck" CHECK ("organizations"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"home_facility_id" varchar(26),
	"encrypted_external_reference" "bytea" NOT NULL,
	"external_reference_lookup_hash" text NOT NULL,
	"date_of_birth" date,
	"sex" "patient_sex" DEFAULT 'UNKNOWN' NOT NULL,
	"encrypted_profile" "bytea" NOT NULL,
	"encryption_key_version" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_id_ulid_ck" CHECK ("patients"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "questionnaire_definitions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26),
	"scope_key" text NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"schema" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_definitions_scope_ck" CHECK (("questionnaire_definitions"."organization_id" IS NULL AND "questionnaire_definitions"."scope_key" = 'GLOBAL') OR ("questionnaire_definitions"."organization_id" IS NOT NULL AND "questionnaire_definitions"."scope_key" = "questionnaire_definitions"."organization_id"::text)),
	CONSTRAINT "questionnaire_definitions_id_ulid_ck" CHECK ("questionnaire_definitions"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "scoring_requests" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"idempotency_key" text NOT NULL,
	"external_request_id" text,
	"status" "scoring_request_status" DEFAULT 'PENDING' NOT NULL,
	"requested_version" text,
	"failure_code" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_requests_id_ulid_ck" CHECK ("scoring_requests"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "scoring_results" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"assessment_id" varchar(26) NOT NULL,
	"scoring_request_id" varchar(26) NOT NULL,
	"scoring_version" text NOT NULL,
	"rule_checksum" text NOT NULL,
	"result" jsonb NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_results_id_ulid_ck" CHECK ("scoring_results"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"status" "user_status" DEFAULT 'INVITED' NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_id_ulid_ck" CHECK ("users"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_org_answerer_fk" FOREIGN KEY ("organization_id","answered_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "public"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_assignee_fk" FOREIGN KEY ("organization_id","assigned_to_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_facility_fk" FOREIGN KEY ("organization_id","facility_id") REFERENCES "public"."facilities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_questionnaire_scope_fk" FOREIGN KEY ("questionnaire_scope_key","questionnaire_definition_id") REFERENCES "public"."questionnaire_definitions"("scope_key","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_actor_fk" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_scan_sessions" ADD CONSTRAINT "face_scan_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_scan_sessions" ADD CONSTRAINT "face_scan_sessions_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_memberships" ADD CONSTRAINT "facility_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_memberships" ADD CONSTRAINT "facility_memberships_org_membership_fk" FOREIGN KEY ("organization_id","organization_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_memberships" ADD CONSTRAINT "facility_memberships_org_facility_fk" FOREIGN KEY ("organization_id","facility_id") REFERENCES "public"."facilities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_inviter_fk" FOREIGN KEY ("organization_id","invited_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_face_scan_fk" FOREIGN KEY ("organization_id","face_scan_session_id") REFERENCES "public"."face_scan_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_recorder_fk" FOREIGN KEY ("organization_id","recorded_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_org_changer_fk" FOREIGN KEY ("organization_id","changed_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_org_home_facility_fk" FOREIGN KEY ("organization_id","home_facility_id") REFERENCES "public"."facilities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_definitions" ADD CONSTRAINT "questionnaire_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_requests" ADD CONSTRAINT "scoring_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_requests" ADD CONSTRAINT "scoring_requests_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_org_assessment_fk" FOREIGN KEY ("organization_id","assessment_id") REFERENCES "public"."assessments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_org_request_fk" FOREIGN KEY ("organization_id","scoring_request_id") REFERENCES "public"."scoring_requests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_answers_assessment_question_uidx" ON "assessment_answers" USING btree ("assessment_id","question_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_org_id_uidx" ON "assessments" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "assessments_org_status_idx" ON "assessments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "assessments_org_patient_idx" ON "assessments" USING btree ("organization_id","patient_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_occurred_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "face_scan_sessions_org_id_uidx" ON "face_scan_sessions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "face_scan_sessions_org_assessment_idx" ON "face_scan_sessions" USING btree ("organization_id","assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_org_id_uidx" ON "facilities" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_org_code_uidx" ON "facilities" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "facilities_org_idx" ON "facilities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facility_memberships_membership_facility_uidx" ON "facility_memberships" USING btree ("organization_membership_id","facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uidx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_org_email_uidx" ON "invitations" USING btree ("organization_id",lower("email")) WHERE "invitations"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "invitations_org_status_idx" ON "invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "measurements_org_assessment_idx" ON "measurements" USING btree ("organization_id","assessment_id");--> statement-breakpoint
CREATE INDEX "organization_entitlements_org_effective_idx" ON "organization_entitlements" USING btree ("organization_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_id_uidx" ON "organization_memberships" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_uidx" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_org_id_uidx" ON "patients" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_org_external_reference_hash_uidx" ON "patients" USING btree ("organization_id","external_reference_lookup_hash");--> statement-breakpoint
CREATE INDEX "patients_org_facility_idx" ON "patients" USING btree ("organization_id","home_facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_definitions_scope_id_uidx" ON "questionnaire_definitions" USING btree ("scope_key","id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_definitions_scope_key_version_uidx" ON "questionnaire_definitions" USING btree ("scope_key","key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_requests_org_id_uidx" ON "scoring_requests" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_requests_org_idempotency_uidx" ON "scoring_requests" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "scoring_requests_org_assessment_idx" ON "scoring_requests" USING btree ("organization_id","assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_results_request_uidx" ON "scoring_results" USING btree ("scoring_request_id");--> statement-breakpoint
CREATE INDEX "scoring_results_org_assessment_idx" ON "scoring_results" USING btree ("organization_id","assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE FUNCTION "enforce_organization_user_limit"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_organization_id varchar(26);
  configured_limit integer;
  consumed_seats bigint;
BEGIN
  target_organization_id := NEW.organization_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  SELECT entitlement.user_limit
    INTO configured_limit
    FROM organization_entitlements entitlement
   WHERE entitlement.organization_id = target_organization_id
     AND entitlement.effective_from <= now()
     AND (entitlement.effective_until IS NULL OR entitlement.effective_until > now())
   ORDER BY entitlement.effective_from DESC, entitlement.created_at DESC
   LIMIT 1;

  IF configured_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    (SELECT count(*) FROM organization_memberships membership
      WHERE membership.organization_id = target_organization_id AND membership.is_active)
    +
    (SELECT count(*) FROM invitations invitation
      WHERE invitation.organization_id = target_organization_id AND invitation.status = 'PENDING')
    INTO consumed_seats;

  IF consumed_seats > configured_limit THEN
    RAISE EXCEPTION 'organization user limit exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "organization_memberships_user_limit_trigger"
AFTER INSERT OR UPDATE ON organization_memberships
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "enforce_organization_user_limit"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "invitations_user_limit_trigger"
AFTER INSERT OR UPDATE ON invitations
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "enforce_organization_user_limit"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "organization_entitlements_user_limit_trigger"
AFTER INSERT OR UPDATE ON organization_entitlements
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "enforce_organization_user_limit"();
--> statement-breakpoint
CREATE FUNCTION "reject_audit_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION "reject_audit_event_mutation"();
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
