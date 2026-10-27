import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ByocSetupPage } from "./ByocSetupPage";

const status = { state: "pending", origin: "https://hospital.example", httpsConfigured: true, scoringConfigured: true,
  otpDeliveryConfigured: false, expiresAt: "2026-10-28T00:00:00.000Z" };
type Call = { url: string; init?: RequestInit };
async function withPage(response: (call: Call) => Response | Promise<Response>, verify: (body: HTMLElement, calls: Call[], submit: (values: Record<string,string>) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "https://hospital.example/setup?token=ignored-url-token" });
  const values = { window:dom.window, document:dom.window.document, navigator:dom.window.navigator,
    HTMLElement:dom.window.HTMLElement, HTMLInputElement:dom.window.HTMLInputElement, HTMLButtonElement:dom.window.HTMLButtonElement,
    SVGElement:dom.window.SVGElement, Element:dom.window.Element, Node:dom.window.Node,
    MutationObserver:dom.window.MutationObserver, FormData:dom.window.FormData, IS_REACT_ACT_ENVIRONMENT:true };
  const keys=[...Object.keys(values),"fetch"];
  const previous=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,configurable:true});
  const calls: Call[]=[];
  globalThis.fetch=(async (url: RequestInfo | URL, init?:RequestInit)=>{const call={url:String(url),init};calls.push(call);return response(call);}) as typeof fetch;
  const root=createRoot(document.getElementById("root")!);
  async function submit(fields:Record<string,string>) {
    for(const [name,value] of Object.entries(fields)) document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value=value;
    await act(async()=>{document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));});
  }
  try {
    await act(async()=>{root.render(<MemoryRouter><ByocSetupPage /></MemoryRouter>);});
    await verify(document.body,calls,submit);
    expect(dom.window.localStorage.length).toBe(0);expect(dom.window.sessionStorage.length).toBe(0);
    expect(calls.every(call=>!call.url.includes("private-key")&&!call.url.includes("ignored-url-token"))).toBe(true);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of Object.entries(previous)) { if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete(globalThis as Record<string,unknown>)[key]; }
  }
}
const valid={organizationName:"Example Hospital",organizationSlug:"example-hospital",adminName:"Hospital Admin",
  adminEmail:"admin@example.test",adminPassword:"secure-password-123",confirmPassword:"secure-password-123"};

test("setup key is entered explicitly and API errors are visible without leaking it in URLs",async()=>{
  await withPage(()=>Response.json({error:{code:"FORBIDDEN",message:"Setup key is invalid.",requestId:"setup-test"}},{status:403}),async(body,calls,submit)=>{
    expect(calls).toHaveLength(0);
    expect(body.querySelector<HTMLInputElement>("#setupToken")!.value).toBe("");
    await submit({setupToken:"private-key"});
    expect(calls[0]!.init!.headers).toEqual({"x-setup-token":"private-key"});
    expect(body.textContent).toContain("Setup key is invalid.");
  });
});

test("configuration flags do not imply live DNS or OTP readiness",async()=>{
  await withPage(()=>Response.json(status),async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});
    expect(body.textContent).toContain("Launch is blocked until production OTP delivery is configured");
    expect(body.textContent).toContain("These are configuration checks");
    expect(body.querySelector("#setupToken")).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

test("invalid details and mismatched passwords never submit the completion request",async()=>{
  await withPage(()=>Response.json(status),async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});
    await submit({...valid,adminPassword:"short",confirmPassword:"different"});
    expect(calls).toHaveLength(1);
    expect(body.textContent).toContain("Passwords must match.");
    expect(body.querySelector("#adminPassword")!.getAttribute("aria-invalid")).toBe("true");
  });
});

test("completion submits hospital/admin fields only, clears credentials and requires ordinary sign-in",async()=>{
  await withPage(call=>Response.json(call.url.endsWith("status")?status:{organizationId:"opaque",signInRequired:true},{status:call.url.endsWith("status")?200:201}),async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});await submit(valid);
    expect(calls).toHaveLength(2);
    const {confirmPassword,...input}=valid;
    expect(JSON.parse(String(calls[1]!.init!.body))).toEqual(input);
    expect(calls[1]!.init!.method).toBe("POST");
    expect(body.textContent).toContain("Initial setup is complete");
    expect(body.textContent).toContain("normal verification process");
    expect(body.querySelector("input[type=password]")).toBeNull();
    expect(body.querySelector('a[href="/sign-in"]')).not.toBeNull();
    expect(body.querySelector('a[href="/settings/scoring"]')).not.toBeNull();
  });
});

test("completed installation exposes no organization creation form",async()=>{
  await withPage(()=>Response.json({...status,state:"completed"}),async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});
    expect(body.querySelector("form")).toBeNull();expect(body.textContent).toContain("Initial setup is complete");expect(calls).toHaveLength(1);
  });
});

test("completion error remains actionable without pretending setup succeeded",async()=>{
  await withPage(call=>call.url.endsWith("status")?Response.json(status):Response.json({error:{code:"CONFLICT",message:"Setup has already completed.",requestId:"setup-test"}},{status:409}),async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});await submit(valid);
    expect(body.textContent).toContain("Setup has already completed.");expect(body.querySelector("form")).not.toBeNull();expect(calls).toHaveLength(2);
  });
});

test("pending setup check prevents duplicate requests and aborts when the page closes",async()=>{
  let signal: AbortSignal | null=null;
  await withPage(call=>{ signal=call.init!.signal as AbortSignal; return new Promise<Response>(()=>{}); },async(body,calls,submit)=>{
    await submit({setupToken:"private-key"});
    await submit({setupToken:"private-key"});
    expect(calls).toHaveLength(1);
    expect(body.textContent).toContain("Checking setup…");
    expect(body.querySelector<HTMLInputElement>("#setupToken")!.disabled).toBe(true);
  });
  expect(signal!.aborted).toBe(true);
});
