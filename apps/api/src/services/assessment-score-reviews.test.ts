import { expect, test } from "bun:test";
import { AssessmentScoreReviewService } from "./assessment-score-reviews";
import { assessmentScoreReviews, assessmentSubmissions, assessmentFaceScans } from "../db/schema";
import { AssessmentWorkflowService } from "./assessment-workflow";
import type { Principal } from "./application";
const actor={role:"DOCTOR",platformRole:"USER",organizationId:"org",membershipId:"actor-1",displayName:"First reviewer"} as Principal;
const input={reason:"Clinical review",expectedRevision:0,requestKey:"review-request-1234",targetType:"item" as const,targetId:"item",points:4};
function fixture() {
 const scans:any[]=[];
 const result={formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:true,score:3,classification:{id:"low",label:"Low",interpretation:""},components:[{id:"item",sectionId:"section",label:"Item",points:3,status:"answered"},{id:"missing",sectionId:"empty",label:"Missing",points:null,status:"unanswered"}],version:"v1",checksum:"a".repeat(64),resultReference:"result-1",calculatedAt:new Date().toISOString(),clinicalUsePermitted:true};
 const rows:any[]=[];const audits:any[]=[];
 const tx:any={select:()=>({from:(table:any)=>({where:()=>({orderBy:()=>table===assessmentSubmissions?{limit:async()=>[{id:"submission",status:"SUCCEEDED",result}]}:Promise.resolve(table===assessmentFaceScans ? [...scans] : [...rows])})})}),insert:(table:any)=>({values:async(value:any)=>{expect(table).toBe(assessmentScoreReviews);rows.push(value);}})};
 let denied=false, auditFailure=false;
 const workflow={clinicalActor:AssessmentWorkflowService.prototype.clinicalActor,db:{...tx,transaction:async(fn:any)=>{const length=rows.length;try{return await fn(tx);}catch(e){rows.splice(length);throw e;}}},authorize:async()=>{if(denied)throw new Error("denied");return {status:"SCORED"};},unseal:(value:any)=>structuredClone(value),seal:(value:any)=>structuredClone(value),audit:async(...args:any[])=>{if(auditFailure)throw new Error("audit failed");audits.push(args);}} as unknown as AssessmentWorkflowService;
 return {service:new AssessmentScoreReviewService(workflow),scans,rows,audits,result,deny:()=>denied=true,failAudit:()=>auditFailure=true};
}
test("reviews preserve original result, replay idempotently and retain all reviewers",async()=>{
 const f=fixture();const original=JSON.stringify(f.result);
 const first=await f.service.add(actor,"org","assessment",input,{requestId:"r1"});expect(first.overall.reviewedPoints).toBe(4);
 await f.service.add(actor,"org","assessment",input,{requestId:"r2"});expect(f.rows).toHaveLength(1);expect(f.audits).toHaveLength(1);
 await expect(f.service.add(actor,"org","assessment",{...input,points:5},{requestId:"r3"})).rejects.toMatchObject({code:"CONFLICT"});
 const second=await f.service.add({...actor,membershipId:"actor-2",displayName:"Second reviewer"},"org","assessment",{...input,expectedRevision:1,points:6},{requestId:"r4"});
 expect((await f.service.add(actor,"org","assessment",input,{requestId:"late-replay"})).revision).toBe(2);
 expect(second.entries.map(e=>e.actorName)).toEqual(["First reviewer","Second reviewer"]);expect(second.entries[1]?.previousPoints).toBe(4);expect(JSON.stringify(f.result)).toBe(original);
 await expect(f.service.add(actor,"org","assessment",{...input,requestKey:"stale-request-12345",points:8},{requestId:"r5"})).rejects.toMatchObject({code:"CONFLICT"});
});
test("invalid and unscored targets, no-ops and unauthorized actors cannot review",async()=>{
 const f=fixture();
 for(const delta of [{targetId:"missing"},{targetId:"unknown"},{targetType:"section" as const,targetId:"empty"},{points:3},{points:null}])await expect(f.service.add(actor,"org","assessment",{...input,...delta},{requestId:"r"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 f.deny();await expect(f.service.read(actor,"other-org","assessment")).rejects.toThrow("denied");expect(f.rows).toHaveLength(0);
});
test("audit failure rolls back review, reset is a new history entry",async()=>{
 const f=fixture();await f.service.add(actor,"org","assessment",input,{requestId:"r"});
 const restored=await f.service.add(actor,"org","assessment",{...input,requestKey:"reset-request-12345",expectedRevision:1,points:null},{requestId:"reset"});
 expect(restored.overall.reviewedPoints).toBe(3);expect(restored.entries).toHaveLength(2);
 f.failAudit();await expect(f.service.add(actor,"org","assessment",{...input,requestKey:"failed-request-12345",expectedRevision:2},{requestId:"failure"})).rejects.toThrow("audit failed");expect(f.rows).toHaveLength(2);
});


test("scan reviews retain originals and reviewers without changing questionnaire totals", async () => {
 const f=fixture();
 f.scans.push({id:"scan-1",isCurrent:true,state:"COMPLETED",projection:{id:"remote-scan-id",score:{status:"SCORED",points:8}}});
 const scanInput={...input,targetType:"scan" as const,targetId:"scan-1",points:6};
 const first=await f.service.add(actor,"org","assessment",scanInput,{requestId:"scan"});
 expect(first.scan).toEqual({id:"scan-1",niqPoints:8,reviewedPoints:6,overridden:true});
 expect(first.overall.reviewedPoints).toBe(3);
 expect(f.scans[0].projection.score.points).toBe(8);
 await f.service.add(actor,"org","assessment",scanInput,{requestId:"replay"});
 expect(f.rows).toHaveLength(1);
 await expect(f.service.add(actor,"org","assessment",{...scanInput,requestKey:"another-request-key",points:5},{requestId:"stale"})).rejects.toMatchObject({code:"CONFLICT"});
 const second=await f.service.add({...actor,membershipId:"actor-2",displayName:"Second reviewer"},"org","assessment",{...scanInput,expectedRevision:1,points:4},{requestId:"second"});
 expect(second.entries[1]?.previousPoints).toBe(6);
 expect(second.entries[1]?.actorName).toBe("Second reviewer");
 const restored=await f.service.add(actor,"org","assessment",{...scanInput,requestKey:"restore-scan-request",expectedRevision:2,points:null},{requestId:"restore"});
 expect(restored.scan?.reviewedPoints).toBe(8);
 expect(restored.overall.reviewedPoints).toBe(3);
 expect(f.audits).toHaveLength(3);
});

test("scan edits reject unavailable, previous, unknown and unscored sessions", async () => {
 const f=fixture();
 const scanInput={...input,targetType:"scan" as const,targetId:"scan-1"};
 await expect(f.service.add(actor,"org","assessment",scanInput,{requestId:"missing"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 for (const scan of [
  {id:"scan-1",isCurrent:false,state:"COMPLETED",projection:{score:{status:"SCORED",points:8}}},
  {id:"scan-1",isCurrent:true,state:"FAILED",projection:{score:{status:"SCORED",points:8}}},
  {id:"scan-1",isCurrent:true,state:"COMPLETED",projection:{score:{status:"UNAVAILABLE"}}},
  {id:"scan-2",isCurrent:true,state:"COMPLETED",projection:{score:{status:"SCORED",points:8}}},
 ]) {
  f.scans.splice(0,f.scans.length,scan);
  await expect(f.service.add(actor,"org","assessment",scanInput,{requestId:"invalid"})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 }
 expect(f.rows).toHaveLength(0);
});

for (const role of ["DOCTOR", "NUTRITIONIST", "OTHER_MEDICAL"] as const) test(`${role} can review clinical scores`, async () => {
 const f=fixture(); await f.service.add({...actor,role},"org","assessment",input,{requestId:"role"}); expect(f.rows).toHaveLength(1);
});
test("support and cross-tenant actors cannot change scores", async () => {
 const f=fixture();
 await expect(f.service.add({...actor,role:"SUPPORT"},"org","assessment",input,{requestId:"role"})).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(f.service.add(actor,"other-org","assessment",input,{requestId:"role"})).rejects.toMatchObject({code:"FORBIDDEN"});
 expect(f.rows).toHaveLength(0);
});

test("organization admins cannot perform clinical score adjustments",async()=>{const f=fixture();await expect(f.service.add({...actor,role:"ORGANIZATION_ADMIN"},"org","assessment",input,{requestId:"admin"})).rejects.toMatchObject({code:"FORBIDDEN"});});
