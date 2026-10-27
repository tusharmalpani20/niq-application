import postgres from "postgres";

/** Run only from the trusted migration container, never the Application runtime. */
export async function provisionByocRuntimeDatabase(database: postgres.Sql, password: string) {
  if (!/^[a-f0-9]{64}$/.test(password)) throw new Error("A generated 32-byte runtime database password is required.");
  await database.begin(async tx => {
    const [current] = await tx<{ name: string }[]>`select current_database() as name`;
    const [exists] = await tx`select 1 from pg_roles where rolname='niq_app'`;
    // format(%L) quotes the secret on the server. Never print SQL or error objects.
    const [statement] = await tx<{ command: string }[]>`select format(${exists ? "ALTER ROLE" : "CREATE ROLE"}::text || ' niq_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', ${password}::text) as command`;
    await tx.unsafe(statement!.command);
    await tx`grant connect on database ${tx(current!.name)} to niq_app`;
    await tx`revoke create on schema public from public`;
    await tx`grant usage on schema public to niq_app`;
    await tx`grant select, insert, update, delete on all tables in schema public to niq_app`;
    await tx`grant usage, select on all sequences in schema public to niq_app`;
    await tx`alter default privileges in schema public grant select, insert, update, delete on tables to niq_app`;
    await tx`alter default privileges in schema public grant usage, select on sequences to niq_app`;
    await tx`grant usage on schema drizzle to niq_app`;
    await tx`grant select on drizzle.__drizzle_migrations to niq_app`;
    await tx`revoke update, delete, truncate on audit_events from niq_app`;
  });
}

if (import.meta.main) {
  let database: postgres.Sql | undefined;
  try {
    if (!process.env.DATABASE_URL) throw new Error("Migration database URL is required.");
    database = postgres(process.env.DATABASE_URL, { max: 1 });
    await provisionByocRuntimeDatabase(database, process.env.APP_DATABASE_PASSWORD ?? "");
    console.log("Restricted Application database role provisioned.");
  } catch {
    console.error("Application database role provisioning failed. Inspect the private migration configuration.");
    process.exitCode = 1;
  } finally { await database?.end(); }
}
