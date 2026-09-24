import { test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { projectScoreReviews, type AssessmentWorkflow, type AssessmentScoreResult, type ScoreReviewEntry, type AssessmentScoreReviews } from "@niq/application-contracts";
import { AssessmentScoreReview } from "./AssessmentScoreReview";
const result: AssessmentScoreResult = {formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:true,score:8,classification:{id:"low",label:"Low",interpretation:""},components:[{id:"stage",sectionId:"disease",label:"Stage",points:8,status:"answered"}],version:"V1",checksum:"a".repeat(64),resultReference:"result",calculatedAt:"2026-09-22T00:00:00.000Z",clinicalUsePermitted:true};
const record = {id:"assessment",reference:"ASM-000002",result,binding:{version:"V1",checksum:"a".repeat(64)},answers:{stage:"metastatic",patient_name:"Example Patient"},manifest:{sections:[{id:"personal_details",title:"Personal details",fields:[{id:"patient_name",label:"Patient name",kind:"text",owner:"application"}]},{id:"disease",title:"Disease status",fields:[{id:"stage",label:"Stage",owner:"scoring",options:[{id:"metastatic",label:"Metastatic"}]}]}]},progress:{answered:1,required:1,sections:[]},reports:[]} as unknown as AssessmentWorkflow;
const entry: ScoreReviewEntry = {id:"entry",revision:1,targetType:"item",targetId:"stage",previousPoints:8,points:10,reason:null,actorId:"actor",actorName:"Reviewer One",createdAt:"2026-09-22T00:00:00.000Z",resultReference:"result"};
async function harness(run:(ctx:{click:(name:string)=>Promise<void>;posts:any[]; rerender:(next:AssessmentWorkflow,canReview?:boolean,scanStatus?:string)=>Promise<void>})=>Promise<void>, entries:ScoreReviewEntry[] = [], risk?: AssessmentScoreReviews["risk"]) {
 const dom = new JSDOM("<html><body><div id='root'></div></body></html>",{url:"http://localhost",pretendToBeVisual:true});
 const values:Record<string,unknown>={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:(fn:()=>void)=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,getComputedStyle:dom.window.getComputedStyle};
 for(const key of ["FocusEvent","HTMLElement","SVGElement","Element","Node","NodeFilter","DocumentFragment","HTMLButtonElement","HTMLInputElement","HTMLTextAreaElement","HTMLSelectElement","MutationObserver"]) values[key]=(dom.window as any)[key];
 const posts:any[]=[];
 values.fetch=async (_url:string,init?:RequestInit)=>{if(init?.method==="POST"){posts.push(JSON.parse(String(init.body)));if(_url.endsWith("/classification/retry"))return Response.json({...projectScoreReviews(result,entries),risk:{status:"CONFIRMED",classification:{id:"reviewed",label:"Reviewed category",interpretation:""},resultReference:"classified",failureCode:null,canRetry:false}}); throw new Error(`Unexpected POST: ${_url}`);}return Response.json({...projectScoreReviews(result,entries,{id:"local-scan-id",points:8}),...(risk?{risk}:{})});};
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const root=createRoot(document.getElementById("root")!); const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
 try {await act(async()=>{root.render(<AssessmentScoreReview record={record} organizationId="org" renderScan={()=><p>Scan details</p>} reportsContent={<p>Report details</p>}/>);await flush();});await run({posts,rerender:async(next,canReview=true,scanStatus)=>{await act(async()=>{root.render(<AssessmentScoreReview record={next} organizationId="org" canReview={canReview} scanStatus={scanStatus} renderScan={()=><p>Scan details</p>} reportsContent={<p>Report details</p>}/>);await flush();});},click:async name=>{const button=[...document.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);if(!button)throw new Error(`Missing ${name}`);await act(async()=>{button.click();await flush();});}});}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as any)[key];}
}
test("summary keeps scored answers readable without score edit controls", async () => harness(async ({ click, posts }) => {
  expect(document.body.textContent).not.toContain("Reviewed score");
  expect(document.querySelector('[aria-label^="Adjust "]')).toBeNull();
  await click("Disease status");
  expect(document.body.textContent).toContain("Metastatic");
  expect(document.querySelector("form")).toBeNull();
  await click("Face scan");
  expect(document.getElementById("score-section-face_scan")?.hidden).toBe(false);
  await click("Reports");
  expect(document.getElementById("score-section-reports")?.hidden).toBe(false);
  expect(posts).toHaveLength(0);
}));

test("all original and reviewed scores remain visible without adjustment actions", async () => harness(async ({ click, posts }) => {
  expect(document.body.textContent).toContain("Reviewed score");
  expect(document.body.textContent).toContain("Reviewer One");
  expect(document.body.textContent).toContain("Reviewer Two");
  await click("Disease status");
  expect(document.body.textContent).toContain("Reviewed 11 pts");
  await click("Face scan");
  expect(document.body.textContent).toContain("NIQ 8 pts");
  expect(document.querySelector('[aria-label^="Adjust "]')).toBeNull();
  expect(document.querySelector("form")).toBeNull();
  expect(posts).toHaveLength(0);
}, [entry, { ...entry, id: "entry2", revision: 2, actorId: "actor2", actorName: "Reviewer Two", previousPoints: 10, points: 11 }]));

test("confirmed reviewed risk displays separately from original NIQ risk", async()=>harness(async()=>{
 expect(document.body.textContent).toContain("Reviewed category · NIQ");
 expect(document.body.textContent).toContain("Low · NIQ");
 expect(document.body.textContent).not.toContain("Risk assessment pending");
},[entry],{status:"CONFIRMED",classification:{id:"reviewed",label:"Reviewed category",interpretation:""},resultReference:"classification",failureCode:null,canRetry:false}));

test("failed risk keeps scores visible and retry fences the current result and revision", async()=>harness(async({click,posts})=>{
 expect(document.body.textContent).toContain("Risk assessment unavailable");
 expect(document.body.textContent).toContain("Your score changes are saved");
 await click("Retry risk assessment");
 expect(posts).toEqual([{expectedResultReference:"result",expectedRevision:1}]);
 expect(document.body.textContent).toContain("Reviewed category · NIQ");
 expect(document.body.textContent).not.toContain("Risk assessment unavailable");
},[entry],{status:"UNAVAILABLE",classification:null,resultReference:null,failureCode:"TIMEOUT",canRetry:true}));

test("risk retry is hidden after review access is lost", async()=>harness(async({rerender})=>{
 await rerender(record,false);
 expect(document.body.textContent).toContain("Risk assessment unavailable");
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="Retry risk assessment")).toBe(false);
},[entry],{status:"UNAVAILABLE",classification:null,resultReference:null,failureCode:"TIMEOUT",canRetry:true}));

test("pending classification never displays a previous reviewed risk", async()=>harness(async()=>{
 expect(document.body.textContent).toContain("Risk assessment pending");
 expect(document.body.textContent).toContain("Clinical review can be completed once its risk is confirmed");
 expect(document.body.textContent).not.toContain("Old category · NIQ");
},[entry],{status:"PENDING",classification:{id:"old",label:"Old category",interpretation:""},resultReference:null,failureCode:null,canRetry:false}));

test("restored questionnaire uses original risk and has no retry", async()=>harness(async()=>{
 expect(document.body.textContent).toContain("Low · NIQ (original restored)");
 expect(document.body.textContent).not.toContain("Risk assessment pending");
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="Retry risk assessment")).toBe(false);
},[entry,{...entry,id:"restore",revision:2,points:null}],{status:"ORIGINAL",classification:result.classification,resultReference:result.resultReference,failureCode:null,canRetry:false}));
