import { test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { projectScoreReviews, type AssessmentWorkflow, type AssessmentScoreResult, type ScoreReviewEntry } from "@niq/application-contracts";
import { AssessmentScoreReview } from "./AssessmentScoreReview";
const result: AssessmentScoreResult = {formatVersion:2,profile:"NIQ_FINAL_ASSESSMENT",complete:true,score:8,classification:{id:"low",label:"Low",interpretation:""},components:[{id:"stage",sectionId:"disease",label:"Stage",points:8,status:"answered"}],version:"V1",checksum:"a".repeat(64),resultReference:"result",calculatedAt:"2026-09-22T00:00:00.000Z",clinicalUsePermitted:true};
const record = {id:"assessment",reference:"ASM-000002",result,binding:{version:"V1",checksum:"a".repeat(64)},answers:{stage:"metastatic",patient_name:"Example Patient"},manifest:{sections:[{id:"personal_details",title:"Personal details",fields:[{id:"patient_name",label:"Patient name",kind:"text",owner:"application"}]},{id:"disease",title:"Disease status",fields:[{id:"stage",label:"Stage",owner:"scoring",options:[{id:"metastatic",label:"Metastatic"}]}]}]},progress:{answered:1,required:1,sections:[]},reports:[]} as unknown as AssessmentWorkflow;
const entry: ScoreReviewEntry = {id:"entry",revision:1,targetType:"item",targetId:"stage",previousPoints:8,points:10,reason:null,actorId:"actor",actorName:"Reviewer One",createdAt:"2026-09-22T00:00:00.000Z",resultReference:"result"};
async function harness(run:(ctx:{click:(name:string)=>Promise<void>;posts:any[]})=>Promise<void>, entries:ScoreReviewEntry[] = [], conflict=false) {
 const dom = new JSDOM("<html><body><div id='root'></div></body></html>",{url:"http://localhost",pretendToBeVisual:true});
 const values:Record<string,unknown>={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:(fn:()=>void)=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,getComputedStyle:dom.window.getComputedStyle};
 for(const key of ["FocusEvent","HTMLElement","SVGElement","Element","Node","NodeFilter","DocumentFragment","HTMLButtonElement","HTMLInputElement","HTMLTextAreaElement","HTMLSelectElement","MutationObserver"]) values[key]=(dom.window as any)[key];
 const posts:any[]=[];
 values.fetch=async (_url:string,init?:RequestInit)=>{if(init?.method==="POST"){posts.push(JSON.parse(String(init.body)));if(conflict)return Response.json({error:{message:"Changed",code:"CONFLICT"}},{status:409}); return Response.json(projectScoreReviews(result,[...entries,{...entry,id:"new",revision:entries.length+1,targetType:"overall",targetId:null,previousPoints:10,points:null}]));}return Response.json(projectScoreReviews(result,entries,{id:"local-scan-id",points:8}));};
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const root=createRoot(document.getElementById("root")!); const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
 try {await act(async()=>{root.render(<AssessmentScoreReview record={record} organizationId="org" onDirtyChange={()=>{}} renderScan={()=><p>Scan details</p>} reportsContent={<p>Report details</p>}/>);await flush();});await run({posts,click:async name=>{const button=[...document.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")??b.textContent?.trim())===name);if(!button)throw new Error(`Missing ${name}`);await act(async()=>{button.click();await flush();});}});}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as any)[key];}
}
test("unreviewed assessment hides reviewed score and history and keeps patient answers read-only",async()=>harness(async({click,posts})=>{expect(document.body.textContent).not.toContain("Reviewed score");expect(document.body.textContent).not.toContain("Score history");await click("Disease status");expect(document.body.textContent).toContain("Metastatic");expect(document.querySelectorAll("input").length).toBe(0);await click("Adjust Stage");expect(document.body.textContent).toContain("Reason *");expect(posts).toHaveLength(0);await click("Cancel");expect(document.querySelector("form")).toBeNull();}));
test("review history displays all actors and preserves original NIQ points",async()=>harness(async()=>{expect(document.body.textContent).toContain("Reviewed score");expect(document.body.textContent).toContain("Reviewer One");expect(document.body.textContent).toContain("Reviewer Two");expect(document.body.textContent).toContain("Reason not provided");expect(record.answers.stage).toBe("metastatic");expect(result.score).toBe(8);},[entry,{...entry,id:"entry2",revision:2,actorId:"actor2",actorName:"Reviewer Two",previousPoints:10,points:11}]));
test("reset appends an explicit review request rather than modifying answers",async()=>harness(async({click,posts})=>{await click("Adjust total score");await act(async()=>{const area=document.querySelector("textarea")!; area.focus(); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")!.set!.call(area,"Restore calculated total"); area.dispatchEvent(new window.Event("input",{bubbles:true})); area.dispatchEvent(new window.KeyboardEvent("keyup",{bubbles:true,key:"l"}));});await click("Restore calculated score");expect(posts).toHaveLength(1);expect(posts[0]).toMatchObject({expectedRevision:1,targetType:"overall",targetId:null,points:null});expect(posts[0]).not.toHaveProperty("answers");expect(document.body.textContent).toContain("Score change saved.");},[{...entry,targetType:"overall",targetId:null}]));
test("concurrent edits preserve the form and block blind resubmission",async()=>harness(async({click,posts})=>{await click("Adjust total score");await act(async()=>{const area=document.querySelector("textarea")!; area.focus(); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")!.set!.call(area,"Restore calculated total"); area.dispatchEvent(new window.Event("input",{bubbles:true})); area.dispatchEvent(new window.KeyboardEvent("keyup",{bubbles:true,key:"l"}));});await click("Restore calculated score");expect(document.body.textContent).toContain("Someone updated the scores");expect(document.querySelector("form")).not.toBeNull();expect(posts).toHaveLength(1);await click("Cancel");expect(document.querySelector("form")).toBeNull();},[{...entry,targetType:"overall",targetId:null}],true));


test("expanded sections show unscored answers, counts and scan/report links directly",async()=>harness(async({click})=>{
  await click("Personal details");
  expect(document.body.textContent).toContain("Patient name");
  expect(document.body.textContent).toContain("Example Patient");
  expect(document.body.textContent).not.toContain("View all answers");
  expect(document.body.textContent).not.toContain("Partial");
  expect(document.body.textContent).toContain("1/1 answered");
  expect(document.body.textContent).toContain("Face scan unavailable");
  const reports=[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Reports")!;
  expect(reports.nextElementSibling?.textContent).toBe("0 reports");
  await click("Disease status");
  const sectionButton=document.querySelector('button[aria-label="Adjust Disease status"]');
  expect(sectionButton?.textContent).toBe("");
}));

test("item edits explain when a section override preserves its total",async()=>harness(async({click})=>{
  await click("Disease status"); await click("Adjust Stage");
  expect(document.body.textContent).toContain("Changing these points will not change its total");
},[{...entry,targetType:"section",targetId:"disease"}]));

test("scan and reports expand inline and score edits stay inside their section",async()=>harness(async({click})=>{
  await click("Face scan");
  expect(document.getElementById("score-section-face_scan")?.hidden).toBe(false);
  await click("Reports");
  expect(document.getElementById("score-section-face_scan")?.hidden).toBe(true);
  expect(document.getElementById("score-section-reports")?.hidden).toBe(false);
  await click("Disease status"); await click("Adjust Stage");
  const form=document.querySelector("form")!;
  expect(document.getElementById("score-section-disease")?.contains(form)).toBe(true);
  expect(form.className).not.toContain("bg-primary");
  expect(document.querySelector('button[aria-label="Adjust total score"]')?.textContent).toBe("");
  expect(document.querySelector('button[aria-label="Adjust Stage"]')?.textContent).toBe("");
}));

test("scan matches form order, displays points and opens an audited edit inside its section",async()=>harness(async({click,posts})=>{
 const labels=[...document.querySelectorAll("button[aria-expanded]")].map(button=>button.textContent?.trim());
 expect(labels.slice(0,3)).toEqual(["Personal details","Face scan","Disease status"]);
 const edit=document.querySelector('button[aria-label="Adjust face scan score"]')!;
 expect(edit.parentElement?.parentElement?.textContent).toContain("8 pts");
 await click("Adjust face scan score");
 const section=document.getElementById("score-section-face_scan")!;
 expect(section.hidden).toBe(false);
 expect(section.contains(document.querySelector("form"))).toBe(true);
 expect(document.querySelector("textarea")?.required).toBe(true);
 expect(document.querySelector("form")?.textContent).toContain("Original score: 8 pts");
 expect(document.body.textContent).not.toContain("Reviewed score");
 expect(posts).toHaveLength(0);
}));
