import { expect, test } from "bun:test";
import { createApp } from "./app";
import type { ApplicationService, Principal } from "./services/application";
import type { AssessmentWorkflowService } from "./services/assessment-workflow";

const actor: Principal = { userId: "01J00000000000000000000001", organizationId: "01J00000000000000000000002", membershipId: "01J00000000000000000000003", email: "qa@example.invalid", displayName: "QA", role: "MEDICAL", platformRole: "USER" };
const path = `/v1/organizations/${actor.organizationId}/assessments/01J00000000000000000000004`;
function harness() {
  let saves = 0;
  const service = { authenticate: async (token: string) => token === "valid" ? actor : null } as ApplicationService;
  const workflow = { read: async () => ({ id: "test" }), save: async (principal: Principal, org: string) => { expect(principal).toEqual(actor); expect(org).toBe(actor.organizationId); saves++; return {}; } } as unknown as AssessmentWorkflowService;
  return { app: createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service, assessmentWorkflow: workflow }), saves: () => saves };
}
test("assessment reads require a session and are never publicly cached", async () => {
  const { app } = harness();
  expect((await app.request(path)).status).toBe(401);
  const response = await app.request(path, { headers: { cookie: "niq_session=valid" } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
test("assessment mutations reject foreign origins and oversized answer bodies before the service", async () => {
  const { app, saves } = harness();
  const send = (origin: string, body = JSON.stringify({ revision: 0, answers: {} })) => app.request(path, { method: "PATCH", headers: { cookie: "niq_session=valid", origin, "content-type": "application/json" }, body });
  expect((await send("http://untrusted.invalid")).status).toBe(403);
  expect((await send("http://localhost:5173", JSON.stringify({ revision: 0, answers: { note: "x".repeat(300_000) } }))).status).toBe(413);
  expect(saves()).toBe(0);
  expect((await send("http://localhost:5173")).status).toBe(200);
  expect(saves()).toBe(1);
});

test("read routes accept assessment references but writes retain internal IDs",async()=>{
 const {app}=harness();const referencePath=path.replace(/[^/]+$/, "ASM-000001");
 expect((await app.request(referencePath,{headers:{cookie:"niq_session=valid"}})).status).toBe(200);
 expect((await app.request(referencePath,{method:"PATCH",headers:{cookie:"niq_session=valid",origin:"http://localhost:5173","content-type":"application/json"},body:JSON.stringify({revision:0,answers:{}})})).status).toBe(400);
});

test("face scan endpoints enforce session, origin and bounded upload before service access",async()=>{
 const {app}=harness();const scans=`${path}/face-scans`;
 expect((await app.request(scans)).status).toBe(401);
 const send=(endpoint:string,origin:string,body:string)=>app.request(endpoint,{method:"POST",headers:{cookie:"niq_session=valid",origin,"content-type":"application/json"},body});
 expect((await send(scans,"https://untrusted.invalid","{}")).status).toBe(403);
 expect((await send(`${scans}/01J00000000000000000000005/signal`,"http://localhost:5173","x".repeat(2*1024*1024+1))).status).toBe(413);
 // Signal requests larger than ordinary drafts reach their own JSON validation boundary.
 expect((await send(`${scans}/01J00000000000000000000005/signal`,"http://localhost:5173",JSON.stringify({extra:"x".repeat(300000)}))).status).toBe(400);
});
