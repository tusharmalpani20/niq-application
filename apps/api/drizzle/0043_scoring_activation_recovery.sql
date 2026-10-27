CREATE TABLE "scoring_activation_attempts" (
  "organization_id" varchar(26) PRIMARY KEY NOT NULL REFERENCES "organizations"("id"),
  "token_hash" varchar(64) NOT NULL,
  "request_id" text NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scoring_activation_request_uuid_ck" CHECK ("request_id" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
);
