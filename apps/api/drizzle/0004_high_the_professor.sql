CREATE TABLE "scoring_connections" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"deployment_id" varchar(26) NOT NULL,
	"encrypted_credential" "bytea" NOT NULL,
	"credential_iv" "bytea" NOT NULL,
	"key_version" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_connections_id_ulid_ck" CHECK ("scoring_connections"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "scoring_connections_deployment_id_ulid_ck" CHECK ("scoring_connections"."deployment_id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);
--> statement-breakpoint
ALTER TABLE "scoring_connections" ADD CONSTRAINT "scoring_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_connections_organization_uidx" ON "scoring_connections" USING btree ("organization_id");