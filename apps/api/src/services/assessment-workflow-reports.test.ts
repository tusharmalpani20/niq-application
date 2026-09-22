import { expect, test } from "bun:test";
import { AssessmentReportWorkflow, submissionReferencesReportFile } from "./assessment-workflow-reports";
import type { AssessmentWorkflowService } from "./assessment-workflow";

test("only exact frozen report manifest references retain an attachment", () => {
  expect(submissionReferencesReportFile({reports:[{files:[{id:"file-1"}]}]},"file-1")).toBe(true);
  for(const snapshot of [null,{}, {answers:{note:"file-1"}}, {reports:[{files:[{id:"file-10"}]}]}, {reports:[null,{files:null}]}])
    expect(submissionReferencesReportFile(snapshot,"file-1")).toBe(false);
});

function fixture(status:string, referenced:boolean) {
  let opens=0;
  const file={id:"file-1",reportId:"report-1",patientId:"patient-1",objectKey:"immutable-key",status,originalFilename:"evidence.pdf",mediaType:"application/pdf"};
  const responses=[[file],[{snapshot:{reports:referenced?[{files:[{id:file.id}]}]:[]}}]];
  const service={authorize:async()=>{},unseal:(value:unknown)=>value,db:{select:()=>({from:()=>({where:async()=>responses.shift()??[]})})},storage:{open:async()=>{opens++;return {body:"evidence"};}}};
  return {workflow:new AssessmentReportWorkflow(service as unknown as AssessmentWorkflowService), opens:()=>opens};
}

test("removed attachment remains downloadable when a frozen submission retains it", async () => {
  const {workflow,opens}=fixture("REMOVED",true);
  const result=await workflow.download({} as any,"org","assessment","report-1","file-1");
  expect(result.filename).toBe("evidence.pdf");
  expect(opens()).toBe(1);
});

test("removed attachment without frozen evidence is not downloadable", async () => {
  const {workflow,opens}=fixture("REMOVED",false);
  await expect(workflow.download({} as any,"org","assessment","report-1","file-1")).rejects.toThrow("Report file not found.");
  expect(opens()).toBe(0);
});

test("current ready attachment remains downloadable before first submission", async () => {
  const {workflow,opens}=fixture("READY",false);
  await workflow.download({} as any,"org","assessment","report-1","file-1");
  expect(opens()).toBe(1);
});
