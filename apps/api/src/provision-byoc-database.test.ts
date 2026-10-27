import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { provisionByocRuntimeDatabase } from "./provision-byoc-database";
import { isDatabaseSchemaReady } from "./db/client";
import { createEntityId } from "@niq/application-domain";

const url=process.env.BYOC_TEST_DATABASE_URL;
if(url){const p=new URL(url);if(!["postgres:","postgresql:"].includes(p.protocol)||p.hostname!=="127.0.0.1"||p.port!=="55440"||p.pathname!=="/fixture_byoc"||p.search||p.hash)throw Error("Use the isolated BYOC fixture database");}
describe.skipIf(!url)("BYOC restricted runtime database role",()=>{
  const admin=postgres(url ?? "postgres://fixture_user@127.0.0.1:55440/fixture_byoc",{max:1});
  afterAll(()=>admin.end());
  test("runtime can read/write application tables but cannot administer the database or rewrite audit",async()=>{
    await provisionByocRuntimeDatabase(admin,"a".repeat(64));
    await provisionByocRuntimeDatabase(admin,"a".repeat(64));
    const [role]=await admin`select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname='niq_app'`;
    expect(Object.values(role!)).toEqual([false,false,false,false,false]);
    const p=new URL(url!);p.username="niq_app";p.password="a".repeat(64);
    const runtime=postgres(p.toString(),{max:1});
    try{
      expect(await isDatabaseSchemaReady(runtime)).toBe(true);
      const id=createEntityId();
      await runtime`insert into organizations(id,legal_name,display_name,slug) values (${id},'Runtime fixture','Runtime fixture',${id.toLowerCase()})`;
      expect((await runtime`select count(*)::int n from organizations where id=${id}`)[0]!.n).toBe(1);
      await expect((async()=>{await runtime`create table public.runtime_must_not_create(id int)`;})()).rejects.toMatchObject({code:"42501"});
      await expect((async()=>{await runtime`delete from audit_events where false`;})()).rejects.toMatchObject({code:"42501"});
      await expect((async()=>{await runtime`update drizzle.__drizzle_migrations set hash=hash where false`;})()).rejects.toMatchObject({code:"42501"});
    }finally{await runtime.end();}
  });
});
