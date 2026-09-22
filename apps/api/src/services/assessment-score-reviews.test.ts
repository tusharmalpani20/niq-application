import { expect, test } from "bun:test";
import { AssessmentScoreReviewService } from "./assessment-score-reviews";
import { assessmentScoreReviews, assessmentSubmissions } from "../db/schema";
import type { AssessmentWorkflowService } from "./assessment-workflow";
import type { Principal } from "./application";
const actor={membershipId:"actor-1",displayName:"First reviewer"} as Principal;
const input={reason:"Clinical review",expectedRevision:0,requestKey:"review-request-1234",targetType:"item" as const,targetId:"item",points:4};
function fixture() {
 const result={formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:true,score:3,classification:{id:"low",label:"Low",interpretation:""},components:[{id:"item",sectionId:"section",label:"Item",points:3,status:"answered"},{id:"missing",sectionId:"empty",label:"Missing",points:null,status:"unanswered"}],version:"v1",checksum:"a".repeat(64),resultReference:"result-1",calculatedAt:new Date().toISOString(),clinicalUsePermitted:true};
 const rows:any[]=[];const audits:any[]=[];
 const tx:any={select:()=>({from:(table:any)=>({where:()=>({orderBy:()=>table===assessmentSubmissions?{limit:async()=>[{id:"submission",status:"SUCCEEDED",result}]}:Promise.resolve([...rows])})})}),insert:(table:any)=>({values:async(value:any)=>{expect(table).toBe(assessmentScoreReviews);rows.push(value);}})};
 let denied=false, auditFailure=false;
 const workflow={db:{...tx,transaction:async(fn:any)=>{const length=rows.length;try{return await fn(tx);}catch(e){rows.splice(length);throw e;}}},authorize:async()=>{if(denied)throw new Error("denied");return {status:"SCORED"};},unseal:(value:any)=>structuredClone(value),seal:(value:any)=>structuredClone(value),audit:async(...args:any[])=>{if(auditFailure)throw new Error("audit failed");audits.push(args);}} as unknown as AssessmentWorkflowService;
 return {service:new AssessmentScoreReviewService(workflow),rows,audits,result,deny:()=>denied=true,failAudit:()=>auditFailure=true};
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
