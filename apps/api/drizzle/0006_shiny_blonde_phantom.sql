CREATE TABLE "organization_brand_assets" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"content" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_brand_assets_id_ulid_ck" CHECK ("organization_brand_assets"."id" ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "organization_brand_assets_size_ck" CHECK ("organization_brand_assets"."byte_size" > 0 AND "organization_brand_assets"."byte_size" <= 2097152),
	CONSTRAINT "organization_brand_assets_mime_ck" CHECK ("organization_brand_assets"."mime_type" IN ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "organization_brand_assets" ADD CONSTRAINT "organization_brand_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_brand_assets_org_uidx" ON "organization_brand_assets" USING btree ("organization_id");