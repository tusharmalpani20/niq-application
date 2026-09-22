import { expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { frozenFaceScanContext, canProjectScan } from "./assessment-face-scan";
import { assessmentFaceScans } from "../db/schema";
import { faceScanSignalSchema, startFaceScanSchema, faceScanResultSchema } from "../../../../packages/contracts/src/face-scan";
test("new capture is unavailable by default",()=>expect(loadApplicationConfig({DATABASE_URL:"postgres://test",SESSION_SECRET:"test-secret-that-is-at-least-32-characters"}).FACE_SCAN_ENABLED).toBe(false));
test("snapshot derives real patient demographics and saved measurements",()=>{
 expect(frozenFaceScanContext({dateOfBirth:"1990-05-01",gender:"FEMALE"},{height_cm:170,current_weight_kg:65},"deployment:operator")).toEqual({dob:"1990-05-01",gender:"female",heightCm:170,weightKg:65,posture:"resting",employeeId:"deployment:operator"});
 for(const patient of [{dateOfBirth:null,gender:"FEMALE"},{dateOfBirth:"1990-05-01",gender:"OTHER"}])expect(()=>frozenFaceScanContext(patient,{height_cm:170,current_weight_kg:65},"operator")).toThrow();
 expect(()=>frozenFaceScanContext({dateOfBirth:"1990-05-01",gender:"MALE"},{height_cm:170},"operator")).toThrow();
});
test("start rejects caller supplied patient context and requires a saved revision",()=>{
 expect(startFaceScanSchema.safeParse({revision:2,requestKey:"test-request-key-12345",posture:"resting"}).success).toBe(true);
 expect(startFaceScanSchema.safeParse({revision:2,requestKey:"test-request-key-12345",posture:"resting",dob:"2000-01-01"}).success).toBe(false);
 expect(startFaceScanSchema.safeParse({posture:"resting"}).success).toBe(false);
});
test("bounded signal validates measured RGB shape and aligned increasing timings",()=>{
 const signal={raw_intensity:[{r:1,g:2,b:3},{r:2,g:3,b:4}],ppg_time:[0,1],average_fps:30};
 expect(faceScanSignalSchema.safeParse(signal).success).toBe(true);
 for(const changes of [{ppg_time:[1,1]},{ppg_time:[1]},{average_fps:Infinity},{raw_intensity:[[1,2,3],[2,3,4]]},{raw_intensity:Array(12001).fill({r:1,g:1,b:1}),ppg_time:Array.from({length:12001},(_,i)=>i)}])expect(faceScanSignalSchema.safeParse({...signal,...changes}).success).toBe(false);
});

test("normalized scoring result preserves provider completion evidence",()=>{
 const result={schemaVersion:1,providerScanId:"provider-id",providerCompletedAt:"2026-09-20T12:00:00+05:30",wellnessScore:60,healthRiskScore:null,vitals:{heartRate:70,oxygenSaturation:null,respiratoryRate:null,systolic:null,diastolic:null},physiologicalScore:null,mentalWellbeingScore:null};
 expect(faceScanResultSchema.parse(result).providerCompletedAt).toBe(result.providerCompletedAt);
 expect(faceScanResultSchema.safeParse({...result,providerCompletedAt:"invalid"}).success).toBe(false);
});

test("start freezes the configured staging employee and replay ignores later override changes", async () => {
 const { AssessmentFaceScanService } = await import("./assessment-face-scan");
 const { AssessmentWorkflowService } = await import("./assessment-workflow");
 for (const override of [undefined, "spoke-operator-001"]) {
  const config=loadApplicationConfig({DATABASE_URL:"postgres://unused",SESSION_SECRET:"test-secret-that-is-at-least-32-characters",FACE_SCAN_ENABLED:"true",FACE_SCAN_EMPLOYEE_ID_OVERRIDE:override});
  let stored:any;
  const tx={
   select:()=>({from:()=>({where:async()=>stored?[stored]:[]})}),
   update:()=>({set:()=>({where:async()=>{}})}),
   insert:(table:any)=>({values:(value:any)=> table!==assessmentFaceScans?Promise.resolve():({returning:async()=>{
    stored={...value,state:"REQUESTED",active:true,projection:null,failureCode:null,createdAt:new Date(),updatedAt:new Date()};return [stored];
   }})}),
  };
  const db={transaction:async(work:any)=>work(tx)};
  // Exercise the real snapshot encryption with an in-memory persistence boundary; no database or provider call.
  const workflow=new AssessmentWorkflowService({db:db as any,config,applicationService:{getPatient:async()=>({dateOfBirth:"1990-05-01",gender:"FEMALE"})} as any});
  workflow.authorize=async()=>({revision:0,cycle:0,status:"DRAFT",patientId:"patient",workflow:workflow.seal({answers:{height_cm:170,current_weight_kg:65}})}) as any;
  workflow.audit=async()=>{};
  const scans=new AssessmentFaceScanService(workflow);
  scans.transport=async()=>({identity:{origin:"https://scoring.invalid",deploymentId:"deployment",scoringOrganizationId:"client"},credential:"unused"});
  scans.reconcile=async()=>{};
  scans.row=async()=>stored;
  const actor={membershipId:"operator",role:"DOCTOR",platformRole:"USER",organizationId:"organization"} as any;
  const input={revision:0,requestKey:"test-staging-start-key",posture:"resting" as const};
  const first=await scans.start(actor,"organization","assessment",input,{requestId:"test"});
  expect(first.context.employeeId).toBe(override??"deployment:operator");
  expect(JSON.stringify(stored.snapshot)).not.toContain(first.context.employeeId);
  config.FACE_SCAN_EMPLOYEE_ID_OVERRIDE="changed-staging-operator";
  const replay=await scans.start(actor,"organization","assessment",input,{requestId:"test"});
  expect(replay.id).toBe(first.id);
  expect(replay.context.employeeId).toBe(first.context.employeeId);
 }
});

test("freezes each documented posture and rejects unsupported values", () => {
  for (const posture of ["resting", "standing", "walking", "exercising"] as const) {
    expect(startFaceScanSchema.safeParse({revision: 0, requestKey: "posture-request-key", posture}).success).toBe(true);
    expect(frozenFaceScanContext({dateOfBirth: "1990-05-01", gender: "FEMALE"}, {height_cm:170,current_weight_kg:65}, "operator", posture).posture).toBe(posture);
  }
  expect(startFaceScanSchema.safeParse({revision:0,requestKey:"posture-request-key",posture:"unknown"}).success).toBe(false);
});

test("scan recovery cannot rewrite reviewed, completed or previous-cycle evidence", () => {
 for(const status of ["DRAFT","SCORED","SCORING_PENDING","SCORING_UNAVAILABLE"]) {
  expect(canProjectScan({status,cycle:1},{cycle:1})).toBe(true);
  expect(canProjectScan({status,cycle:1},{cycle:0})).toBe(false);
 }
 for(const status of ["UNDER_REVIEW","COMPLETED","VOIDED","READY_FOR_SCORING"])
  expect(canProjectScan({status,cycle:1},{cycle:1})).toBe(false);
 expect(canProjectScan(undefined,{cycle:1})).toBe(false);
});

test("late provider completion makes no evidence write after review freezes the cycle", async () => {
 const { AssessmentFaceScanService }=await import("./assessment-face-scan");
 for(const assessment of [{status:"UNDER_REVIEW",cycle:0},{status:"COMPLETED",cycle:0},{status:"DRAFT",cycle:1}]) {
  let writes=0;
  const tx={select:()=>({from:()=>({where:()=>({for:async()=>[assessment]})})}),update:()=>{writes++;throw new Error("Frozen evidence was changed");}};
  const service=new AssessmentFaceScanService({db:{transaction:async(work:any)=>work(tx)}} as any);
  await (service as any).project({id:"scan",assessmentId:"assessment",cycle:0},{state:"COMPLETED"});
  expect(writes).toBe(0);
 }
});
