CREATE TABLE "byoc_installation_setups" (
  "id" text PRIMARY KEY NOT NULL CHECK ("id" = 'byoc'),
  "organization_id" varchar(26) NOT NULL REFERENCES "organizations"("id"),
  "admin_user_id" varchar(26) NOT NULL REFERENCES "users"("id"),
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
