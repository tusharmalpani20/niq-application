import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AssessmentPdfDownload } from "./AssessmentPdfDownload";

async function exercise(response: Response, verify: (requests: string[], downloads: string[], renderAvailability: (value: boolean) => Promise<void>) => Promise<void>, options: {pdfAvailable?: boolean} = {pdfAvailable:true}) {
  const dom = new JSDOM("<div id='root'></div>", {url:"http://localhost/"});
  const values = {window:dom.window, document:dom.window.document, navigator:dom.window.navigator, HTMLElement:dom.window.HTMLElement, Element:dom.window.Element, Node:dom.window.Node, SVGElement:dom.window.SVGElement, MutationObserver:dom.window.MutationObserver, getComputedStyle:dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT:true, fetch:globalThis.fetch};
  const previous = Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const requests:string[]=[], downloads:string[]=[];
  globalThis.fetch=(async(input,init)=>{requests.push(String(input));expect(init?.credentials).toBe("include");return response;}) as typeof fetch;
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>"blob:saved-pdf";URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(`${this.href}|${this.download}`);};
  const root=createRoot(document.getElementById("root")!);
  try {
    await act(async()=>root.render(<MemoryRouter><AssessmentPdfDownload organizationId="org-1" assessmentReference="ASM-006564" pdfAvailable={options.pdfAvailable}/></MemoryRouter>));
    await act(async()=>{document.querySelector<HTMLButtonElement>("button")!.click();await new Promise(resolve=>setTimeout(resolve,0));});
    await verify(requests,downloads,async(pdfAvailable)=>{await act(async()=>root.render(<MemoryRouter><AssessmentPdfDownload organizationId="org-1" assessmentReference="ASM-006564" pdfAvailable={pdfAvailable}/></MemoryRouter>));});
  }finally{
    await act(async()=>root.unmount());dom.window.close();URL.createObjectURL=create;URL.revokeObjectURL=revoke;
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as Record<string,unknown>)[key];}
  }
}

test("assessment list downloads the saved PDF with the assessment filename",async()=>{
 await exercise(new Response("%PDF-test",{headers:{"content-type":"application/pdf"}}),async(requests,downloads)=>{
  expect(requests).toEqual(["/api/v1/organizations/org-1/assessments/ASM-006564/generated-report/pdf"]);
  expect(downloads).toEqual(["blob:saved-pdf|NIQ-report-ASM-006564.pdf"]);
  expect(document.querySelector('[role="alert"]')).toBeNull();
 });
});

test("unavailable saved PDFs show an error and a report link without downloading",async()=>{
 await exercise(Response.json({error:{message:"The PDF is not available yet."}},{status:409}),async(requests,downloads)=>{
  expect(requests).toHaveLength(1);expect(downloads).toHaveLength(0);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("The PDF is not available yet.");
  expect(document.querySelector('a')?.getAttribute('href')).toBe('/assessments/ASM-006564');
  expect(document.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
 });
});

for (const pdfAvailable of [false, undefined]) {
 test(`PDF download stays disabled until a saved artifact is confirmed (${pdfAvailable})`, async () => {
  await exercise(new Response("%PDF-test",{headers:{"content-type":"application/pdf"}}),async(requests,downloads)=>{
   expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
   expect(requests).toHaveLength(0);
   expect(downloads).toHaveLength(0);
  },{pdfAvailable});
 });
}

test("download availability updates when the saved report becomes ready or unavailable",async()=>{
 await exercise(new Response("%PDF-test",{headers:{"content-type":"application/pdf"}}),async(requests,downloads,render)=>{
  expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  await render(true);
  expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  await act(async()=>{document.querySelector<HTMLButtonElement>("button")!.click();await new Promise(resolve=>setTimeout(resolve,0));});
  expect(requests).toHaveLength(1);expect(downloads).toHaveLength(1);
  await render(false);
  expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
 },{pdfAvailable:false});
});
