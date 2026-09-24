import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ClinicalReview, ClinicalReviewer } from "@niq/application-contracts";
import { ClinicalReviewPanel } from "./ClinicalReviewPanel";

const review: ClinicalReview = { assessmentId: "assessment", revision: 4, scoreRevision: 2, cycle: 1, state: "IN_REVIEW", assignee: { membershipId: "reviewer", displayName: "Reviewer", role: "DOCTOR" }, correctionPerson: null, previousReviewer: null, defaultCorrectionPersonId: null, returnReason: null, finalRemark: null, submittedAt: null, completedAt: null, history: [], allowedActions: ["COMPLETE", "TRANSFER", "RELEASE", "RETURN_TO_DRAFT"], canAdjustScores: true, canEditDraft: false };
async function harness(run: (ctx: { click: (label: string) => Promise<void>; type: (value: string) => Promise<void>; posts: unknown[]; changed: () => number }) => Promise<void>, options: { review?: ClinicalReview; blocked?: boolean; conflict?: boolean; recipients?: () => ClinicalReviewer[] } = {}) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", {url:"http://localhost", pretendToBeVisual:true});
  const values: Record<string,unknown> = { window:dom.window, document:dom.window.document, navigator:dom.window.navigator, IS_REACT_ACT_ENVIRONMENT:true, requestAnimationFrame:(fn:()=>void)=>setTimeout(fn,0), cancelAnimationFrame:clearTimeout, getComputedStyle:dom.window.getComputedStyle };
  for (const key of ["FocusEvent","HTMLElement","SVGElement","Element","Node","NodeFilter","DocumentFragment","HTMLButtonElement","HTMLInputElement","HTMLTextAreaElement","HTMLSelectElement","MutationObserver","CustomEvent","Event"]) values[key]=(dom.window as any)[key];
  const posts: unknown[] = []; let changes = 0;
  values.fetch = async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return options.conflict ? Response.json({error:{message:"Changed"}},{status:409}) : Response.json(options.review ?? review); } return Response.json(options.recipients?.() ?? []); };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,configurable:true});
  Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
  const root = createRoot(document.getElementById("root")!);
  const flush = () => new Promise(resolve => setTimeout(resolve,0));
  try {
    await act(async () => {root.render(<ClinicalReviewPanel organizationId="org" assessmentId="assessment" review={options.review ?? review} error="" loading={false} blocked={options.blocked ?? false} onRefresh={async()=>review} onChanged={async()=>{changes++;}} onBusyChange={()=>{}}/>); await flush();});
    await run({posts,changed:()=>changes,click:async label=>{ const button=[...document.querySelectorAll("button")].filter(item=>item.textContent?.trim()===label).at(-1); expect(button).toBeDefined(); await act(async()=>{button!.click();await flush();});},type:async value=>{const input=document.querySelector("textarea")!;await act(async()=>{input.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value")!.set!.call(input,value); input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));input.dispatchEvent(new dom.window.KeyboardEvent("keyup",{bubbles:true,key:"l"}));await flush();});}});
  } finally {await act(async()=>root.unmount()); dom.window.close();for(const [key,descriptor] of Object.entries(previous)) if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
}
test("clinical actions follow server permissions and block while another edit is unfinished", async()=>harness(async()=>{
 const buttons=[...document.querySelectorAll("button")];expect(buttons.some(button=>button.textContent==="Claim review")).toBe(false);
 expect(buttons.find(button=>button.textContent==="Complete review")?.disabled).toBe(true);
}, {blocked:true}));
test("completed review has no mutation actions and displays final remark",async()=>harness(async()=>{
 expect(document.body.textContent).toContain("Final clinical remark");expect(document.body.textContent).toContain("cannot be reopened");expect(document.querySelectorAll("button").length).toBe(0);
},{review:{...review,state:"COMPLETED",allowedActions:[],finalRemark:"Final clinical remark"}}));
test("completion requires a final remark and confirms permanent completion",async()=>harness(async({click})=>{
 await click("Complete review");expect(document.body.textContent).toContain("Completion is permanent");expect(document.querySelector("textarea")?.required).toBe(true);
 expect([...document.querySelectorAll("button")].filter(b=>b.textContent==="Complete review").at(-1)?.disabled).toBe(true);
}));
test("transfer does not silently select someone and needs an eligible recipient",async()=>harness(async({click,posts})=>{
 await click("Transfer review");expect(document.body.textContent).toContain("No eligible people");expect(document.querySelector('input[role="combobox"]')?.getAttribute("value")).toBe("");expect(posts).toHaveLength(0);
}));
test("completion sends both revisions and a replay key with the required remark",async()=>harness(async({click,type,posts,changed})=>{
 await click("Complete review");await type("Review finished");await click("Complete review");
 expect(posts).toHaveLength(1);expect(posts[0]).toMatchObject({action:"COMPLETE",expectedRevision:4,expectedScoreRevision:2,remark:"Review finished"});expect((posts[0] as any).requestKey).toHaveLength(36);expect(changed()).toBe(1);
}));
test("a stale transition preserves the note and requires an explicit reload",async()=>harness(async({click,type,posts})=>{
 await click("Complete review");await type("Keep this remark");await click("Complete review");
 expect(posts).toHaveLength(1);expect(document.querySelector("textarea")?.value).toBe("Keep this remark");expect(document.body.textContent).toContain("Your entered details are preserved");
 await click("Complete review");expect(posts).toHaveLength(1);
},{conflict:true}));
test("cancel after adding a remark offers keep editing instead of silently dismissing",async()=>harness(async({click,type})=>{
 await click("Complete review");await type("Unsaved remark");await click("Cancel");expect(document.body.textContent).toContain("Discard review changes?");await click("Keep editing");expect(document.querySelector("textarea")?.value).toBe("Unsaved remark");
}));

test("reload after a recipient conflict removes people who are no longer eligible", async () => {
  let eligible = true;
  await harness(async ({ click, type, posts }) => {
    await click("Return to draft");
    expect(document.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toContain("Original creator");
    await type("Please correct these answers");
    await click("Return to draft");
    expect(posts).toHaveLength(1);
    eligible = false;
    await click("Reload review");
    expect(document.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toBe("");
    expect(document.body.textContent).toContain("No eligible people");
    expect(document.querySelector("textarea")?.value).toBe("Please correct these answers");
    await click("Return to draft");
    expect(posts).toHaveLength(1);
  }, { conflict: true, review: { ...review, defaultCorrectionPersonId: "creator" }, recipients: () => eligible ? [{ membershipId: "creator", displayName: "Original creator", role: "DOCTOR" }] : [] });
});

test("completion waits for reviewed risk confirmation while handover remains available",async()=>harness(async({click,posts})=>{
 expect(document.body.textContent).toContain("NIQ must confirm the current reviewed risk");
 const buttons=[...document.querySelectorAll("button")];
 expect(buttons.find(b=>b.textContent==="Complete review")?.disabled).toBe(true);
 expect(buttons.find(b=>b.textContent==="Transfer review")?.disabled).toBe(false);
 await click("Complete review");
 expect(document.querySelector("textarea")).toBeNull();expect(posts).toHaveLength(0);
},{review:{...review,riskClassificationPending:true}}));


test("first review after corrections says send and preserves correction-owner command", async()=>harness(async({click,posts})=>{
 expect(document.body.textContent).toContain("Ready to send for clinical review");
 expect(document.body.textContent).toContain("Scoring is complete. Reviewer can send this assessment for clinical review.");
 expect(document.body.textContent).not.toContain("Return reason");
 expect(document.body.textContent).not.toContain("Corrections assigned to:");
 expect(document.body.textContent).not.toContain("resend");
 await click("Send for clinical review");
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Send this scored assessment to the clinical review queue.");
 await click("Send for clinical review");
 expect(posts[0]).toMatchObject({action:"RESEND"});
},{review:{...review,state:"AWAITING_RESUBMISSION",correctionPerson:review.assignee,returnReason:"Previous return",allowedActions:["RESEND"]}}));

test("previously submitted review still says resend after corrections", async()=>harness(async({click})=>{
 expect(document.body.textContent).toContain("Ready to resend for clinical review");
 expect(document.body.textContent).toContain("can resend this assessment for clinical review.");
 await click("Resend for clinical review");
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Resend to the previous reviewer");
},{review:{...review,state:"AWAITING_RESUBMISSION",submittedAt:"2026-09-23T00:00:00Z",allowedActions:["RESEND"]}}));

test("return reason stays visible while corrections are needed", async()=>harness(async()=>{
 expect(document.body.textContent).toContain("Returned for correction");
 expect(document.body.textContent).toContain("Return reason");
 expect(document.body.textContent).toContain("Please correct this");
}, {review:{...review,state:"RETURNED",correctionPerson:review.assignee,returnReason:"Please correct this",allowedActions:[]}}));

test("one review history disclosure shows every event without a same-person arrow", async()=>harness(async()=>{
  const history = document.querySelector("details");
  expect(history?.querySelector("summary")?.textContent).toBe("Review history (2)");
  history?.querySelector("summary")?.click();
  expect(history?.open).toBe(true);
  const events = history?.querySelectorAll("li");
  expect(events).toHaveLength(2);
  expect(events?.[0]?.textContent).toContain("Returned for correction");
  expect(events?.[0]?.textContent).toContain("Cycle 2");
  expect(events?.[0]?.textContent).toContain("Corrections assigned to: Reviewer");
  expect(events?.[0]?.textContent).toContain("Reason: Latest correction");
  expect(events?.[1]?.textContent).toContain("Cycle 1");
  expect(history?.textContent).not.toContain("Reviewer → Reviewer");
  expect(history?.querySelector("details")).toBeNull();
}, {review:{...review,history:[
  {id:"first",action:"RETURN_TO_DRAFT",revision:1,cycle:1,actor:review.assignee!,assignee:review.assignee!,createdAt:"2026-09-23T00:00:00Z",reason:"Earlier correction"},
  {id:"second",action:"RETURN_TO_DRAFT",revision:2,cycle:2,actor:review.assignee!,assignee:review.assignee!,createdAt:"2026-09-24T00:00:00Z",reason:"Latest correction"},
]}}));
