import { expect, test } from "bun:test";
import { createApp } from "./app";
import { ServiceError } from "./services/application";
import type { ByocSetupService } from "./services/byoc-setup";

const token = "a-private-setup-token-at-least-32-characters";
const origin = "https://hospital.example.test";
const input = { organizationName:"Synthetic hospital",organizationSlug:"synthetic-hospital",adminName:"Hospital Admin",adminEmail:"admin@example.test",adminPassword:"a-long-private-password" };
function fixture() {
  let saves = 0;
  const setup = {
    authorize(supplied:string) { if (supplied!==token) throw new ServiceError("FORBIDDEN","Setup authorization failed."); },
    async status() { return {state:"pending",origin,httpsConfigured:true,scoringConfigured:true,otpDeliveryConfigured:false,expiresAt:"2026-10-28T00:00:00.000Z"}; },
    async complete() { saves++; return {organizationId:"synthetic-organization",signInRequired:true}; },
  } as unknown as ByocSetupService;
  const app=createApp({allowedOrigin:origin,authMode:"local",checkDatabase:async()=>true,byocSetup:setup});
  return {app,get saves(){return saves;}};
}
test("setup authorization and mutation origin checked before creating an account",async()=>{
  const f=fixture();
  const attempts: Record<string,string>[] = [{origin},{origin:"https://other.example.test","x-setup-token":token}];
  for(const headers of attempts){
    const r=await f.app.request("/v1/setup/complete",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(input)});
    expect(r.status).toBe(403);
  }
  expect(f.saves).toBe(0);
});
test("setup rejects role injection and oversized bodies, then accepts hospital details",async()=>{
  const f=fixture();const headers={origin,"x-setup-token":token,"content-type":"application/json"};
  const role=await f.app.request("/v1/setup/complete",{method:"POST",headers,body:JSON.stringify({...input,platformRole:"NIQ_ADMIN"})});
  expect(role.status).toBe(400);
  const huge=await f.app.request("/v1/setup/complete",{method:"POST",headers,body:JSON.stringify({...input,organizationName:"x".repeat(17000)})});
  expect(huge.status).toBe(413);expect(f.saves).toBe(0);
  const good=await f.app.request("/v1/setup/complete",{method:"POST",headers,body:JSON.stringify(input)});
  expect(good.status).toBe(201);expect(f.saves).toBe(1);
});
test("setup status is private and never returns installation secrets",async()=>{
  const f=fixture();
  expect((await f.app.request("/v1/setup/status")).status).toBe(403);
  const r=await f.app.request("/v1/setup/status",{headers:{"x-setup-token":token}});
  expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.text()).not.toContain(token);
  const unavailable=createApp({allowedOrigin:origin,authMode:"local",checkDatabase:async()=>true});
  expect((await unavailable.request("/v1/setup/status")).status).toBe(404);
});
