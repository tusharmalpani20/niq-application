import type { ApplicationConfig } from "@niq/application-config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDatabase(config: ApplicationConfig) {
  const sql = postgres(config.DATABASE_URL, {
    max: 10,
    prepare: false,
    ssl: config.DATABASE_SSL ? "require" : false,
    transform: { undefined: null },
  });

  return { db: drizzle(sql), sql };
}

export async function isDatabaseSchemaReady(sql: postgres.Sql): Promise<boolean> {
  const [result] = await sql<{ ready: boolean }[]>`
    select
      to_regclass('public.assessments') is not null
      and to_regclass('public.assessment_initializations') is not null
      and to_regclass('public.assessment_submissions') is not null
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='assessment_submissions' and column_name='failure_issues')
      and to_regclass('public.assessment_files') is not null
      and to_regclass('public.audit_events') is not null
      and to_regclass('drizzle.__drizzle_migrations') is not null
      and exists(select 1 from drizzle.__drizzle_migrations) as ready
  `;
  return result?.ready === true;
}

export type Database = ReturnType<typeof createDatabase>["db"];
